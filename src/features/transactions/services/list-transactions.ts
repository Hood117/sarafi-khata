import "server-only";

import { formatCustomerLabel } from "@/features/customers/domain/format-customer-label";
import { listCustomersByIds } from "@/features/customers/repositories/customer-repository";
import { formatExchangePartyLabel } from "@/features/exchange/domain/derive-exchange-summary";
import { listCurrencies } from "@/features/ledger/repositories/currency-repository";
import { listLedgerEntries } from "@/features/ledger/repositories/ledger-repository";
import { resolveTransactionTypeLabel } from "@/features/transactions/domain/labels";
import type { TransactionListItem } from "@/features/transactions/domain/types";
import {
  listTransactions,
  listTransactionsPage,
  type TransactionListOptions,
} from "@/features/transactions/repositories/transaction-repository";
import { summarizeDebitTotals } from "@/features/transactions/services/ledger-amount-display";
import type { ListPage } from "@/lib/pagination";
import { prisma } from "@/server/db";

export type GetTransactionListOptions = Pick<
  TransactionListOptions,
  | "status"
  | "type"
  | "customerId"
  | "createdById"
  | "valueDateFrom"
  | "valueDateTo"
  | "take"
  | "search"
  | "includeDeleted"
  | "page"
  | "pageSize"
>;

async function enrichTransactions(
  transactions: Awaited<ReturnType<typeof listTransactions>>,
): Promise<TransactionListItem[]> {
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

  const [entries, currencies, customers, users, hawalaRows] = await Promise.all([
    listLedgerEntries({ transactionIds }),
    listCurrencies({ includeDeleted: true }),
    listCustomersByIds(customerIds, { includeDeleted: true }),
    operatorIds.length === 0
      ? Promise.resolve([])
      : prisma.user.findMany({
          where: { id: { in: operatorIds } },
          select: { id: true, fullName: true, username: true },
        }),
    prisma.hawalaTransfer.findMany({
      where: {
        transactionId: { in: transactionIds },
        deletedAt: null,
      },
      select: { transactionId: true, direction: true },
    }),
  ]);

  const currenciesById = new Map(
    currencies.map((currency) => [currency.id, currency] as const),
  );
  const customerNames = new Map(
    customers.map(
      (customer) =>
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
  const hawalaByTransaction = new Map(
    hawalaRows
      .filter((row): row is typeof row & { transactionId: string } =>
        Boolean(row.transactionId),
      )
      .map((row) => [row.transactionId, row.direction] as const),
  );

  const entriesByTransaction = new Map<
    string,
    Awaited<ReturnType<typeof listLedgerEntries>>
  >();

  for (const entry of entries) {
    const current = entriesByTransaction.get(entry.transactionId) ?? [];
    current.push(entry);
    entriesByTransaction.set(entry.transactionId, current);
  }

  return transactions.map((transaction) => {
    const summary = summarizeDebitTotals(
      entriesByTransaction.get(transaction.id) ?? [],
      currenciesById,
    );
    const hawalaDirection = hawalaByTransaction.get(transaction.id) ?? null;

    return {
      id: transaction.id,
      reference: transaction.reference,
      type: transaction.type,
      typeLabel: resolveTransactionTypeLabel({
        type: transaction.type,
        reference: transaction.reference,
        description: transaction.description,
        hawalaDirection,
      }),
      hawalaDirection,
      customerName: formatExchangePartyLabel({
        customerName: transaction.customerId
          ? (customerNames.get(transaction.customerId) ?? null)
          : null,
        walkInName: transaction.walkInName,
        walkInPhone: transaction.walkInPhone,
      }),
      currencyDisplay: summary.currencyDisplay,
      amountDisplay: summary.amountDisplay,
      debitTotals: summary.debitTotals,
      status: transaction.status,
      operatorName: transaction.createdById
        ? (operatorNames.get(transaction.createdById) ?? null)
        : null,
      valueDate: transaction.valueDate.toISOString(),
    };
  });
}

/**
 * Read-only transaction list rows for UI / dashboard.
 * Prefer `getTransactionListPage` for desk screens.
 * Always pass `take` (or page) — unbounded loads are not allowed for hot paths.
 */
export async function getTransactionList(
  options: GetTransactionListOptions = {},
): Promise<TransactionListItem[]> {
  const transactions = await listTransactions(options);
  return enrichTransactions(transactions);
}

/**
 * Paginated desk list — SQL count + skip/take, enrich only the page.
 */
export async function getTransactionListPage(
  options: GetTransactionListOptions = {},
): Promise<ListPage<TransactionListItem>> {
  const pageResult = await listTransactionsPage(options);
  const items = await enrichTransactions(pageResult.items);
  return {
    items,
    total: pageResult.total,
    page: pageResult.page,
    pageSize: pageResult.pageSize,
  };
}
