import { EXCHANGE_DIFFERENCE_WALLET_NAME } from "@/features/wallets/domain/wallet-descriptions";
import type { TransactionLedgerEntryRow } from "@/features/transactions/domain/types";

export type ExchangeEconomicSummary = {
  fromCurrencyCode: string;
  toCurrencyCode: string;
  originalAmountDisplay: string;
  convertedAmountDisplay: string;
  rateFromMemo: string | null;
};

export type ParsedExchangeDescription = {
  fromAmount: string;
  fromCurrencyCode: string;
  toAmount: string;
  toCurrencyCode: string;
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
 * Parse the standard exchange description written by `exchangeFunds`.
 * Used so from/to stay correct for both customer and walk-in ledger directions.
 */
export function parseExchangeDescription(
  description: string | null | undefined,
): ParsedExchangeDescription | null {
  if (!description) {
    return null;
  }

  const match =
    /Currency exchange:\s*([0-9]+(?:\.[0-9]+)?)\s+([A-Z]{3,8})\s*→\s*([0-9]+(?:\.[0-9]+)?)\s+([A-Z]{3,8})/i.exec(
      description,
    );

  if (!match) {
    return null;
  }

  return {
    fromAmount: match[1]!,
    fromCurrencyCode: match[2]!.toUpperCase(),
    toAmount: match[3]!,
    toCurrencyCode: match[4]!.toUpperCase(),
  };
}

/**
 * Derive FX economic legs from transaction detail ledger rows.
 * Excludes Exchange Difference balancing lines — does not re-aggregate money.
 *
 * Prefers currency codes from the posted description when present so walk-in
 * cash legs (DEBIT from / CREDIT to) and customer legs (CREDIT from / DEBIT to)
 * both resolve correctly.
 */
export function deriveExchangeSummaryFromLedgerRows(
  ledgerEntries: TransactionLedgerEntryRow[],
  description?: string | null,
): ExchangeEconomicSummary {
  const economicEntries = ledgerEntries.filter(
    (entry) => entry.walletName !== EXCHANGE_DIFFERENCE_WALLET_NAME,
  );

  const parsed = parseExchangeDescription(description);
  if (parsed) {
    const fromEntry = economicEntries.find(
      (entry) => entry.currencyCode === parsed.fromCurrencyCode,
    );
    const toEntry = economicEntries.find(
      (entry) => entry.currencyCode === parsed.toCurrencyCode,
    );

    return {
      fromCurrencyCode: parsed.fromCurrencyCode,
      toCurrencyCode: parsed.toCurrencyCode,
      originalAmountDisplay: fromEntry?.amountDisplay ?? parsed.fromAmount,
      convertedAmountDisplay: toEntry?.amountDisplay ?? parsed.toAmount,
      rateFromMemo:
        rateFromExchangeMemo(fromEntry?.memo) ??
        rateFromExchangeMemo(toEntry?.memo) ??
        rateFromExchangeMemo(
          ledgerEntries.find((entry) => rateFromExchangeMemo(entry.memo))
            ?.memo,
        ),
    };
  }

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

/** Display label for registered customer or walk-in party on exchange rows. */
export function formatExchangePartyLabel(input: {
  customerName: string | null;
  walkInName?: string | null;
  walkInPhone?: string | null;
}): string | null {
  if (input.customerName?.trim()) {
    return input.customerName.trim();
  }

  const name = input.walkInName?.trim() ?? "";
  const phone = input.walkInPhone?.trim() ?? "";
  if (name && phone) {
    return `${name} (${phone})`;
  }
  if (name) {
    return name;
  }
  if (phone) {
    return phone;
  }

  return null;
}
