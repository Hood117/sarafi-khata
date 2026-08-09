import "server-only";

import type {
  CustomerArchiveFilter,
  CustomerListItem,
} from "@/features/customers/domain/types";
import {
  listCustomers,
  listCustomersPage,
} from "@/features/customers/repositories/customer-repository";
import type { ListPage } from "@/lib/pagination";

export type { CustomerListItem };

export type GetCustomerListOptions = {
  search?: string;
  archiveFilter?: CustomerArchiveFilter;
  page?: number;
  pageSize?: number;
};

function toListItem(
  customer: Awaited<ReturnType<typeof listCustomers>>[number],
): CustomerListItem {
  return {
    id: customer.id,
    code: customer.code,
    fullName: customer.fullName,
    fatherName: customer.fatherName,
    phone: customer.phone,
    address: customer.address,
    nationalId: customer.nationalId,
    createdAt: customer.createdAt.toISOString(),
    isActive: customer.isActive,
    isArchived: customer.deletedAt !== null,
  };
}

/**
 * Full customer list for pickers / small catalogs.
 * Prefer `getCustomerListPage` for the customers desk.
 */
export async function getCustomerList(
  options: GetCustomerListOptions = {},
): Promise<CustomerListItem[]> {
  const customers = await listCustomers({
    search: options.search,
    archiveFilter: options.archiveFilter ?? "active",
  });

  return customers.map(toListItem);
}

/**
 * Paginated customers desk list — search/archive in SQL.
 */
export async function getCustomerListPage(
  options: GetCustomerListOptions = {},
): Promise<ListPage<CustomerListItem>> {
  const pageResult = await listCustomersPage({
    search: options.search,
    archiveFilter: options.archiveFilter ?? "active",
    page: options.page,
    pageSize: options.pageSize,
  });

  return {
    items: pageResult.items.map(toListItem),
    total: pageResult.total,
    page: pageResult.page,
    pageSize: pageResult.pageSize,
  };
}
