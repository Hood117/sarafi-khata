import "server-only";

import { findWalletById } from "@/features/wallets/repositories/wallet-repository";
import { TransactionError } from "@/features/transactions/domain/transaction-errors";
import type { PostedTransaction } from "@/features/transactions/domain/types";
import {
  toWithdrawalFieldErrors,
  withdrawalSchema,
  type WithdrawalInput,
} from "@/features/transactions/schemas/money-movement";
import { rethrowAsTransactionError } from "@/features/transactions/services/map-posting-error";
import { resolveMovementAmount } from "@/features/transactions/services/resolve-movement-amount";
import { postTransaction } from "@/features/transactions/services/post-transaction";

export type WithdrawalParams = WithdrawalInput & {
  createdById: string;
};

/**
 * Customer withdrawal: decreases the customer wallet balance (CREDIT) and
 * increases the cash wallet (DEBIT) under the ledger asset convention.
 * All persistence goes through the posting service.
 */
export async function withdrawFunds(
  input: WithdrawalParams,
): Promise<PostedTransaction> {
  const parsed = withdrawalSchema.safeParse(input);

  if (!parsed.success) {
    throw new TransactionError(
      "VALIDATION",
      "Please correct the highlighted fields.",
      toWithdrawalFieldErrors(parsed.error),
    );
  }

  const data = parsed.data;

  if (data.customerWalletId === data.cashWalletId) {
    throw new TransactionError(
      "VALIDATION",
      "Customer wallet and cash wallet must be different.",
      {
        cashWalletId: "Must be different from the customer wallet.",
      },
    );
  }

  const customerWallet = await findWalletById(data.customerWalletId);
  if (!customerWallet) {
    throw new TransactionError("NOT_FOUND", "Customer wallet was not found.", {
      customerWalletId: "Customer wallet was not found.",
    });
  }

  if (customerWallet.type !== "CUSTOMER" || !customerWallet.customerId) {
    throw new TransactionError(
      "VALIDATION",
      "Withdrawal requires a customer wallet.",
      { customerWalletId: "Select a customer wallet." },
    );
  }

  const cashWallet = await findWalletById(data.cashWalletId);
  if (!cashWallet) {
    throw new TransactionError("NOT_FOUND", "Cash wallet was not found.", {
      cashWalletId: "Cash wallet was not found.",
    });
  }

  if (cashWallet.type !== "VAULT" && cashWallet.type !== "TILL") {
    throw new TransactionError(
      "VALIDATION",
      "Withdrawal cash side must be a vault or till wallet.",
      { cashWalletId: "Select a vault or till wallet." },
    );
  }

  const { money, currencyCode } = await resolveMovementAmount(
    data.currencyCode,
    data.amount,
  );

  try {
    return await postTransaction({
      reference: data.reference,
      type: "WITHDRAWAL",
      valueDate: data.valueDate ?? new Date(),
      customerId: customerWallet.customerId,
      description: data.description,
      createdById: input.createdById,
      entries: [
        {
          walletId: customerWallet.id,
          currency: currencyCode,
          direction: "CREDIT",
          amount: money,
          memo: "Customer withdrawal",
        },
        {
          walletId: cashWallet.id,
          currency: currencyCode,
          direction: "DEBIT",
          amount: money,
          memo: "Customer withdrawal",
        },
      ],
    });
  } catch (error) {
    rethrowAsTransactionError(error);
  }
}
