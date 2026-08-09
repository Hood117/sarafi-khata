import "server-only";

import type { Wallet } from "@/generated/prisma/client";
import { TransactionError } from "@/features/transactions/domain/transaction-errors";
import { EXCHANGE_DIFFERENCE_WALLET_NAME } from "@/features/wallets/domain/wallet-descriptions";
import { findWalletByName } from "@/features/wallets/repositories/wallet-repository";

/**
 * Resolve the seeded SYSTEM wallet used to balance multi-currency EXCHANGE posts.
 */
export async function resolveExchangeDifferenceWallet(): Promise<Wallet> {
  const wallet = await findWalletByName(EXCHANGE_DIFFERENCE_WALLET_NAME, {
    type: "SYSTEM",
  });

  if (!wallet) {
    throw new TransactionError(
      "NOT_FOUND",
      `System wallet "${EXCHANGE_DIFFERENCE_WALLET_NAME}" was not found. Run database seed.`,
    );
  }

  if (!wallet.isActive) {
    throw new TransactionError(
      "INACTIVE",
      `System wallet "${EXCHANGE_DIFFERENCE_WALLET_NAME}" is inactive and cannot be used for exchange.`,
    );
  }

  return wallet;
}
