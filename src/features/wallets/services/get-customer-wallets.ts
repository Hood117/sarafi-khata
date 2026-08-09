import "server-only";

import {
  createBalanceCalculator,
  createCurrency,
  findCurrencyByCode,
  isLedgerDirection,
  listCurrencies,
  listLedgerEntries,
  moneyFromMajorUnits,
  toCurrencyCode,
  type LedgerEntryInput,
} from "@/features/ledger";
import { getSystemSetting } from "@/features/settings";
import type {
  CustomerCurrencyBalance,
  CustomerWalletBalanceRow,
} from "@/features/wallets/domain/types";
import { deriveCurrencyBalancesForWallets } from "@/features/wallets/services/derive-currency-balances";
import { listWallets } from "@/features/wallets/repositories/wallet-repository";

function formatMinorUnits(amountMinor: bigint, decimalPlaces: number): string {
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

function prismaAmountToMajorString(amount: { toString(): string }): string {
  const raw = amount.toString();
  if (!/^-?\d+(\.\d+)?$/.test(raw)) {
    return "0";
  }
  return raw;
}

async function resolveBaseCurrencyCode(): Promise<string> {
  const setting = await getSystemSetting("app.baseCurrencyCode");
  const code = setting?.value?.trim().toUpperCase() || "AFN";
  return toCurrencyCode(code);
}

export async function getCustomerWalletBalanceRows(
  customerId: string,
  options: { includeArchived?: boolean } = {},
): Promise<CustomerWalletBalanceRow[]> {
  const wallets = options.includeArchived
    ? (
        await listWallets({
          customerId,
          includeDeleted: true,
        })
      ).filter((wallet) => wallet.customerId === customerId)
    : await listWallets({ customerId });

  const currencies = await listCurrencies({ includeDeleted: true });
  const currenciesById = new Map(
    currencies.map((currency) => [currency.id, currency] as const),
  );
  const currenciesByCode = new Map(
    currencies.map((currency) => [currency.code, currency] as const),
  );

  const baseCurrencyCode = await resolveBaseCurrencyCode();
  const baseCurrencyRecord =
    currenciesByCode.get(baseCurrencyCode) ??
    (await findCurrencyByCode(baseCurrencyCode, { includeDeleted: true }));
  const baseDecimalPlaces = baseCurrencyRecord?.decimalPlaces ?? 2;

  const calculator = createBalanceCalculator();
  const rows: CustomerWalletBalanceRow[] = [];

  const allEntries =
    wallets.length === 0
      ? []
      : await listLedgerEntries({
          walletIds: wallets.map((wallet) => wallet.id),
        });

  const entriesByWallet = new Map<string, typeof allEntries>();
  for (const entry of allEntries) {
    const current = entriesByWallet.get(entry.walletId) ?? [];
    current.push(entry);
    entriesByWallet.set(entry.walletId, current);
  }

  for (const wallet of wallets) {
    const dbEntries = entriesByWallet.get(wallet.id) ?? [];
    const isArchived = wallet.deletedAt !== null;

    if (dbEntries.length === 0) {
      rows.push({
        walletId: wallet.id,
        walletName: wallet.name,
        currencyCode: baseCurrencyCode,
        balanceDisplay: formatMinorUnits(BigInt(0), baseDecimalPlaces),
        isActive: wallet.isActive,
        isArchived,
      });
      continue;
    }

    const domainEntries: LedgerEntryInput[] = [];

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

    if (domainEntries.length === 0) {
      rows.push({
        walletId: wallet.id,
        walletName: wallet.name,
        currencyCode: baseCurrencyCode,
        balanceDisplay: formatMinorUnits(BigInt(0), baseDecimalPlaces),
        isActive: wallet.isActive,
        isArchived,
      });
      continue;
    }

    const balances = calculator.calculateWalletBalances(domainEntries);

    for (const balance of balances) {
      const currencyRecord = currenciesByCode.get(balance.currency);
      const decimalPlaces = currencyRecord?.decimalPlaces ?? 2;

      rows.push({
        walletId: wallet.id,
        walletName: wallet.name,
        currencyCode: balance.currency,
        balanceDisplay: formatMinorUnits(
          balance.balance.amountMinor,
          decimalPlaces,
        ),
        isActive: wallet.isActive,
        isArchived,
      });
    }
  }

  rows.sort((left, right) => {
    const byName = left.walletName.localeCompare(right.walletName);
    if (byName !== 0) {
      return byName;
    }
    return left.currencyCode.localeCompare(right.currencyCode);
  });

  return rows;
}

/**
 * Customer balances by currency, derived from ledger entries across the
 * customer's wallets. Does not read or write a stored balance field.
 * Active currencies with no activity appear as zero.
 */
export async function getCustomerCurrencyBalances(
  customerId: string,
  options: { includeArchived?: boolean } = {},
): Promise<CustomerCurrencyBalance[]> {
  const wallets = options.includeArchived
    ? (
        await listWallets({
          customerId,
          includeDeleted: true,
        })
      ).filter((wallet) => wallet.customerId === customerId)
    : await listWallets({ customerId });

  return deriveCurrencyBalancesForWallets(wallets.map((wallet) => wallet.id));
}
