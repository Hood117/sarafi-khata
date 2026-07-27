import "server-only";

import { formatCustomerLabel } from "@/features/customers/domain/format-customer-label";
import { findCustomerById } from "@/features/customers/repositories/customer-repository";
import { listLedgerEntriesByTransaction } from "@/features/ledger/repositories/ledger-repository";
import {
  isTransactionError,
  TransactionError,
} from "@/features/transactions/domain/transaction-errors";
import { getTransactionDetail } from "@/features/transactions/services/get-transaction-detail";
import { deriveTransferSummaryFromLedgerRows } from "@/features/transfers/domain/derive-transfer-summary";
import type { TransferDetail } from "@/features/transfers/domain/types";
import { findWalletById } from "@/features/wallets/repositories/wallet-repository";

/**
 * Transfer detail for a posted TRANSFER transaction.
 * Reuses `getTransactionDetail` for notes/operator/date/ledger —
 * sender/receiver labels resolve from the same ledger wallet links.
 * Does not open a second financial write or balance path.
 */
export async function getTransferDetail(id: string): Promise<TransferDetail> {
  let transaction;

  try {
    transaction = await getTransactionDetail(id);
  } catch (error) {
    if (isTransactionError(error) && error.code === "NOT_FOUND") {
      throw new TransactionError("NOT_FOUND", "Transfer was not found.");
    }
    throw error;
  }

  if (transaction.type !== "TRANSFER") {
    throw new TransactionError("NOT_FOUND", "Transfer was not found.");
  }

  const summary = deriveTransferSummaryFromLedgerRows(
    transaction.ledgerEntries,
  );

  const rawEntries = await listLedgerEntriesByTransaction(transaction.id);
  const senderEntry = rawEntries.find((entry) => entry.direction === "CREDIT");
  const receiverEntry = rawEntries.find((entry) => entry.direction === "DEBIT");

  const [senderWallet, receiverWallet] = await Promise.all([
    senderEntry
      ? findWalletById(senderEntry.walletId, { includeDeleted: true })
      : Promise.resolve(null),
    receiverEntry
      ? findWalletById(receiverEntry.walletId, { includeDeleted: true })
      : Promise.resolve(null),
  ]);

  const [senderCustomer, receiverCustomer] = await Promise.all([
    senderWallet?.customerId
      ? findCustomerById(senderWallet.customerId, { includeDeleted: true })
      : Promise.resolve(null),
    receiverWallet?.customerId
      ? findCustomerById(receiverWallet.customerId, { includeDeleted: true })
      : Promise.resolve(null),
  ]);

  return {
    id: transaction.id,
    reference: transaction.reference,
    status: transaction.status,
    statusLabel: transaction.statusLabel,
    senderName: senderCustomer
      ? formatCustomerLabel(senderCustomer.fullName, senderCustomer.code)
      : null,
    receiverName: receiverCustomer
      ? formatCustomerLabel(receiverCustomer.fullName, receiverCustomer.code)
      : null,
    currencyCode: summary.currencyCode,
    amountDisplay: summary.amountDisplay,
    notes: transaction.notes,
    operatorName: transaction.operatorName,
    valueDate: transaction.valueDate,
    relatedTransaction: transaction,
    ledgerEntries: transaction.ledgerEntries,
  };
}
