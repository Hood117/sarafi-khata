import {
  formatRateDisplay,
  isPositiveRateString,
} from "@/features/exchange-rates/domain/rate";
import { invertRateString } from "@/features/transactions/domain/exchange-rate-math";
import type { ExchangeRateOption } from "@/features/exchange/domain/types";

export type BoardExchangeOperation = "multiply" | "divide";

export type BoardExchangeRate = {
  /** Settings board rate: quote units per 1 base unit. */
  boardRate: string;
  baseCurrencyCode: string;
  quoteCurrencyCode: string;
  rateId: string;
  /**
   * How the from→to conversion uses the board rate:
   * - multiply: from is base, to is quote (e.g. USD → AFN)
   * - divide: from is quote, to is base (e.g. AFN → USD)
   */
  operation: BoardExchangeOperation;
  /** Deal rate for posting math: to-currency units per 1 from-currency unit. */
  dealRateToPerFrom: string;
  /** Counter label, e.g. "1 USD = 70 AFN". */
  displayLabel: string;
  operationHint: string;
};

/**
 * Resolve the Settings board rate for a from/to pair and whether conversion
 * multiplies or divides.
 *
 * Convention (ADR-021): rate = quote per 1 base.
 * Example stored as base USD / quote AFN / rate 70:
 * - USD → AFN: multiply by 70
 * - AFN → USD: divide by 70
 */
export function resolveBoardExchangeRate(
  rates: ExchangeRateOption[],
  fromCurrencyCode: string,
  toCurrencyCode: string,
): BoardExchangeRate | null {
  const from = fromCurrencyCode.trim().toUpperCase();
  const to = toCurrencyCode.trim().toUpperCase();

  if (!from || !to || from === to) {
    return null;
  }

  const asBaseToQuote = rates.find(
    (rate) =>
      rate.baseCurrencyCode === from && rate.quoteCurrencyCode === to,
  );
  if (asBaseToQuote && isPositiveRateString(asBaseToQuote.rate)) {
    const boardRate = formatRateDisplay({
      toString: () => asBaseToQuote.rate,
    });
    return {
      boardRate,
      baseCurrencyCode: from,
      quoteCurrencyCode: to,
      rateId: asBaseToQuote.id,
      operation: "multiply",
      dealRateToPerFrom: boardRate,
      displayLabel: `1 ${from} = ${boardRate} ${to}`,
      operationHint: `${from} → ${to}: multiply by rate`,
    };
  }

  const asQuoteToBase = rates.find(
    (rate) =>
      rate.baseCurrencyCode === to && rate.quoteCurrencyCode === from,
  );
  if (asQuoteToBase && isPositiveRateString(asQuoteToBase.rate)) {
    const boardRate = formatRateDisplay({
      toString: () => asQuoteToBase.rate,
    });
    return {
      boardRate,
      baseCurrencyCode: to,
      quoteCurrencyCode: from,
      rateId: asQuoteToBase.id,
      operation: "divide",
      dealRateToPerFrom: invertRateString(boardRate),
      displayLabel: `1 ${to} = ${boardRate} ${from}`,
      operationHint: `${from} → ${to}: divide by rate`,
    };
  }

  return null;
}
