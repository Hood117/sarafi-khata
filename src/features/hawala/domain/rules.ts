import type { Wallet } from "@/generated/prisma/client";
import { HawalaError } from "@/features/hawala/domain/errors";

export function assertCashWallet(wallet: Wallet): void {
  if (wallet.type !== "VAULT" && wallet.type !== "TILL") {
    throw new HawalaError(
      "VALIDATION",
      "Cash wallet must be a vault or till.",
      { cashWalletId: "Select a vault or till wallet." },
    );
  }
}

export function assertClearingWallet(wallet: Wallet): void {
  if (wallet.type !== "SYSTEM") {
    throw new HawalaError(
      "VALIDATION",
      "Clearing wallet must be a system wallet.",
      { clearingWalletId: "Select a system clearing wallet." },
    );
  }
}

export function assertDistinctWallets(
  cashWalletId: string,
  clearingWalletId: string,
): void {
  if (cashWalletId === clearingWalletId) {
    throw new HawalaError(
      "VALIDATION",
      "Cash wallet and clearing wallet must be different.",
      { clearingWalletId: "Must be different from the cash wallet." },
    );
  }
}
