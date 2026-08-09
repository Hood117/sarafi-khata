import "server-only";

import { queueAutoBackup } from "@/features/backup/services/auto-backup";
import { CustomerError } from "@/features/customers/domain/errors";
import { findCustomerById } from "@/features/customers/repositories/customer-repository";
import { isTransactionError } from "@/features/transactions/domain/transaction-errors";
import { postOpeningWalletMoney } from "@/features/transactions/services/post-opening-wallet-money";
import { listWallets } from "@/features/wallets/repositories/wallet-repository";

export type AddCustomerWalletMoneyInput = {
  customerId: string;
  currencyCode: string;
  amount: string;
  actorUserId: string;
};

/**
 * Customer gives wallet money to Saraf again (any time after create).
 * Increases customer wallet and shop cash via opening-equity posting.
 */
export async function addCustomerWalletMoney(
  input: AddCustomerWalletMoneyInput,
) {
  const customer = await findCustomerById(input.customerId);
  if (!customer || customer.deletedAt) {
    throw new CustomerError("NOT_FOUND", "Customer was not found.");
  }

  if (!customer.isActive) {
    throw new CustomerError(
      "VALIDATION",
      "Cannot add wallet money to an inactive customer.",
    );
  }

  const amount = input.amount.trim();
  if (!amount || Number(amount) <= 0) {
    throw new CustomerError(
      "VALIDATION",
      "Amount must be greater than zero.",
      { openingBalanceAmount: "Amount must be greater than zero." },
    );
  }

  const currencyCode = input.currencyCode.trim().toUpperCase();
  if (!currencyCode) {
    throw new CustomerError(
      "VALIDATION",
      "Currency is required.",
      { openingBalanceCurrencyCode: "Currency is required." },
    );
  }

  const wallets = await listWallets({
    customerId: customer.id,
    type: "CUSTOMER",
    isActive: true,
  });
  const customerWallet = wallets[0];
  if (!customerWallet) {
    throw new CustomerError(
      "VALIDATION",
      "Customer wallet was not found.",
      { openingBalanceAmount: "Customer wallet was not found." },
    );
  }

  try {
    const transaction = await postOpeningWalletMoney({
      customerId: customer.id,
      customerWalletId: customerWallet.id,
      currencyCode,
      amount,
      createdById: input.actorUserId,
      customerName: customer.fullName,
    });

    queueAutoBackup("customer-wallet-money");
    return { customer, transaction };
  } catch (error) {
    if (isTransactionError(error)) {
      throw new CustomerError(
        "VALIDATION",
        error.message || "Unable to post wallet money.",
        {
          openingBalanceAmount:
            error.fieldErrors?.amount ??
            error.message ??
            "Unable to post wallet money.",
          openingBalanceCurrencyCode: error.fieldErrors?.currencyCode,
        },
      );
    }
    throw error;
  }
}
