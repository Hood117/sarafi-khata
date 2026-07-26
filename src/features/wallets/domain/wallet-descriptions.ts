/**
 * Display-only descriptions for seeded system / operating wallets.
 * Does not persist to the database or change wallet behavior.
 */

export const SYSTEM_WALLET_DESCRIPTIONS = {
  "Main Vault": "Primary cash storage.",
  "Cash Till": "Daily operating cash.",
  "Exchange Difference": "Currency exchange profit/loss tracking.",
  "Hawala Clearing": "Settlement wallet for Hawala operations.",
} as const;

export type KnownSystemWalletName = keyof typeof SYSTEM_WALLET_DESCRIPTIONS;

export function getWalletDescription(name: string): string | null {
  const description =
    SYSTEM_WALLET_DESCRIPTIONS[name as KnownSystemWalletName];
  return description ?? null;
}
