/**
 * Product rules for the Currency Exchange desk UI / actions.
 * Keep Settings catalog rates as the default source; override is optional.
 */
export const EXCHANGE_BUSINESS_RULES = {
  /**
   * When true, cashiers may edit the deal rate before posting.
   * When false, the rate field is read-only and the service loads the market rate.
   */
  allowManualRateOverride: true,
} as const;

export type ExchangeBusinessRules = typeof EXCHANGE_BUSINESS_RULES;
