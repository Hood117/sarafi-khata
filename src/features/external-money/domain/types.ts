export type ExternalMoneyArchiveFilter = "active" | "archived";

export type ExternalMoneyListItem = {
  id: string;
  reference: string;
  notes: string | null;
  currencyCode: string;
  currencySymbol: string | null;
  currencyLabel: string;
  amountDisplay: string;
  amountFormatted: string;
  cashWalletName: string;
  operatorName: string | null;
  valueDate: string;
  isArchived: boolean;
};

export type ExternalMoneyListOptions = {
  search?: string;
  archiveFilter?: ExternalMoneyArchiveFilter;
};
