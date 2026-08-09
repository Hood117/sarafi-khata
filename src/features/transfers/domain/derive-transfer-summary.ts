import type { TransactionLedgerEntryRow } from "@/features/transactions/domain/types";

export type TransferEconomicSummary = {
  currencyCode: string;
  amountDisplay: string;
};

/**
 * Derive transfer amount/currency from transaction detail ledger rows.
 * Sender leg = CREDIT; receiver leg = DEBIT. Does not re-aggregate money.
 */
export function deriveTransferSummaryFromLedgerRows(
  ledgerEntries: TransactionLedgerEntryRow[],
): TransferEconomicSummary {
  const senderEntry = ledgerEntries.find(
    (entry) => entry.direction === "CREDIT",
  );
  const receiverEntry = ledgerEntries.find(
    (entry) => entry.direction === "DEBIT",
  );
  const amountEntry = senderEntry ?? receiverEntry;

  return {
    currencyCode: amountEntry?.currencyCode ?? "—",
    amountDisplay: amountEntry?.amountDisplay ?? "—",
  };
}
