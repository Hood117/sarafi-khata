import "server-only";

import type { Customer, Prisma } from "@/generated/prisma/client";
import {
  clampPage,
  normalizePage,
  normalizePageSize,
  paginationSkip,
  type ListPage,
} from "@/lib/pagination";
import { prisma } from "@/server/db";

export type CreateCustomerData = Prisma.CustomerCreateInput;
export type UpdateCustomerData = Prisma.CustomerUpdateInput;

export type CustomerArchiveFilter = "active" | "archived" | "all";

export type CustomerListOptions = {
  /** Case-insensitive match against name, phone, or customer code. */
  search?: string;
  /** Defaults to active (non-archived) customers. */
  archiveFilter?: CustomerArchiveFilter;
  isActive?: boolean;
  includeDeleted?: boolean;
  page?: number;
  pageSize?: number;
};

function notDeleted(): Prisma.CustomerWhereInput {
  return { deletedAt: null };
}

function onlyDeleted(): Prisma.CustomerWhereInput {
  return { deletedAt: { not: null } };
}

function archiveWhere(
  archiveFilter: CustomerArchiveFilter = "active",
): Prisma.CustomerWhereInput {
  switch (archiveFilter) {
    case "archived":
      return onlyDeleted();
    case "all":
      return {};
    case "active":
    default:
      return notDeleted();
  }
}

export async function createCustomer(
  data: CreateCustomerData,
): Promise<Customer> {
  return prisma.customer.create({ data });
}

export async function findCustomerById(
  id: string,
  options: { includeDeleted?: boolean } = {},
): Promise<Customer | null> {
  return prisma.customer.findFirst({
    where: {
      id,
      ...(options.includeDeleted ? {} : notDeleted()),
    },
  });
}

export async function findCustomerByCode(
  code: string,
  options: { includeDeleted?: boolean } = {},
): Promise<Customer | null> {
  return prisma.customer.findFirst({
    where: {
      code,
      ...(options.includeDeleted ? {} : notDeleted()),
    },
  });
}

/**
 * All customer codes including archived — used for safe auto-sequence allocation.
 */
export async function listCustomerCodes(): Promise<Array<string | null>> {
  const rows = await prisma.customer.findMany({
    select: { code: true },
  });
  return rows.map((row) => row.code);
}

export async function findCustomerByPhone(
  phone: string,
  options: { includeDeleted?: boolean } = {},
): Promise<Customer | null> {
  return prisma.customer.findFirst({
    where: {
      phone,
      ...(options.includeDeleted ? {} : notDeleted()),
    },
  });
}

/** Batch read by id — empty `ids` returns [] without querying. */
export async function listCustomersByIds(
  ids: readonly string[],
  options: { includeDeleted?: boolean } = {},
): Promise<Customer[]> {
  if (ids.length === 0) {
    return [];
  }

  return prisma.customer.findMany({
    where: {
      id: { in: [...ids] },
      ...(options.includeDeleted ? {} : notDeleted()),
    },
  });
}

function customerListWhere(
  options: CustomerListOptions = {},
): Prisma.CustomerWhereInput {
  const archiveFilter =
    options.archiveFilter ??
    (options.includeDeleted ? "all" : "active");

  const search = options.search?.trim();

  return {
    AND: [
      archiveWhere(archiveFilter),
      ...(typeof options.isActive === "boolean"
        ? [{ isActive: options.isActive }]
        : []),
      ...(search
        ? [
            {
              OR: [
                { fullName: { contains: search } },
                { fatherName: { contains: search } },
                { phone: { contains: search } },
                { code: { contains: search } },
              ],
            },
          ]
        : []),
    ],
  };
}

export async function listCustomers(
  options: CustomerListOptions = {},
): Promise<Customer[]> {
  return prisma.customer.findMany({
    where: customerListWhere(options),
    orderBy: [{ code: "asc" }, { fullName: "asc" }],
  });
}

/**
 * Paginated customer list — SQL search + count + skip/take.
 */
export async function listCustomersPage(
  options: CustomerListOptions = {},
): Promise<ListPage<Customer>> {
  const where = customerListWhere(options);
  const pageSize = normalizePageSize(options.pageSize);
  let page = normalizePage(options.page);

  const total = await prisma.customer.count({ where });
  page = clampPage(page, total, pageSize);

  const items = await prisma.customer.findMany({
    where,
    orderBy: [{ code: "asc" }, { fullName: "asc" }],
    skip: paginationSkip(page, pageSize),
    take: pageSize,
  });

  return { items, total, page, pageSize };
}

/** Read-only count using the same filters as `listCustomers`. */
export async function countCustomers(
  options: CustomerListOptions = {},
): Promise<number> {
  return prisma.customer.count({
    where: customerListWhere(options),
  });
}

export async function updateCustomer(
  id: string,
  data: UpdateCustomerData,
): Promise<Customer> {
  return prisma.customer.update({
    where: { id },
    data,
  });
}

export async function softDeleteCustomer(id: string): Promise<Customer> {
  // Soft-archive only — keep phone/code/notes and related history intact.
  return prisma.customer.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      isActive: false,
    },
  });
}
