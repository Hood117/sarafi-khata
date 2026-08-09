import "server-only";

import { Prisma } from "@/generated/prisma/client";
import {
  createCurrency,
  listCurrencies,
  moneyFromMajorUnits,
} from "@/features/ledger";
import type { CurrencyBalanceDisplay } from "@/features/wallets/domain/types";
import { prisma } from "@/server/db";

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

type NetBalanceRow = {
  currencyId: string;
  netMajor: Prisma.Decimal | number | string | null;
};

/**
 * Aggregates ledger balances by currency across the given wallets.
 * Uses SQL SUM (debit +, credit −) — does not load every ledger row into JS.
 *
 * By default, active currencies with no activity appear as zero.
 * Pass `{ includeZeroBalances: false }` to return only currencies with a
 * non-zero net balance (used by the Cash overview).
 */
export async function deriveCurrencyBalancesForWallets(
  walletIds: readonly string[],
  options: { includeZeroBalances?: boolean } = {},
): Promise<CurrencyBalanceDisplay[]> {
  const includeZeroBalances = options.includeZeroBalances !== false;
  const uniqueWalletIds = [...new Set(walletIds.filter(Boolean))];
  const currencies = await listCurrencies({ includeDeleted: true });
  const currenciesById = new Map(
    currencies.map((currency) => [currency.id, currency] as const),
  );
  const activeCurrencies = currencies
    .filter((currency) => currency.isActive && currency.deletedAt === null)
    .slice()
    .sort((left, right) => left.code.localeCompare(right.code));

  const netByCurrency = new Map<string, bigint>();

  if (uniqueWalletIds.length > 0) {
    const rows = await prisma.$queryRaw<NetBalanceRow[]>`
      SELECT
        le.currencyId AS currencyId,
        SUM(
          CASE
            WHEN le.direction = 'DEBIT' THEN le.amount
            ELSE -le.amount
          END
        ) AS netMajor
      FROM LedgerEntry le
      WHERE le.walletId IN (${Prisma.join(uniqueWalletIds)})
      GROUP BY le.currencyId
    `;

    for (const row of rows) {
      const currencyRecord = currenciesById.get(row.currencyId);
      if (!currencyRecord || row.netMajor == null) {
        continue;
      }

      const domainCurrency = createCurrency({
        code: currencyRecord.code,
        name: currencyRecord.name,
        symbol: currencyRecord.symbol ?? undefined,
        decimalPlaces: currencyRecord.decimalPlaces,
      });

      const money = moneyFromMajorUnits(
        prismaAmountToMajorString(row.netMajor),
        domainCurrency,
      );
      netByCurrency.set(domainCurrency.code, money.amountMinor);
    }
  }

  const currencyCodes = new Set<string>();
  if (includeZeroBalances) {
    for (const currency of activeCurrencies) {
      currencyCodes.add(currency.code);
    }
  }
  for (const [code, minor] of netByCurrency) {
    if (includeZeroBalances || minor !== BigInt(0)) {
      currencyCodes.add(code);
    }
  }

  const decimalsByCode = new Map(
    currencies.map(
      (currency) => [currency.code, currency.decimalPlaces] as const,
    ),
  );

  const symbolByCode = new Map(
    currencies.map((currency) => [currency.code, currency.symbol] as const),
  );

  return [...currencyCodes]
    .sort((left, right) => left.localeCompare(right))
    .map((currencyCode) => {
      const decimalPlaces = decimalsByCode.get(currencyCode) ?? 2;
      const amountMinor = netByCurrency.get(currencyCode) ?? BigInt(0);
      return {
        currencyCode,
        currencySymbol: symbolByCode.get(currencyCode) ?? null,
        balanceDisplay: formatBalanceDisplay(amountMinor, decimalPlaces),
      };
    });
}
