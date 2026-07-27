/**
 * Display-only descriptions for seeded system / operating wallets.
 * Does not persist to the database or change wallet behavior.
 */

/** Seeded SYSTEM wallet used for FX balancing / P/L legs. */
export const EXCHANGE_DIFFERENCE_WALLET_NAME = "Exchange Difference";

/** Preferred operating cash wallet for day-to-day money movement. */
export const CASH_TILL_WALLET_NAME = "Cash Till";

/** Primary vault wallet (fallback when Cash Till is unavailable). */
export const MAIN_VAULT_WALLET_NAME = "Main Vault";

/** Seeded SYSTEM wallet for hawala settlement. */
export const HAWALA_CLEARING_WALLET_NAME = "Hawala Clearing";

export const SYSTEM_WALLET_DESCRIPTIONS = {
  [MAIN_VAULT_WALLET_NAME]: "Primary cash storage.",
  [CASH_TILL_WALLET_NAME]: "Daily operating cash.",
  [EXCHANGE_DIFFERENCE_WALLET_NAME]: "Currency exchange profit/loss tracking.",
  [HAWALA_CLEARING_WALLET_NAME]: "Settlement wallet for Hawala operations.",
} as const;

export type KnownSystemWalletName = keyof typeof SYSTEM_WALLET_DESCRIPTIONS;

export function getWalletDescription(name: string): string | null {
  const description =
    SYSTEM_WALLET_DESCRIPTIONS[name as KnownSystemWalletName];
  return description ?? null;
}
