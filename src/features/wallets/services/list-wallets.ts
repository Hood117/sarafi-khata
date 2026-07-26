import "server-only";

import type { WalletType } from "@/generated/prisma/client";
import { formatCustomerLabel } from "@/features/customers/domain/format-customer-label";
import { listCustomers } from "@/features/customers/repositories/customer-repository";
import type {
  WalletArchiveFilter,
  WalletListItem,
} from "@/features/wallets/domain/types";
import { getWalletDescription } from "@/features/wallets/domain/wallet-descriptions";
import { listWallets } from "@/features/wallets/repositories/wallet-repository";

export type GetWalletListOptions = {
  archiveFilter?: WalletArchiveFilter;
  type?: WalletType;
  customerId?: string;
};

async function buildCustomerNameMap(): Promise<Map<string, string>> {
  const customers = await listCustomers({ includeDeleted: true });
  return new Map(
    customers.map((customer) =>
      [
        customer.id,
        formatCustomerLabel(customer.fullName, customer.code),
      ] as const,
    ),
  );
}

function toWalletListItem(
  wallet: Awaited<ReturnType<typeof listWallets>>[number],
  customerNames: Map<string, string>,
): WalletListItem {
  return {
    id: wallet.id,
    name: wallet.name,
    type: wallet.type,
    description: getWalletDescription(wallet.name),
    customerId: wallet.customerId,
    customerName: wallet.customerId
      ? (customerNames.get(wallet.customerId) ?? null)
      : null,
    isActive: wallet.isActive,
    isArchived: wallet.deletedAt !== null,
    createdAt: wallet.createdAt.toISOString(),
    updatedAt: wallet.updatedAt.toISOString(),
  };
}

export async function getWalletList(
  options: GetWalletListOptions = {},
): Promise<WalletListItem[]> {
  const archiveFilter = options.archiveFilter ?? "active";
  const customerNames = await buildCustomerNameMap();

  if (archiveFilter === "archived") {
    const wallets = await listWallets({
      includeDeleted: true,
      type: options.type,
      customerId: options.customerId,
    });

    return wallets
      .filter((wallet) => wallet.deletedAt !== null)
      .map((wallet) => toWalletListItem(wallet, customerNames));
  }

  const wallets = await listWallets({
    type: options.type,
    customerId: options.customerId,
  });

  return wallets.map((wallet) => toWalletListItem(wallet, customerNames));
}
