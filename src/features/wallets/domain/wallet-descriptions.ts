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

/**
 * SYSTEM contra for walk-in / external SEND principal.
 * Keeps shop cash unchanged when the sender is not a book customer.
 */
export const HAWALA_WALK_IN_OUTBOUND_WALLET_NAME = "Hawala Walk-in Outbound";

/** SYSTEM wallet used when opening customer wallet money increases both cash and customer balance. */
export const OPENING_EQUITY_WALLET_NAME = "Opening Equity";

/** SYSTEM P&L wallet when paying partner hawala commission. */
export const PARTNER_COMMISSION_EXPENSE_WALLET_NAME =
  "Partner Commission Expense";

/** SYSTEM P&L wallet when collecting partner hawala commission. */
export const PARTNER_COMMISSION_INCOME_WALLET_NAME =
  "Partner Commission Income";

/** SYSTEM P&L wallet for our shop fee earned on send/receive hawala. */
export const OWN_HAWALA_COMMISSION_INCOME_WALLET_NAME =
  "Hawala Commission Income";

export const SYSTEM_WALLET_DESCRIPTIONS = {
  [MAIN_VAULT_WALLET_NAME]: "Primary cash storage.",
  [CASH_TILL_WALLET_NAME]: "Daily operating cash.",
  [EXCHANGE_DIFFERENCE_WALLET_NAME]: "Currency exchange profit/loss tracking.",
  [HAWALA_CLEARING_WALLET_NAME]: "Settlement wallet for Hawala operations.",
  [HAWALA_WALK_IN_OUTBOUND_WALLET_NAME]:
    "Contra for walk-in / external hawala send principal (does not move shop cash).",
  [OPENING_EQUITY_WALLET_NAME]:
    "Balancing account when customer opening money increases cash and customer wallet.",
  [PARTNER_COMMISSION_EXPENSE_WALLET_NAME]:
    "Commission paid to partner sarafis on hawala.",
  [PARTNER_COMMISSION_INCOME_WALLET_NAME]:
    "Commission collected from partner sarafis on hawala.",
  [OWN_HAWALA_COMMISSION_INCOME_WALLET_NAME]:
    "Our shop commission earned on hawala send and receive.",
} as const;

export type KnownSystemWalletName = keyof typeof SYSTEM_WALLET_DESCRIPTIONS;

export function getWalletDescription(name: string): string | null {
  const description =
    SYSTEM_WALLET_DESCRIPTIONS[name as KnownSystemWalletName];
  return description ?? null;
}
