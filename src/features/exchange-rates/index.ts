/**
 * Public API for the exchange-rates feature.
 * Import from this module only — do not reach into internal folders.
 *
 * Rates are master data only. Money movements still go through
 * `@/features/transactions` `postTransaction` — this feature does not post.
 */

export {
  ExchangeRateError,
  isExchangeRateError,
  type ExchangeRateErrorCode,
  type ExchangeRateField,
} from "@/features/exchange-rates/domain/errors";

export {
  EXCHANGE_RATE_MAX_DECIMALS,
  formatEffectiveDate,
  formatRateDisplay,
  isPositiveRateString,
  normalizeRateString,
  parseEffectiveDate,
} from "@/features/exchange-rates/domain/rate";

export type {
  ExchangeRateCurrencyOption,
  ExchangeRateFormData,
  ExchangeRateFormOptions,
  ExchangeRateInput,
  ExchangeRateListItem,
} from "@/features/exchange-rates/domain/types";

export {
  createExchangeRateSchema,
  updateExchangeRateSchema,
  toExchangeRateFormFieldErrors,
  type CreateExchangeRateSchemaInput,
  type CreateExchangeRateSchemaOutput,
  type UpdateExchangeRateSchemaOutput,
  type ExchangeRateFormFieldErrors,
} from "@/features/exchange-rates/schemas/exchange-rate-form";

export {
  createExchangeRateRecord,
  findExchangeRateById,
  findExchangeRateWithCurrenciesById,
  listExchangeRatesWithCurrencies,
  updateExchangeRateRecord,
  setExchangeRateActive,
  type CreateExchangeRateRecordData,
  type UpdateExchangeRateRecordData,
  type ExchangeRateListOptions,
  type ExchangeRateWithCurrencies,
} from "@/features/exchange-rates/repositories/exchange-rate-repository";

export {
  getExchangeRateList,
  type GetExchangeRateListOptions,
} from "@/features/exchange-rates/services/list-exchange-rates";
export {
  getExchangeRateById,
  getExchangeRateForForm,
} from "@/features/exchange-rates/services/get-exchange-rate";
export { getExchangeRateFormOptions } from "@/features/exchange-rates/services/get-exchange-rate-form-options";
export { createExchangeRateEntry } from "@/features/exchange-rates/services/create-exchange-rate";
export { updateExchangeRateEntry } from "@/features/exchange-rates/services/update-exchange-rate";
export { setExchangeRateActiveRecord } from "@/features/exchange-rates/services/set-exchange-rate-active";

export {
  createExchangeRateAction,
  updateExchangeRateAction,
  setExchangeRateActiveAction,
  getExchangeRateForEditAction,
  getExchangeRateFormOptionsAction,
  type CreateExchangeRateActionInput,
  type CreateExchangeRateActionResult,
  type UpdateExchangeRateActionInput,
  type UpdateExchangeRateActionResult,
  type SetExchangeRateActiveActionResult,
  type GetExchangeRateForEditActionResult,
  type GetExchangeRateFormOptionsActionResult,
  type ExchangeRateMutationActionResult,
  type ExchangeRateFieldErrors,
} from "@/features/exchange-rates/actions/exchange-rate-actions";

export { ExchangeRatesView } from "@/features/exchange-rates/components/exchange-rates-view";
export { ExchangeRatesTable } from "@/features/exchange-rates/components/exchange-rates-table";
export { ExchangeRatesTableSkeleton } from "@/features/exchange-rates/components/exchange-rates-table-skeleton";
export { ExchangeRatesEmptyState } from "@/features/exchange-rates/components/exchange-rates-empty-state";
export { ExchangeRatesPageHeader } from "@/features/exchange-rates/components/exchange-rates-page-header";
export { AddExchangeRateDialog } from "@/features/exchange-rates/components/add-exchange-rate-dialog";
export { EditExchangeRateDialog } from "@/features/exchange-rates/components/edit-exchange-rate-dialog";
export { SetExchangeRateActiveButton } from "@/features/exchange-rates/components/set-exchange-rate-active-button";
export {
  ExchangeRateForm,
  emptyExchangeRateFormValues,
  type ExchangeRateFormValues,
} from "@/features/exchange-rates/components/exchange-rate-form";
