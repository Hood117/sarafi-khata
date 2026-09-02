import type { WalletListItem } from "@desktop/api";
import type { Dictionary } from "@/lib/i18n/messages/types";

/**
 * Shop cash is always Main Vault (VAULT). TILL rows may still appear in
 * historical ledgers/receipts; helpers below keep friendly labels for those.
 * Never treat SYSTEM / equity / clearing / commission as user-facing cash.
 */
export function isUserFacingCashWallet(wallet: {
  type: string;
}): boolean {
  const wt = (wallet.type || "").toUpperCase();
  return wt === "VAULT" || wt === "TILL";
}

/** Filter wallet lists for cash UI / historical display. */
export function userFacingCashWallets<T extends { type: string }>(
  wallets: T[],
): T[] {
  return wallets.filter(isUserFacingCashWallet);
}

export type CashWalletNameLabels = {
  mainVault: string;
  cashTill: string;
};

const DEFAULT_CASH_LABELS: CashWalletNameLabels = {
  mainVault: "Main Vault",
  cashTill: "Cash Till",
};

export function cashWalletLabelsFromT(t: Dictionary): CashWalletNameLabels {
  return { mainVault: t.desk.mainVault, cashTill: t.desk.cashTill };
}

/**
 * Display label for cash wallets (current Main Vault + historical Cash Till names).
 * Forms no longer pick a till — backend posts against Main Vault only.
 */
export function cashWalletLabel(
  wallet: {
    type: string;
    name: string;
  },
  labels: CashWalletNameLabels = DEFAULT_CASH_LABELS,
): string {
  const wt = (wallet.type || "").toUpperCase();
  if (wt === "VAULT") {
    const n = wallet.name.trim();
    if (!n || /^main\s*vault$/i.test(n) || /^vault$/i.test(n)) return labels.mainVault;
    return n;
  }
  if (wt === "TILL") {
    const n = wallet.name.trim();
    if (!n || /^cash\s*till$/i.test(n) || /^till$/i.test(n) || /^cashier/i.test(n)) {
      return labels.cashTill;
    }
    return n;
  }
  return wallet.name;
}

/** Localized cash wallet label (receipts / history). */
export function cashWalletLabelT(
  t: Dictionary,
  wallet: { type: string; name: string },
): string {
  return cashWalletLabel(wallet, cashWalletLabelsFromT(t));
}

/** Label for any wallet option (cash → friendly; customer/other → name). */
export function walletSelectLabel(
  wallet: {
    type: string;
    name: string;
  },
  labels?: CashWalletNameLabels,
): string {
  if (isUserFacingCashWallet(wallet)) return cashWalletLabel(wallet, labels);
  return wallet.name;
}

/** Prefer Main Vault then legacy Cash Till ordering when listing cash wallets. */
export function sortCashWallets<T extends WalletListItem>(
  wallets: T[],
  labels?: CashWalletNameLabels,
): T[] {
  const rank = (type: string) => {
    const u = type.toUpperCase();
    if (u === "VAULT") return 0;
    if (u === "TILL") return 1;
    return 2;
  };
  return [...wallets].sort((a, b) => {
    const d = rank(a.type) - rank(b.type);
    if (d !== 0) return d;
    return cashWalletLabel(a, labels).localeCompare(cashWalletLabel(b, labels));
  });
}
