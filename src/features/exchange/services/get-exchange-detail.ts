import "server-only";

import { deriveExchangeSummaryFromLedgerRows } from "@/features/exchange/domain/derive-exchange-summary";
import type { ExchangeDetail } from "@/features/exchange/domain/types";
import { formatRateDisplay } from "@/features/exchange-rates/domain/rate";
import { listLedgerEntriesByTransaction } from "@/features/ledger/repositories/ledger-repository";
import { findExchangeRateById } from "@/features/ledger/repositories/exchange-rate-repository";
import {
  isTransactionError,
  TransactionError,
} from "@/features/transactions/domain/transaction-errors";
import { getTransactionDetail } from "@/features/transactions/services/get-transaction-detail";

/**
 * Exchange detail for a posted EXCHANGE transaction.
 * Reuses `getTransactionDetail` for customer/notes/operator/date/ledger —
 * FX summary fields are derived from those ledger rows (plus the linked rate).
 * Does not open a second financial write or balance path.
 */
export async function getExchangeDetail(id: string): Promise<ExchangeDetail> {
  let transaction;

  try {
    transaction = await getTransactionDetail(id);
  } catch (error) {
    if (isTransactionError(error) && error.code === "NOT_FOUND") {
      throw new TransactionError("NOT_FOUND", "Exchange was not found.");
    }
    throw error;
  }

  if (transaction.type !== "EXCHANGE") {
    throw new TransactionError("NOT_FOUND", "Exchange was not found.");
  }

  const summary = deriveExchangeSummaryFromLedgerRows(
    transaction.ledgerEntries,
    transaction.notes,
  );

  // Prefer the immutable snapshot rate linked on ledger lines.
  const rawEntries = await listLedgerEntriesByTransaction(transaction.id);
  const rateId =
    rawEntries.find((entry) => entry.exchangeRateId)?.exchangeRateId ?? null;
  let exchangeRateDisplay = summary.rateFromMemo ?? "—";

  if (rateId) {
    const rate = await findExchangeRateById(rateId, { includeDeleted: true });
    if (rate) {
      exchangeRateDisplay = formatRateDisplay(rate.rate);
    }
  }

  return {
    id: transaction.id,
    reference: transaction.reference,
    status: transaction.status,
    statusLabel: transaction.statusLabel,
    customerName: transaction.customerName,
    fromCurrencyCode: summary.fromCurrencyCode,
    toCurrencyCode: summary.toCurrencyCode,
    originalAmountDisplay: summary.originalAmountDisplay,
    exchangeRateDisplay,
    convertedAmountDisplay: summary.convertedAmountDisplay,
    notes: transaction.notes,
    operatorName: transaction.operatorName,
    valueDate: transaction.valueDate,
    relatedTransaction: transaction,
    ledgerEntries: transaction.ledgerEntries,
  };
}
