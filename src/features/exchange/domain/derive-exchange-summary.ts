import { EXCHANGE_DIFFERENCE_WALLET_NAME } from "@/features/wallets/domain/wallet-descriptions";
import type { TransactionLedgerEntryRow } from "@/features/transactions/domain/types";

export type ExchangeEconomicSummary = {
  fromCurrencyCode: string;
  toCurrencyCode: string;
  originalAmountDisplay: string;
  convertedAmountDisplay: string;
  rateFromMemo: string | null;
};

export function rateFromExchangeMemo(
  memo: string | null | undefined,
): string | null {
  if (!memo) {
    return null;
  }
  const match = /Currency exchange @\s*([0-9]+(?:\.[0-9]+)?)/i.exec(memo);
  return match?.[1] ?? null;
}

/**
 * Derive FX economic legs from transaction detail ledger rows.
 * Excludes Exchange Difference balancing lines — does not re-aggregate money.
 */
export function deriveExchangeSummaryFromLedgerRows(
  ledgerEntries: TransactionLedgerEntryRow[],
): ExchangeEconomicSummary {
  const economicEntries = ledgerEntries.filter(
    (entry) => entry.walletName !== EXCHANGE_DIFFERENCE_WALLET_NAME,
  );

  const fromEntry = economicEntries.find(
    (entry) => entry.direction === "CREDIT",
  );
  const toEntry = economicEntries.find((entry) => entry.direction === "DEBIT");

  return {
    fromCurrencyCode: fromEntry?.currencyCode ?? "—",
    toCurrencyCode: toEntry?.currencyCode ?? "—",
    originalAmountDisplay: fromEntry?.amountDisplay ?? "—",
    convertedAmountDisplay: toEntry?.amountDisplay ?? "—",
    rateFromMemo:
      rateFromExchangeMemo(fromEntry?.memo) ??
      rateFromExchangeMemo(toEntry?.memo) ??
      rateFromExchangeMemo(
        ledgerEntries.find((entry) => rateFromExchangeMemo(entry.memo))?.memo,
      ),
  };
}
