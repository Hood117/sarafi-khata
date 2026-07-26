import "server-only";

import { findWalletById } from "@/features/wallets/repositories/wallet-repository";
import { TransactionError } from "@/features/transactions/domain/transaction-errors";
import type { PostedTransaction } from "@/features/transactions/domain/types";
import {
  manualAdjustmentSchema,
  toManualAdjustmentFieldErrors,
  type ManualAdjustmentInput,
} from "@/features/transactions/schemas/money-movement";
import { rethrowAsTransactionError } from "@/features/transactions/services/map-posting-error";
import { resolveMovementAmount } from "@/features/transactions/services/resolve-movement-amount";
import { postTransaction } from "@/features/transactions/services/post-transaction";

export type ManualAdjustmentParams = ManualAdjustmentInput & {
  createdById: string;
};

/**
 * Manual adjustment between two wallets (DEBIT one, CREDIT the other).
 * All persistence goes through the posting service.
 */
export async function adjustFunds(
  input: ManualAdjustmentParams,
): Promise<PostedTransaction> {
  const parsed = manualAdjustmentSchema.safeParse(input);

  if (!parsed.success) {
    throw new TransactionError(
      "VALIDATION",
      "Please correct the highlighted fields.",
      toManualAdjustmentFieldErrors(parsed.error),
    );
  }

  const data = parsed.data;

  if (data.debitWalletId === data.creditWalletId) {
    throw new TransactionError(
      "VALIDATION",
      "Debit and credit wallets must be different.",
      {
        creditWalletId: "Must be different from the debit wallet.",
      },
    );
  }

  const debitWallet = await findWalletById(data.debitWalletId);
  if (!debitWallet) {
    throw new TransactionError("NOT_FOUND", "Debit wallet was not found.", {
      debitWalletId: "Debit wallet was not found.",
    });
  }

  const creditWallet = await findWalletById(data.creditWalletId);
  if (!creditWallet) {
    throw new TransactionError("NOT_FOUND", "Credit wallet was not found.", {
      creditWalletId: "Credit wallet was not found.",
    });
  }

  let customerId = data.customerId;

  if (!customerId) {
    const customerIds = [
      ...new Set(
        [debitWallet, creditWallet]
          .filter((wallet) => wallet.type === "CUSTOMER" && wallet.customerId)
          .map((wallet) => wallet.customerId as string),
      ),
    ];

    if (customerIds.length === 1) {
      customerId = customerIds[0] ?? null;
    }
  }

  const { money, currencyCode } = await resolveMovementAmount(
    data.currencyCode,
    data.amount,
  );

  try {
    return await postTransaction({
      reference: data.reference,
      type: "ADJUSTMENT",
      valueDate: data.valueDate ?? new Date(),
      customerId,
      description: data.description,
      createdById: input.createdById,
      entries: [
        {
          walletId: debitWallet.id,
          currency: currencyCode,
          direction: "DEBIT",
          amount: money,
          memo: data.description ?? "Manual adjustment",
        },
        {
          walletId: creditWallet.id,
          currency: currencyCode,
          direction: "CREDIT",
          amount: money,
          memo: data.description ?? "Manual adjustment",
        },
      ],
    });
  } catch (error) {
    rethrowAsTransactionError(error);
  }
}
