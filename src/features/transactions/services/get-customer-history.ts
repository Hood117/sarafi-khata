import "server-only";

import { findCustomerById } from "@/features/customers/repositories/customer-repository";
import { listCurrencies } from "@/features/ledger/repositories/currency-repository";
import {
  TRANSACTION_STATUS_LABELS,
  TRANSACTION_TYPE_LABELS,
} from "@/features/transactions/domain/labels";
import { TransactionError } from "@/features/transactions/domain/transaction-errors";
import { isTransactionType } from "@/features/transactions/domain/transaction-rules";
import type {
  CustomerHistoryEvent,
  CustomerHistoryFilters,
  CustomerHistoryResult,
  CustomerHistorySort,
  GetCustomerHistoryOptions,
} from "@/features/transactions/domain/types";
import { formatPrismaAmount } from "@/features/transactions/services/ledger-amount-display";
import { listWallets } from "@/features/wallets/repositories/wallet-repository";
import { prisma } from "@/server/db";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function normalizePage(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
    return DEFAULT_PAGE;
  }
  return Math.floor(value);
}

function normalizePageSize(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
    return DEFAULT_PAGE_SIZE;
  }
  return Math.min(Math.floor(value), MAX_PAGE_SIZE);
}

function normalizeSort(value: CustomerHistorySort | undefined): CustomerHistorySort {
  return value === "oldest" ? "oldest" : "newest";
}

function normalizeDateOnly(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!DATE_ONLY_PATTERN.test(trimmed)) {
    return null;
  }

  const parsed = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return trimmed;
}

function normalizeFilters(
  options: GetCustomerHistoryOptions,
): CustomerHistoryFilters {
  const type =
    typeof options.type === "string" && isTransactionType(options.type)
      ? options.type
      : null;

  const currencyCode =
    typeof options.currencyCode === "string" && options.currencyCode.trim()
      ? options.currencyCode.trim().toUpperCase()
      : null;

  const reference =
    typeof options.reference === "string" && options.reference.trim()
      ? options.reference.trim()
      : null;

  let dateFrom = normalizeDateOnly(options.dateFrom);
  let dateTo = normalizeDateOnly(options.dateTo);

  if (dateFrom && dateTo && dateFrom > dateTo) {
    const swappedFrom = dateTo;
    dateTo = dateFrom;
    dateFrom = swappedFrom;
  }

  return {
    dateFrom,
    dateTo,
    type,
    currencyCode,
    reference,
  };
}

function eventDateOnly(isoDate: string): string {
  return isoDate.slice(0, 10);
}

function matchesFilters(
  event: CustomerHistoryEvent,
  filters: CustomerHistoryFilters,
): boolean {
  if (filters.dateFrom && eventDateOnly(event.date) < filters.dateFrom) {
    return false;
  }

  if (filters.dateTo && eventDateOnly(event.date) > filters.dateTo) {
    return false;
  }

  if (filters.type && event.type !== filters.type) {
    return false;
  }

  if (
    filters.currencyCode &&
    event.currencyCode.toUpperCase() !== filters.currencyCode
  ) {
    return false;
  }

  if (
    filters.reference &&
    !event.reference.toLowerCase().includes(filters.reference.toLowerCase())
  ) {
    return false;
  }

  return true;
}

function emptyResult(
  page: number,
  pageSize: number,
  sort: CustomerHistorySort,
  filters: CustomerHistoryFilters,
  currencyOptions: string[],
): CustomerHistoryResult {
  return {
    events: [],
    total: 0,
    page,
    pageSize,
    sort,
    filters,
    currencyOptions,
  };
}

/**
 * Read-only financial history for a customer.
 *
 * Builds chronological events from existing LedgerEntry rows on the customer's
 * wallets, joined to parent Transaction metadata. Filters and sort are applied
 * in memory over that single result set — no parallel history queries.
 */
export async function getCustomerHistory(
  customerId: string,
  options: GetCustomerHistoryOptions = {},
): Promise<CustomerHistoryResult> {
  const page = normalizePage(options.page);
  const pageSize = normalizePageSize(options.pageSize);
  const sort = normalizeSort(options.sort);
  const filters = normalizeFilters(options);

  const customer = await findCustomerById(customerId, { includeDeleted: true });
  if (!customer) {
    throw new TransactionError("NOT_FOUND", "Customer was not found.");
  }

  const [wallets, currencies] = await Promise.all([
    listWallets({
      customerId,
      includeDeleted: true,
    }),
    listCurrencies({ includeDeleted: true }),
  ]);

  const currencyOptions = currencies
    .map((currency) => currency.code)
    .sort((left, right) => left.localeCompare(right));

  if (wallets.length === 0) {
    return emptyResult(page, pageSize, sort, filters, currencyOptions);
  }

  // Single query for all customer wallets (avoids N+1 per-wallet reads).
  const customerEntries = await prisma.ledgerEntry.findMany({
    where: {
      walletId: { in: wallets.map((wallet) => wallet.id) },
    },
    orderBy: { createdAt: "asc" },
  });

  if (customerEntries.length === 0) {
    return emptyResult(page, pageSize, sort, filters, currencyOptions);
  }

  const transactionIds = [
    ...new Set(customerEntries.map((entry) => entry.transactionId)),
  ];

  const transactions = await prisma.transaction.findMany({
    where: { id: { in: transactionIds } },
  });

  const operatorIds = [
    ...new Set(
      transactions
        .map((tx) => tx.createdById)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];

  const users =
    operatorIds.length === 0
      ? []
      : await prisma.user.findMany({
          where: { id: { in: operatorIds } },
          select: { id: true, fullName: true, username: true },
        });

  const transactionsById = new Map(
    transactions.map((tx) => [tx.id, tx] as const),
  );
  const currenciesById = new Map(
    currencies.map((currency) => [currency.id, currency] as const),
  );
  const operatorNames = new Map(
    users.map(
      (user) =>
        [user.id, user.fullName.trim() || user.username] as const,
    ),
  );

  const events: CustomerHistoryEvent[] = [];

  for (const entry of customerEntries) {
    const transaction = transactionsById.get(entry.transactionId);
    if (!transaction) {
      continue;
    }

    const currency = currenciesById.get(entry.currencyId);
    const amountDisplay = currency
      ? (formatPrismaAmount(entry.amount, currency) ?? entry.amount.toString())
      : entry.amount.toString();

    const event: CustomerHistoryEvent = {
      id: entry.id,
      transactionId: transaction.id,
      date: transaction.valueDate.toISOString(),
      type: transaction.type,
      typeLabel: TRANSACTION_TYPE_LABELS[transaction.type],
      reference: transaction.reference,
      currencyCode: currency?.code ?? "—",
      amountDisplay,
      direction: entry.direction,
      status: transaction.status,
      statusLabel: TRANSACTION_STATUS_LABELS[transaction.status],
      operatorName: transaction.createdById
        ? (operatorNames.get(transaction.createdById) ?? null)
        : null,
    };

    if (!matchesFilters(event, filters)) {
      continue;
    }

    events.push(event);
  }

  events.sort((left, right) => {
    const byDate =
      new Date(left.date).getTime() - new Date(right.date).getTime();
    if (byDate !== 0) {
      return sort === "newest" ? -byDate : byDate;
    }

    // Stable tie-break: ledger entry id (created order proxy).
    const byId = left.id.localeCompare(right.id);
    return sort === "newest" ? -byId : byId;
  });

  const total = events.length;
  const totalPages = total === 0 ? 1 : Math.ceil(total / pageSize);
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const pageEvents = events.slice(start, start + pageSize);

  return {
    events: pageEvents,
    total,
    page: safePage,
    pageSize,
    sort,
    filters,
    currencyOptions,
  };
}
