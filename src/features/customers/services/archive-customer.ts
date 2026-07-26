import "server-only";

import type { Customer } from "@/generated/prisma/client";
import { CustomerError } from "@/features/customers/domain/errors";
import {
  findCustomerById,
  softDeleteCustomer,
} from "@/features/customers/repositories/customer-repository";

export async function archiveCustomerRecord(id: string): Promise<Customer> {
  const customer = await findCustomerById(id);

  if (!customer) {
    throw new CustomerError("NOT_FOUND", "Customer not found.");
  }

  return softDeleteCustomer(id);
}
