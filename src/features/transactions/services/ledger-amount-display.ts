import {
  createCurrency,
  moneyFromMajorUnits,
} from "@/features/ledger/domain";
import {
  formatCurrencyLabel,
  formatMoneyWithCurrency,
} from "@/features/transactions/domain/currency-display";

export function formatMinorUnits(
  amountMinor: bigint,
  decimalPlaces: number,
): string {
  const negative = amountMinor < BigInt(0);
  const absolute = negative ? -amountMinor : amountMinor;
  const digits = absolute.toString().padStart(decimalPlaces + 1, "0");

  if (decimalPlaces === 0) {
    return `${negative ? "-" : ""}${digits}`;
  }

  const whole = digits.slice(0, -decimalPlaces) || "0";
  const fraction = digits.slice(-decimalPlaces);
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

export function prismaAmountToMajorString(amount: {
  toString(): string;
}): string {
  const raw = amount.toString();
  if (!/^-?\d+(\.\d+)?$/.test(raw)) {
    return "0";
  }
  return raw;
}

export function formatPrismaAmount(
  amount: { toString(): string },
  currency: {
    code: string;
    name: string;
    symbol: string | null;
    decimalPlaces: number;
  },
): string | null {
  try {
    const domainCurrency = createCurrency({
      code: currency.code,
      name: currency.name,
      symbol: currency.symbol ?? undefined,
      decimalPlaces: currency.decimalPlaces,
    });
    const money = moneyFromMajorUnits(
      prismaAmountToMajorString(amount),
      domainCurrency,
    );
    return formatMinorUnits(money.amountMinor, currency.decimalPlaces);
  } catch {
    return null;
  }
}

export function summarizeDebitTotals(
  entries: Array<{
    direction: string;
    currencyId: string;
    amount: { toString(): string };
  }>,
  currenciesById: Map<
    string,
    {
      code: string;
      name: string;
      symbol: string | null;
      decimalPlaces: number;
    }
  >,
): {
  currencyDisplay: string;
  amountDisplay: string;
  debitTotals: Array<{
    currencyCode: string;
    currencySymbol: string | null;
    amountDisplay: string;
    amountMinor: string;
    decimalPlaces: number;
  }>;
} {
  if (entries.length === 0) {
    return { currencyDisplay: "—", amountDisplay: "—", debitTotals: [] };
  }

  const debitTotals = new Map<
    string,
    { code: string; symbol: string | null; minor: bigint; decimals: number }
  >();

  for (const entry of entries) {
    if (entry.direction !== "DEBIT") {
      continue;
    }

    const currency = currenciesById.get(entry.currencyId);
    if (!currency) {
      continue;
    }

    const domainCurrency = createCurrency({
      code: currency.code,
      name: currency.name,
      symbol: currency.symbol ?? undefined,
      decimalPlaces: currency.decimalPlaces,
    });

    let minor = BigInt(0);
    try {
      minor = moneyFromMajorUnits(
        prismaAmountToMajorString(entry.amount),
        domainCurrency,
      ).amountMinor;
    } catch {
      continue;
    }

    const current = debitTotals.get(currency.code) ?? {
      code: currency.code,
      symbol: currency.symbol,
      minor: BigInt(0),
      decimals: currency.decimalPlaces,
    };
    current.minor += minor;
    current.symbol = currency.symbol;
    debitTotals.set(currency.code, current);
  }

  const totals = [...debitTotals.values()].map((total) => ({
    currencyCode: total.code,
    currencySymbol: total.symbol,
    amountDisplay: formatMinorUnits(total.minor, total.decimals),
    amountMinor: total.minor.toString(),
    decimalPlaces: total.decimals,
  }));

  if (totals.length === 0) {
    return { currencyDisplay: "—", amountDisplay: "—", debitTotals: [] };
  }

  if (totals.length === 1) {
    const only = totals[0]!;
    return {
      currencyDisplay: formatCurrencyLabel({
        code: only.currencyCode,
        symbol: only.currencySymbol,
      }),
      amountDisplay: formatMoneyWithCurrency({
        code: only.currencyCode,
        symbol: only.currencySymbol,
        amountDisplay: only.amountDisplay,
      }),
      debitTotals: totals,
    };
  }

  return {
    currencyDisplay: totals
      .map((total) =>
        formatCurrencyLabel({
          code: total.currencyCode,
          symbol: total.currencySymbol,
        }),
      )
      .join(", "),
    amountDisplay: totals
      .map((total) =>
        formatMoneyWithCurrency({
          code: total.currencyCode,
          symbol: total.currencySymbol,
          amountDisplay: total.amountDisplay,
        }),
      )
      .join(" · "),
    debitTotals: totals,
  };
}
