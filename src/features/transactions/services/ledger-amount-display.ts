import {
  createCurrency,
  moneyFromMajorUnits,
} from "@/features/ledger/domain";

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
): { currencyDisplay: string; amountDisplay: string } {
  if (entries.length === 0) {
    return { currencyDisplay: "—", amountDisplay: "—" };
  }

  const debitTotals = new Map<
    string,
    { code: string; minor: bigint; decimals: number }
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
      minor: BigInt(0),
      decimals: currency.decimalPlaces,
    };
    current.minor += minor;
    debitTotals.set(currency.code, current);
  }

  const totals = [...debitTotals.values()];

  if (totals.length === 0) {
    return { currencyDisplay: "—", amountDisplay: "—" };
  }

  if (totals.length === 1) {
    const only = totals[0]!;
    return {
      currencyDisplay: only.code,
      amountDisplay: formatMinorUnits(only.minor, only.decimals),
    };
  }

  return {
    currencyDisplay: "Multiple",
    amountDisplay: "—",
  };
}
