import "server-only";

import { formatCustomerLabel } from "@/features/customers/domain/format-customer-label";
import { listCustomers } from "@/features/customers/repositories/customer-repository";
import { rateFromExchangeMemo } from "@/features/exchange/domain/derive-exchange-summary";
import type {
  ExchangeHistoryListItem,
  GetExchangeHistoryOptions,
} from "@/features/exchange/domain/types";
import { formatRateDisplay } from "@/features/exchange-rates/domain/rate";
import { listCurrencies } from "@/features/ledger/repositories/currency-repository";
import { formatPrismaAmount } from "@/features/transactions/services/ledger-amount-display";
import { listTransactions } from "@/features/transactions/repositories/transaction-repository";
import { EXCHANGE_DIFFERENCE_WALLET_NAME } from "@/features/wallets/domain/wallet-descriptions";
import { listWallets } from "@/features/wallets/repositories/wallet-repository";
import { prisma } from "@/server/db";

function matchesSearch(item: ExchangeHistoryListItem, search: string): boolean {
  const query = search.trim().toLowerCase();
  if (!query) {
    return true;
  }

  const haystack = [
    item.reference,
    item.customerName ?? "",
    item.fromCurrencyCode,
    item.toCurrencyCode,
    item.amountDisplay,
    item.exchangeRateDisplay,
    item.convertedAmountDisplay,
    item.operatorName ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

/**
 * List posted EXCHANGE transactions for the history table.
 * Derives from/to amounts from economic ledger legs (excludes Exchange Difference).
 * Does not compute wallet balances.
 */
export async function getExchangeHistory(
  options: GetExchangeHistoryOptions = {},
): Promise<ExchangeHistoryListItem[]> {
  const [transactions, currencies, customers, wallets, users] =
    await Promise.all([
      listTransactions({ type: "EXCHANGE" }),
      listCurrencies({ includeDeleted: true }),
      listCustomers({ includeDeleted: true }),
      listWallets({ includeDeleted: true }),
      prisma.user.findMany({
        select: { id: true, fullName: true, username: true },
      }),
    ]);

  const transactionIds = transactions.map((transaction) => transaction.id);
  const entries =
    transactionIds.length === 0
      ? []
      : await prisma.ledgerEntry.findMany({
          where: { transactionId: { in: transactionIds } },
          orderBy: { createdAt: "asc" },
        });

  const currenciesById = new Map(
    currencies.map((currency) => [currency.id, currency] as const),
  );
  const customerNames = new Map(
    customers.map((customer) =>
      [
        customer.id,
        formatCustomerLabel(customer.fullName, customer.code),
      ] as const,
    ),
  );
  const operatorNames = new Map(
    users.map(
      (user) =>
        [user.id, user.fullName.trim() || user.username] as const,
    ),
  );
  const exchangeDifferenceWalletIds = new Set(
    wallets
      .filter(
        (wallet) =>
          wallet.type === "SYSTEM" &&
          wallet.name === EXCHANGE_DIFFERENCE_WALLET_NAME,
      )
      .map((wallet) => wallet.id),
  );

  const entriesByTransaction = new Map<string, typeof entries>();
  const exchangeRateIds = new Set<string>();

  for (const entry of entries) {
    const current = entriesByTransaction.get(entry.transactionId) ?? [];
    current.push(entry);
    entriesByTransaction.set(entry.transactionId, current);
    if (entry.exchangeRateId) {
      exchangeRateIds.add(entry.exchangeRateId);
    }
  }

  const rates =
    exchangeRateIds.size === 0
      ? []
      : await prisma.exchangeRate.findMany({
          where: { id: { in: [...exchangeRateIds] } },
        });
  const ratesById = new Map(rates.map((rate) => [rate.id, rate] as const));

  const items: ExchangeHistoryListItem[] = transactions.map((transaction) => {
    const txnEntries = entriesByTransaction.get(transaction.id) ?? [];
    const economicEntries = txnEntries.filter(
      (entry) => !exchangeDifferenceWalletIds.has(entry.walletId),
    );

    const fromEntry = economicEntries.find(
      (entry) => entry.direction === "CREDIT",
    );
    const toEntry = economicEntries.find(
      (entry) => entry.direction === "DEBIT",
    );

    const fromCurrency = fromEntry
      ? currenciesById.get(fromEntry.currencyId)
      : undefined;
    const toCurrency = toEntry
      ? currenciesById.get(toEntry.currencyId)
      : undefined;

    const amountDisplay =
      fromEntry && fromCurrency
        ? (formatPrismaAmount(fromEntry.amount, fromCurrency) ??
          fromEntry.amount.toString())
        : "—";
    const convertedAmountDisplay =
      toEntry && toCurrency
        ? (formatPrismaAmount(toEntry.amount, toCurrency) ??
          toEntry.amount.toString())
        : "—";

    const rateId =
      fromEntry?.exchangeRateId ??
      toEntry?.exchangeRateId ??
      txnEntries.find((entry) => entry.exchangeRateId)?.exchangeRateId ??
      null;
    const linkedRate = rateId ? ratesById.get(rateId) : undefined;
    const exchangeRateDisplay = linkedRate
      ? formatRateDisplay(linkedRate.rate)
      : (rateFromExchangeMemo(fromEntry?.memo) ??
        rateFromExchangeMemo(toEntry?.memo) ??
        "—");

    return {
      id: transaction.id,
      reference: transaction.reference,
      customerName: transaction.customerId
        ? (customerNames.get(transaction.customerId) ?? null)
        : null,
      fromCurrencyCode: fromCurrency?.code ?? "—",
      toCurrencyCode: toCurrency?.code ?? "—",
      amountDisplay,
      exchangeRateDisplay,
      convertedAmountDisplay,
      operatorName: transaction.createdById
        ? (operatorNames.get(transaction.createdById) ?? null)
        : null,
      valueDate: transaction.valueDate.toISOString(),
    };
  });

  const search = options.search?.trim() ?? "";
  if (!search) {
    return items;
  }

  return items.filter((item) => matchesSearch(item, search));
}
