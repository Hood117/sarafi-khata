import "server-only";

import type { Currency } from "@/generated/prisma/client";
import {
  formatRateDisplay,
  normalizeRateString,
} from "@/features/exchange-rates/domain/rate";
import { findLatestExchangeRate } from "@/features/ledger";
import { invertRateString } from "@/features/transactions/domain/exchange-rate-math";
import { TransactionError } from "@/features/transactions/domain/transaction-errors";

export type DealExchangeRateSource = "market" | "manual";

export type ResolvedDealExchangeRate = {
  /** To-currency units per 1 from-currency unit. */
  rate: string;
  rateSource: DealExchangeRateSource;
  /** Active Settings catalog rate used (when market), before snapshotting. */
  catalogRateId: string | null;
};

type ResolveDealExchangeRateInput = {
  fromCurrency: Currency;
  toCurrency: Currency;
  valueDate: Date;
  allowManualRateOverride: boolean;
  manualRate?: string | null;
};

/**
 * Resolve the deal rate for an exchange.
 * Default: latest active Settings rate (from→to, or inverted to→from).
 * Optional: manual override when business rule flag is enabled.
 */
export async function resolveDealExchangeRate(
  input: ResolveDealExchangeRateInput,
): Promise<ResolvedDealExchangeRate> {
  const {
    fromCurrency,
    toCurrency,
    valueDate,
    allowManualRateOverride,
    manualRate,
  } = input;

  if (manualRate != null && manualRate !== "") {
    if (!allowManualRateOverride) {
      throw new TransactionError(
        "VALIDATION",
        "Manual rate override is not enabled for this exchange.",
        {
          manualRate:
            "Manual rate override is not enabled for this exchange.",
        },
      );
    }

    try {
      const rate = normalizeRateString(manualRate);
      if (!(Number(rate) > 0)) {
        throw new Error("Rate must be greater than zero.");
      }
      return {
        rate,
        rateSource: "manual",
        catalogRateId: null,
      };
    } catch (error) {
      throw new TransactionError(
        "VALIDATION",
        error instanceof Error
          ? error.message
          : "Exchange rate must be greater than zero.",
        {
          manualRate:
            error instanceof Error
              ? error.message
              : "Exchange rate must be greater than zero.",
        },
      );
    }
  }

  const direct = await findLatestExchangeRate({
    baseCurrencyId: fromCurrency.id,
    quoteCurrencyId: toCurrency.id,
    asOf: valueDate,
  });

  if (direct) {
    return {
      rate: formatRateDisplay(direct.rate),
      rateSource: "market",
      catalogRateId: direct.id,
    };
  }

  const inverse = await findLatestExchangeRate({
    baseCurrencyId: toCurrency.id,
    quoteCurrencyId: fromCurrency.id,
    asOf: valueDate,
  });

  if (inverse) {
    return {
      rate: invertRateString(formatRateDisplay(inverse.rate)),
      rateSource: "market",
      catalogRateId: inverse.id,
    };
  }

  throw new TransactionError(
    "NOT_FOUND",
    `No active exchange rate found for ${fromCurrency.code}/${toCurrency.code}. Set a rate in Settings → Exchange Rates.`,
    {
      fromCurrencyCode: "No active exchange rate for this pair.",
      toCurrencyCode: "No active exchange rate for this pair.",
    },
  );
}
