import "server-only";

import type { Prisma, Wallet, WalletType } from "@/generated/prisma/client";
import { prisma } from "@/server/db";

export type CreateWalletData = Prisma.WalletCreateInput;
export type UpdateWalletData = Prisma.WalletUpdateInput;

export type WalletListOptions = {
  includeDeleted?: boolean;
  isActive?: boolean;
  type?: WalletType;
  customerId?: string;
};

function notDeleted(): Prisma.WalletWhereInput {
  return { deletedAt: null };
}

export async function createWallet(data: CreateWalletData): Promise<Wallet> {
  return prisma.wallet.create({ data });
}

export async function findWalletById(
  id: string,
  options: { includeDeleted?: boolean } = {},
): Promise<Wallet | null> {
  return prisma.wallet.findFirst({
    where: {
      id,
      ...(options.includeDeleted ? {} : notDeleted()),
    },
  });
}

export async function findWalletByName(
  name: string,
  options: { includeDeleted?: boolean; type?: WalletType } = {},
): Promise<Wallet | null> {
  return prisma.wallet.findFirst({
    where: {
      name,
      ...(options.type ? { type: options.type } : {}),
      ...(options.includeDeleted ? {} : notDeleted()),
    },
  });
}

export async function listWallets(
  options: WalletListOptions = {},
): Promise<Wallet[]> {
  const where: Prisma.WalletWhereInput = {
    ...(options.includeDeleted ? {} : notDeleted()),
    ...(typeof options.isActive === "boolean"
      ? { isActive: options.isActive }
      : {}),
    ...(options.type ? { type: options.type } : {}),
    ...(options.customerId ? { customerId: options.customerId } : {}),
  };

  return prisma.wallet.findMany({
    where,
    orderBy: { name: "asc" },
  });
}

export async function updateWallet(
  id: string,
  data: UpdateWalletData,
): Promise<Wallet> {
  return prisma.wallet.update({
    where: { id },
    data,
  });
}

export async function softDeleteWallet(id: string): Promise<Wallet> {
  return prisma.wallet.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      isActive: false,
    },
  });
}
