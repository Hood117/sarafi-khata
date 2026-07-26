import "server-only";

import type {
  CustomerArchiveFilter,
  CustomerListItem,
} from "@/features/customers/domain/types";
import { listCustomers } from "@/features/customers/repositories/customer-repository";

export type { CustomerListItem };

export type GetCustomerListOptions = {
  search?: string;
  archiveFilter?: CustomerArchiveFilter;
};

export async function getCustomerList(
  options: GetCustomerListOptions = {},
): Promise<CustomerListItem[]> {
  const customers = await listCustomers({
    search: options.search,
    archiveFilter: options.archiveFilter ?? "active",
  });

  return customers.map((customer) => ({
    id: customer.id,
    code: customer.code,
    fullName: customer.fullName,
    phone: customer.phone,
    address: customer.address,
    nationalId: customer.nationalId,
    createdAt: customer.createdAt.toISOString(),
    isActive: customer.isActive,
    isArchived: customer.deletedAt !== null,
  }));
}
