export type CurrencyInput = {
  code: string;
  name: string;
  symbol?: string | null;
  isActive: boolean;
};

export type CurrencyListItem = {
  id: string;
  code: string;
  name: string;
  symbol: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CurrencyFormData = {
  id: string;
  code: string;
  name: string;
  symbol: string | null;
  isActive: boolean;
};
