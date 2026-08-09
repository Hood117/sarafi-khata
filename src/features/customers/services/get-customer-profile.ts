import "server-only";

import { CustomerError } from "@/features/customers/domain/errors";
import type { CustomerProfile } from "@/features/customers/domain/types";
import { findCustomerById } from "@/features/customers/repositories/customer-repository";

export async function getCustomerProfile(id: string): Promise<CustomerProfile> {
  const customer = await findCustomerById(id, { includeDeleted: true });

  if (!customer) {
    throw new CustomerError("NOT_FOUND", "Customer not found.");
  }

  return {
    id: customer.id,
    code: customer.code,
    fullName: customer.fullName,
    fatherName: customer.fatherName,
    phone: customer.phone,
    address: customer.address,
    nationalId: customer.nationalId,
    notes: customer.notes,
    isActive: customer.isActive,
    isArchived: customer.deletedAt !== null,
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
  };
}
