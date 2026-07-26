export type ExchangeRateInput = {
  baseCurrencyId: string;
  quoteCurrencyId: string;
  /** Major-unit rate string, e.g. "70" meaning 1 base = 70 quote. */
  rate: string;
  /** Calendar date `YYYY-MM-DD`. */
  effectiveDate: string;
  isActive: boolean;
};

export type ExchangeRateListItem = {
  id: string;
  baseCurrencyId: string;
  baseCurrencyCode: string;
  quoteCurrencyId: string;
  quoteCurrencyCode: string;
  /** Display string for quote units per 1 base unit. */
  rateDisplay: string;
  effectiveDate: string;
  effectiveAt: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ExchangeRateCurrencyOption = {
  id: string;
  code: string;
  label: string;
};

export type ExchangeRateFormOptions = {
  currencies: ExchangeRateCurrencyOption[];
};

export type ExchangeRateFormData = {
  id: string;
  baseCurrencyId: string;
  quoteCurrencyId: string;
  rate: string;
  effectiveDate: string;
  isActive: boolean;
};
