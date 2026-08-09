import "server-only";

import type {
  Prisma,
  Transaction,
  TransactionStatus,
  TransactionType,
} from "@/generated/prisma/client";
import {
  clampPage,
  normalizePage,
  normalizePageSize,
  paginationSkip,
  type ListPage,
} from "@/lib/pagination";
import { prisma } from "@/server/db";

export type CreateTransactionData = Prisma.TransactionCreateInput;
export type UpdateTransactionData = Prisma.TransactionUpdateInput;

export type TransactionListOptions = {
  includeDeleted?: boolean;
  status?: TransactionStatus;
  type?: TransactionType;
  customerId?: string;
  /** Posted-by user id. */
  createdById?: string;
  /** Inclusive lower bound on `valueDate`. */
  valueDateFrom?: Date;
  /** Exclusive upper bound on `valueDate`. */
  valueDateTo?: Date;
  /** Case-insensitive contains on reference / walk-in / description. */
  search?: string;
  /** Max rows after orderBy (newest first). Ignored when page/pageSize set. */
  take?: number;
  /** 1-based page — when set with pageSize, uses SQL skip/take + count. */
  page?: number;
  pageSize?: number;
};

function notDeleted(): Prisma.TransactionWhereInput {
  return { deletedAt: null };
}

export function transactionListWhere(
  options: TransactionListOptions,
): Prisma.TransactionWhereInput {
  const valueDateFilter: Prisma.DateTimeFilter | undefined =
    options.valueDateFrom || options.valueDateTo
      ? {
          ...(options.valueDateFrom ? { gte: options.valueDateFrom } : {}),
          ...(options.valueDateTo ? { lt: options.valueDateTo } : {}),
        }
      : undefined;

  const search = options.search?.trim();
  const searchFilter: Prisma.TransactionWhereInput | undefined = search
    ? {
        OR: [
          { reference: { contains: search } },
          { walkInName: { contains: search } },
          { walkInPhone: { contains: search } },
          { description: { contains: search } },
        ],
      }
    : undefined;

  return {
    ...(options.includeDeleted ? {} : notDeleted()),
    ...(options.status ? { status: options.status } : {}),
    ...(options.type ? { type: options.type } : {}),
    ...(options.customerId ? { customerId: options.customerId } : {}),
    ...(options.createdById ? { createdById: options.createdById } : {}),
    ...(valueDateFilter ? { valueDate: valueDateFilter } : {}),
    ...(searchFilter ?? {}),
  };
}

/**
 * Low-level create. Financial posting must use `postTransaction` instead —
 * not exported from the public transactions barrel.
 */
export async function createTransaction(
  data: CreateTransactionData,
): Promise<Transaction> {
  return prisma.transaction.create({ data });
}

export async function findTransactionById(
  id: string,
  options: { includeDeleted?: boolean } = {},
): Promise<Transaction | null> {
  return prisma.transaction.findFirst({
    where: {
      id,
      ...(options.includeDeleted ? {} : notDeleted()),
    },
  });
}

export async function findTransactionByReference(
  reference: string,
  options: { includeDeleted?: boolean } = {},
): Promise<Transaction | null> {
  return prisma.transaction.findFirst({
    where: {
      reference,
      ...(options.includeDeleted ? {} : notDeleted()),
    },
  });
}

export async function listTransactions(
  options: TransactionListOptions = {},
): Promise<Transaction[]> {
  return prisma.transaction.findMany({
    where: transactionListWhere(options),
    orderBy: [{ valueDate: "desc" }, { createdAt: "desc" }],
    ...(typeof options.take === "number" && options.take > 0
      ? { take: Math.floor(options.take) }
      : {}),
  });
}

/**
 * Paginated transaction list with SQL count + skip/take.
 * Prefer this for desk history screens.
 */
export async function listTransactionsPage(
  options: TransactionListOptions = {},
): Promise<ListPage<Transaction>> {
  const where = transactionListWhere(options);
  const pageSize = normalizePageSize(options.pageSize);
  let page = normalizePage(options.page);

  const total = await prisma.transaction.count({ where });
  page = clampPage(page, total, pageSize);

  const items = await prisma.transaction.findMany({
    where,
    orderBy: [{ valueDate: "desc" }, { createdAt: "desc" }],
    skip: paginationSkip(page, pageSize),
    take: pageSize,
  });

  return { items, total, page, pageSize };
}

/**
 * Lightweight type counts for dashboard / report KPI grouping.
 * Uses the same filters as `listTransactions` — no ledger join.
 */
export async function listTransactionTypes(
  options: Omit<TransactionListOptions, "take" | "page" | "pageSize"> = {},
): Promise<Array<{ type: TransactionType; count: number }>> {
  const groups = await prisma.transaction.groupBy({
    by: ["type"],
    where: transactionListWhere(options),
    _count: { _all: true },
  });

  return groups.map((group) => ({
    type: group.type,
    count: group._count._all,
  }));
}

export async function updateTransaction(
  id: string,
  data: UpdateTransactionData,
): Promise<Transaction> {
  return prisma.transaction.update({
    where: { id },
    data,
  });
}

export async function softDeleteTransaction(id: string): Promise<Transaction> {
  // Release unique `reference` so document numbers can be reused after soft delete.
  // Keep the original reference after the `deleted:` prefix for display/search.
  const existing = await prisma.transaction.findUnique({
    where: { id },
    select: { reference: true },
  });
  const originalReference = existing?.reference?.trim() || id;
  const releasedReference = originalReference.startsWith("deleted:")
    ? `deleted:${id}`
    : `deleted:${originalReference}`;

  return prisma.transaction.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      reference: releasedReference,
    },
  });
}
