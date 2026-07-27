/**
 * UI-layer helpers that pick default internal wallets so operators never
 * choose wallets for normal money-movement flows.
 *
 * Does not change Posting Service or ledger behavior — callers still pass
 * the resolved wallet IDs into existing feature actions/services.
 */

import {
  CASH_TILL_WALLET_NAME,
  HAWALA_CLEARING_WALLET_NAME,
  MAIN_VAULT_WALLET_NAME,
} from "@/features/wallets/domain/wallet-descriptions";

export type FormWalletOption = {
  id: string;
  label: string;
  type?: string;
  customerId?: string | null;
};

export type WalletResolveResult =
  | { ok: true; walletId: string }
  | { ok: false; message: string };

function preferNamedWallet(
  wallets: FormWalletOption[],
  preferredNames: string[],
): FormWalletOption | undefined {
  for (const name of preferredNames) {
    const match = wallets.find((wallet) => wallet.label === name);
    if (match) {
      return match;
    }
  }
  return wallets[0];
}

/**
 * Resolves the single CUSTOMER wallet for a customer.
 * Multiple wallets are treated as a configuration error (not a picker).
 */
export function resolveCustomerWalletId(
  wallets: FormWalletOption[],
  customerId: string,
): WalletResolveResult {
  const trimmed = customerId.trim();
  if (!trimmed) {
    return { ok: false, message: "Customer is required." };
  }

  const matches = wallets.filter(
    (wallet) =>
      wallet.type === "CUSTOMER" && wallet.customerId === trimmed,
  );

  if (matches.length === 0) {
    return {
      ok: false,
      message:
        "This customer has no account wallet. Create one on the Wallets page, then try again.",
    };
  }

  if (matches.length > 1) {
    return {
      ok: false,
      message:
        "This customer has more than one wallet. Ask an administrator to keep a single customer wallet.",
    };
  }

  return { ok: true, walletId: matches[0].id };
}

/**
 * Resolves the operating cash wallet (Cash Till, else Main Vault, else first
 * VAULT/TILL). Accepts either typed wallet lists or pre-filtered cash options.
 */
export function resolveCashWalletId(
  wallets: FormWalletOption[],
): WalletResolveResult {
  const cashWallets = wallets.filter((wallet) => {
    if (wallet.type === "VAULT" || wallet.type === "TILL") {
      return true;
    }
    // Pre-filtered cash option lists often omit type.
    if (wallet.type == null) {
      return true;
    }
    return false;
  });

  const preferred = preferNamedWallet(cashWallets, [
    CASH_TILL_WALLET_NAME,
    MAIN_VAULT_WALLET_NAME,
  ]);

  if (!preferred) {
    return {
      ok: false,
      message:
        "No cash till or vault wallet is available. Create one on the Wallets page, then try again.",
    };
  }

  return { ok: true, walletId: preferred.id };
}

/**
 * Resolves the Hawala Clearing system wallet (by name, else first SYSTEM option).
 */
export function resolveHawalaClearingWalletId(
  wallets: FormWalletOption[],
): WalletResolveResult {
  const systemWallets = wallets.filter((wallet) => {
    if (wallet.type === "SYSTEM") {
      return true;
    }
    if (wallet.type == null) {
      return true;
    }
    return false;
  });

  const preferred = preferNamedWallet(systemWallets, [
    HAWALA_CLEARING_WALLET_NAME,
  ]);

  if (!preferred) {
    return {
      ok: false,
      message:
        "No hawala clearing wallet is available. Create the Hawala Clearing system wallet, then try again.",
    };
  }

  return { ok: true, walletId: preferred.id };
}
