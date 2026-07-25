import "server-only";

import type { Customer, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";

export type CreateCustomerData = Prisma.CustomerCreateInput;
export type UpdateCustomerData = Prisma.CustomerUpdateInput;

export type CustomerListOptions = {
  includeDeleted?: boolean;
  isActive?: boolean;
};

function notDeleted(): Prisma.CustomerWhereInput {
  return { deletedAt: null };
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

export async function listCustomers(
  options: CustomerListOptions = {},
): Promise<Customer[]> {
  const where: Prisma.CustomerWhereInput = {
    ...(options.includeDeleted ? {} : notDeleted()),
    ...(typeof options.isActive === "boolean"
      ? { isActive: options.isActive }
      : {}),
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
  // Release unique `code` so a new customer can reuse it after soft delete.
  return prisma.customer.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      isActive: false,
      code: null,
    },
  });
}
