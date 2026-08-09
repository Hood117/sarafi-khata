import "server-only";

import { formatCustomerLabel } from "@/features/customers/domain/format-customer-label";
import { listCustomersByIds } from "@/features/customers/repositories/customer-repository";
import {
  formatExchangePartyLabel,
  parseExchangeDescription,
  rateFromExchangeMemo,
} from "@/features/exchange/domain/derive-exchange-summary";
import type {
  ExchangeHistoryListItem,
  GetExchangeHistoryOptions,
} from "@/features/exchange/domain/types";
import { formatRateDisplay } from "@/features/exchange-rates/domain/rate";
import { listCurrencies } from "@/features/ledger/repositories/currency-repository";
import { formatPrismaAmount } from "@/features/transactions/services/ledger-amount-display";
import {
  listTransactions,
  listTransactionsPage,
} from "@/features/transactions/repositories/transaction-repository";
import { EXCHANGE_DIFFERENCE_WALLET_NAME } from "@/features/wallets/domain/wallet-descriptions";
import { listWallets } from "@/features/wallets/repositories/wallet-repository";
import type { ListPage } from "@/lib/pagination";
import { prisma } from "@/server/db";

type ExchangeTxn = Awaited<ReturnType<typeof listTransactions>>[number];

async function enrichExchangeHistory(
  transactions: ExchangeTxn[],
): Promise<ExchangeHistoryListItem[]> {
  if (transactions.length === 0) {
    return [];
  }

  const transactionIds = transactions.map((transaction) => transaction.id);
  const customerIds = [
    ...new Set(
      transactions
        .map((transaction) => transaction.customerId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const operatorIds = [
    ...new Set(
      transactions
        .map((transaction) => transaction.createdById)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const [entries, currencies, systemWallets, customers, users] =
    await Promise.all([
      prisma.ledgerEntry.findMany({
        where: { transactionId: { in: transactionIds } },
        orderBy: { createdAt: "asc" },
      }),
      listCurrencies({ includeDeleted: true }),
      listWallets({ type: "SYSTEM", includeDeleted: true }),
      listCustomersByIds(customerIds, { includeDeleted: true }),
      operatorIds.length === 0
        ? Promise.resolve([])
        : prisma.user.findMany({
            where: { id: { in: operatorIds } },
            select: { id: true, fullName: true, username: true },
          }),
    ]);

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
    systemWallets
      .filter((wallet) => wallet.name === EXCHANGE_DIFFERENCE_WALLET_NAME)
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

  return transactions.map((transaction) => {
    const txnEntries = entriesByTransaction.get(transaction.id) ?? [];
    const economicEntries = txnEntries.filter(
      (entry) => !exchangeDifferenceWalletIds.has(entry.walletId),
    );

    const parsed = parseExchangeDescription(transaction.description);
    const fromEntry = parsed
      ? economicEntries.find((entry) => {
          const currency = currenciesById.get(entry.currencyId);
          return currency?.code === parsed.fromCurrencyCode;
        })
      : economicEntries.find((entry) => entry.direction === "CREDIT");
    const toEntry = parsed
      ? economicEntries.find((entry) => {
          const currency = currenciesById.get(entry.currencyId);
          return currency?.code === parsed.toCurrencyCode;
        })
      : economicEntries.find((entry) => entry.direction === "DEBIT");

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
        : (parsed?.fromAmount ?? "—");
    const convertedAmountDisplay =
      toEntry && toCurrency
        ? (formatPrismaAmount(toEntry.amount, toCurrency) ??
          toEntry.amount.toString())
        : (parsed?.toAmount ?? "—");

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

    const registeredName = transaction.customerId
      ? (customerNames.get(transaction.customerId) ?? null)
      : null;

    return {
      id: transaction.id,
      reference: transaction.reference,
      customerName: formatExchangePartyLabel({
        customerName: registeredName,
        walkInName: transaction.walkInName,
        walkInPhone: transaction.walkInPhone,
      }),
      fromCurrencyCode:
        fromCurrency?.code ?? parsed?.fromCurrencyCode ?? "—",
      toCurrencyCode: toCurrency?.code ?? parsed?.toCurrencyCode ?? "—",
      amountDisplay,
      exchangeRateDisplay,
      convertedAmountDisplay,
      operatorName: transaction.createdById
        ? (operatorNames.get(transaction.createdById) ?? null)
        : null,
      valueDate: transaction.valueDate.toISOString(),
    };
  });
}

/**
 * List posted EXCHANGE transactions (bounded). Prefer `getExchangeHistoryPage`.
 */
export async function getExchangeHistory(
  options: GetExchangeHistoryOptions = {},
): Promise<ExchangeHistoryListItem[]> {
  const transactions = await listTransactions({
    type: "EXCHANGE",
    search: options.search,
    ...(options.valueDateFrom ? { valueDateFrom: options.valueDateFrom } : {}),
    ...(options.valueDateTo ? { valueDateTo: options.valueDateTo } : {}),
    ...(typeof options.take === "number" ? { take: options.take } : { take: 100 }),
  });
  return enrichExchangeHistory(transactions);
}

/**
 * Paginated exchange history — SQL filter/page, enrich only the page.
 */
export async function getExchangeHistoryPage(
  options: GetExchangeHistoryOptions = {},
): Promise<ListPage<ExchangeHistoryListItem>> {
  const pageResult = await listTransactionsPage({
    type: "EXCHANGE",
    search: options.search,
    ...(options.valueDateFrom ? { valueDateFrom: options.valueDateFrom } : {}),
    ...(options.valueDateTo ? { valueDateTo: options.valueDateTo } : {}),
    page: options.page,
    pageSize: options.pageSize,
  });
  const items = await enrichExchangeHistory(pageResult.items);
  return {
    items,
    total: pageResult.total,
    page: pageResult.page,
    pageSize: pageResult.pageSize,
  };
}
