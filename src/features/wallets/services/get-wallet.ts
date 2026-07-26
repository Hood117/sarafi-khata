import "server-only";

import { findCustomerById } from "@/features/customers/repositories/customer-repository";
import { WalletError } from "@/features/wallets/domain/errors";
import type {
  WalletDetail,
  WalletFormData,
} from "@/features/wallets/domain/types";
import { getWalletDescription } from "@/features/wallets/domain/wallet-descriptions";
import { findWalletById } from "@/features/wallets/repositories/wallet-repository";

export async function getWalletById(
  id: string,
  options: { includeArchived?: boolean } = {},
): Promise<WalletDetail> {
  const wallet = await findWalletById(id, {
    includeDeleted: options.includeArchived ?? false,
  });

  if (!wallet) {
    throw new WalletError("NOT_FOUND", "Wallet not found.");
  }

  let customerName: string | null = null;
  if (wallet.customerId) {
    const customer = await findCustomerById(wallet.customerId, {
      includeDeleted: true,
    });
    customerName = customer?.fullName ?? null;
  }

  return {
    id: wallet.id,
    name: wallet.name,
    type: wallet.type,
    description: getWalletDescription(wallet.name),
    customerId: wallet.customerId,
    customerName,
    isActive: wallet.isActive,
    isArchived: wallet.deletedAt !== null,
    createdAt: wallet.createdAt.toISOString(),
    updatedAt: wallet.updatedAt.toISOString(),
  };
}

export async function getWalletForForm(id: string): Promise<WalletFormData> {
  const wallet = await findWalletById(id);

  if (!wallet) {
    throw new WalletError("NOT_FOUND", "Wallet not found.");
  }

  return {
    id: wallet.id,
    name: wallet.name,
    type: wallet.type,
    customerId: wallet.customerId,
  };
}
