import "server-only";

import type { HawalaDirection, HawalaTransfer } from "@/generated/prisma/client";
import type { CurrencyCode, Money } from "@/features/ledger/domain";
import { HawalaError } from "@/features/hawala/domain/errors";
import { markHawalaCompleted } from "@/features/hawala/repositories/hawala-repository";
import { rethrowAsHawalaError } from "@/features/hawala/services/map-posting-error";
import { isPostingError } from "@/features/transactions/domain/errors";
import { findTransactionByReference } from "@/features/transactions/repositories/transaction-repository";
import { postTransaction } from "@/features/transactions/services/post-transaction";

type PostHawalaMovementParams = {
  hawala: HawalaTransfer;
  direction: HawalaDirection;
  currencyCode: CurrencyCode;
  money: Money;
  createdById: string;
};

async function linkExistingPostedTransaction(
  hawala: HawalaTransfer,
): Promise<HawalaTransfer | null> {
  const existing = await findTransactionByReference(hawala.reference);
  if (!existing || existing.type !== "HAWALA") {
    return null;
  }

  return markHawalaCompleted(
    hawala.id,
    existing.id,
    existing.postedAt ?? new Date(),
  );
}

/**
 * Posts the cash ↔ clearing legs for a hawala transfer through the shared
 * posting service. Does not write LedgerEntry rows directly.
 *
 * SEND: DEBIT cash (in), CREDIT clearing
 * RECEIVE: DEBIT clearing, CREDIT cash (out)
 *
 * Idempotent recovery: if a HAWALA transaction with the same reference already
 * exists (e.g. post succeeded but status update failed), links it instead of
 * posting again.
 */
export async function postHawalaMovement(
  params: PostHawalaMovementParams,
): Promise<HawalaTransfer> {
  const { hawala, direction, currencyCode, money, createdById } = params;

  if (hawala.status !== "PENDING" || hawala.transactionId) {
    throw new HawalaError(
      "INVALID_STATUS",
      "Only pending hawala transfers without a linked transaction can be posted.",
    );
  }

  const alreadyLinked = await linkExistingPostedTransaction(hawala);
  if (alreadyLinked) {
    return alreadyLinked;
  }

  const isSend = direction === "SEND";
  const memo = isSend ? "Hawala send" : "Hawala receive";

  try {
    const posted = await postTransaction({
      reference: hawala.reference,
      type: "HAWALA",
      valueDate: hawala.valueDate,
      customerId: hawala.customerId,
      description: hawala.notes,
      createdById,
      entries: [
        {
          walletId: isSend ? hawala.cashWalletId : hawala.clearingWalletId,
          currency: currencyCode,
          direction: "DEBIT",
          amount: money,
          memo,
        },
        {
          walletId: isSend ? hawala.clearingWalletId : hawala.cashWalletId,
          currency: currencyCode,
          direction: "CREDIT",
          amount: money,
          memo,
        },
      ],
    });

    return markHawalaCompleted(
      hawala.id,
      posted.id,
      posted.postedAt ?? new Date(),
    );
  } catch (error) {
    if (isPostingError(error) && error.code === "CONFLICT") {
      const recovered = await linkExistingPostedTransaction(hawala);
      if (recovered) {
        return recovered;
      }
    }

    rethrowAsHawalaError(error);
  }
}
