import "server-only";

import type { Customer, Prisma } from "@/generated/prisma/client";
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

export async function listCustomers(
  options: CustomerListOptions = {},
): Promise<Customer[]> {
  const archiveFilter =
    options.archiveFilter ??
    (options.includeDeleted ? "all" : "active");

  const search = options.search?.trim();

  const where: Prisma.CustomerWhereInput = {
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
                { phone: { contains: search } },
                { code: { contains: search } },
              ],
            },
          ]
        : []),
    ],
  };

  return prisma.customer.findMany({
    where,
    orderBy: { fullName: "asc" },
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
