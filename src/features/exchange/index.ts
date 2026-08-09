/**
 * Public API for the Currency Exchange desk UI.
 * Financial writes go through `createExchangeAction` → `exchangeFunds` only.
 */

export { EXCHANGE_BUSINESS_RULES } from "@/features/exchange/domain/business-rules";
export type { ExchangeBusinessRules } from "@/features/exchange/domain/business-rules";

export type {
  ExchangeCurrencyOption,
  ExchangeCustomerOption,
  ExchangeDetail,
  ExchangeFormOptions,
  ExchangeHistoryListItem,
  ExchangeRateOption,
  ExchangeWalletOption,
  GetExchangeHistoryOptions,
} from "@/features/exchange/domain/types";

export { getExchangeFormOptions } from "@/features/exchange/services/get-exchange-form-options";
export {
  getExchangeHistory,
  getExchangeHistoryPage,
} from "@/features/exchange/services/list-exchange-history";
export { getExchangeDetail } from "@/features/exchange/services/get-exchange-detail";

export {
  exchangeFormSchema,
  toExchangeFormFieldErrors,
  type ExchangeFormFieldErrors,
  type ExchangeFormSchemaInput,
  type ExchangeFormSchemaOutput,
} from "@/features/exchange/schemas/exchange-form";

export {
  ExchangeForm,
  emptyExchangeFormValues,
  type ExchangeFormValues,
} from "@/features/exchange/components/exchange-form";
export { ExchangeView } from "@/features/exchange/components/exchange-view";
export { ExchangePageSkeleton } from "@/features/exchange/components/exchange-page-skeleton";
export { ExchangeHistoryTable } from "@/features/exchange/components/exchange-history-table";
export { ExchangeHistoryTableSkeleton } from "@/features/exchange/components/exchange-history-table-skeleton";
export { ExchangeHistoryEmptyState } from "@/features/exchange/components/exchange-history-empty-state";
export { ExchangeHistoryFilters } from "@/features/exchange/components/exchange-history-filters";
export { ExchangeDetailView } from "@/features/exchange/components/exchange-detail";
export { ExchangeDetailSkeleton } from "@/features/exchange/components/exchange-detail-skeleton";
