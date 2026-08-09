/**
 * Product rules for the Currency Exchange desk.
 * Board rates come from Settings (quote per 1 base) as a starting value.
 * Cashiers enter/adjust the daily rate on the desk before posting.
 * Conversion multiplies when going base→quote and divides when going quote→base.
 */
export const EXCHANGE_BUSINESS_RULES = {
  /**
   * When true, cashiers may enter/edit the daily board rate before posting.
   * Settings rate (if any) is still loaded as the default.
   */
  allowManualRateOverride: true,
} as const;

export type ExchangeBusinessRules = typeof EXCHANGE_BUSINESS_RULES;
