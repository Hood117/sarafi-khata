import "server-only";

import {
  createBalanceCalculator,
  createCurrency,
  isLedgerDirection,
  listCurrencies,
  listLedgerEntriesByWallet,
  moneyFromMajorUnits,
  type LedgerEntryInput,
} from "@/features/ledger";
import type { CurrencyBalanceDisplay } from "@/features/wallets/domain/types";

function prismaAmountToMajorString(amount: { toString(): string }): string {
  const raw = amount.toString();
  if (!/^-?\d+(\.\d+)?$/.test(raw)) {
    return "0";
  }
  return raw;
}

/** Formats ledger minor units for overview display (grouped, e.g. 25,000). */
export function formatBalanceDisplay(
  amountMinor: bigint,
  decimalPlaces: number,
): string {
  const negative = amountMinor < BigInt(0);
  const absolute = negative ? -amountMinor : amountMinor;
  const digits = absolute.toString().padStart(decimalPlaces + 1, "0");

  let whole: string;
  let fraction: string | null = null;

  if (decimalPlaces === 0) {
    whole = digits;
  } else {
    whole = digits.slice(0, -decimalPlaces) || "0";
    fraction = digits.slice(-decimalPlaces);
    fraction = fraction.replace(/0+$/, "");
    if (fraction === "") {
      fraction = null;
    }
  }

  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body =
    fraction == null ? groupedWhole : `${groupedWhole}.${fraction}`;
  return negative ? `-${body}` : body;
}

/**
 * Aggregates ledger balances by currency across the given wallets using
 * createBalanceCalculator(). Does not store balances.
 * Active currencies with no activity appear as zero.
 */
export async function deriveCurrencyBalancesForWallets(
  walletIds: readonly string[],
): Promise<CurrencyBalanceDisplay[]> {
  const currencies = await listCurrencies({ includeDeleted: true });
  const currenciesById = new Map(
    currencies.map((currency) => [currency.id, currency] as const),
  );
  const activeCurrencies = currencies
    .filter((currency) => currency.isActive && currency.deletedAt === null)
    .slice()
    .sort((left, right) => left.code.localeCompare(right.code));

  const calculator = createBalanceCalculator();
  const domainEntries: LedgerEntryInput[] = [];

  for (const walletId of walletIds) {
    const dbEntries = await listLedgerEntriesByWallet(walletId);

    for (const entry of dbEntries) {
      const currencyRecord = currenciesById.get(entry.currencyId);
      if (!currencyRecord) {
        continue;
      }

      const domainCurrency = createCurrency({
        code: currencyRecord.code,
        name: currencyRecord.name,
        symbol: currencyRecord.symbol ?? undefined,
        decimalPlaces: currencyRecord.decimalPlaces,
      });

      if (!isLedgerDirection(entry.direction)) {
        continue;
      }

      domainEntries.push({
        walletId: entry.walletId,
        currency: domainCurrency.code,
        direction: entry.direction,
        amount: moneyFromMajorUnits(
          prismaAmountToMajorString(entry.amount),
          domainCurrency,
        ),
      });
    }
  }

  const netByCurrency = new Map<string, bigint>();

  if (domainEntries.length > 0) {
    for (const summary of calculator.summarizeCurrencies(domainEntries)) {
      netByCurrency.set(summary.currency, summary.net.amountMinor);
    }
  }

  const currencyCodes = new Set(
    activeCurrencies.map((currency) => currency.code),
  );
  for (const code of netByCurrency.keys()) {
    currencyCodes.add(code);
  }

  const decimalsByCode = new Map(
    currencies.map(
      (currency) => [currency.code, currency.decimalPlaces] as const,
    ),
  );

  return [...currencyCodes]
    .sort((left, right) => left.localeCompare(right))
    .map((currencyCode) => {
      const decimalPlaces = decimalsByCode.get(currencyCode) ?? 2;
      const amountMinor = netByCurrency.get(currencyCode) ?? BigInt(0);
      return {
        currencyCode,
        balanceDisplay: formatBalanceDisplay(amountMinor, decimalPlaces),
      };
    });
}
