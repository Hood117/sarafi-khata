import "server-only";

import type { Wallet } from "@/generated/prisma/client";
import { WalletError } from "@/features/wallets/domain/errors";
import {
  findWalletById,
  softDeleteWallet,
} from "@/features/wallets/repositories/wallet-repository";

export async function archiveWalletRecord(id: string): Promise<Wallet> {
  const wallet = await findWalletById(id);

  if (!wallet) {
    throw new WalletError("NOT_FOUND", "Wallet not found.");
  }

  return softDeleteWallet(id);
}
