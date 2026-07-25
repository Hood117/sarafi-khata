import "server-only";

import type {
  Prisma,
  Transaction,
  TransactionStatus,
  TransactionType,
} from "@/generated/prisma/client";
import { prisma } from "@/server/db";

export type CreateTransactionData = Prisma.TransactionCreateInput;
export type UpdateTransactionData = Prisma.TransactionUpdateInput;

export type TransactionListOptions = {
  includeDeleted?: boolean;
  status?: TransactionStatus;
  type?: TransactionType;
  customerId?: string;
};

function notDeleted(): Prisma.TransactionWhereInput {
  return { deletedAt: null };
}

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
  const where: Prisma.TransactionWhereInput = {
    ...(options.includeDeleted ? {} : notDeleted()),
    ...(options.status ? { status: options.status } : {}),
    ...(options.type ? { type: options.type } : {}),
    ...(options.customerId ? { customerId: options.customerId } : {}),
  };

  return prisma.transaction.findMany({
    where,
    orderBy: [{ valueDate: "desc" }, { createdAt: "desc" }],
  });
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
  return prisma.transaction.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      reference: `deleted:${id}`,
    },
  });
}
