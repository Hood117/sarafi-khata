/**
 * Public API for the currencies feature.
 * Import from this module only — do not reach into internal folders.
 */

export {
  CurrencyError,
  isCurrencyError,
  type CurrencyErrorCode,
  type CurrencyField,
} from "@/features/currencies/domain/errors";

export type {
  CurrencyFormData,
  CurrencyInput,
  CurrencyListItem,
} from "@/features/currencies/domain/types";

export {
  createCurrencySchema,
  updateCurrencySchema,
  toCurrencyFormFieldErrors,
  type CreateCurrencySchemaInput,
  type CreateCurrencySchemaOutput,
  type UpdateCurrencySchemaOutput,
  type CurrencyFormFieldErrors,
} from "@/features/currencies/schemas/currency-form";

export {
  createCurrency,
  findCurrencyById,
  findCurrencyByCode,
  listCurrencies,
  updateCurrency,
  type CreateCurrencyData,
  type UpdateCurrencyData,
  type CurrencyListOptions,
} from "@/features/currencies/repositories/currency-repository";

export {
  getCurrencyList,
  type GetCurrencyListOptions,
} from "@/features/currencies/services/list-currencies";
export {
  getCurrencyById,
  getCurrencyForForm,
} from "@/features/currencies/services/get-currency";
export { createCurrencyRecord } from "@/features/currencies/services/create-currency";
export { updateCurrencyRecord } from "@/features/currencies/services/update-currency";
export { setCurrencyActiveRecord } from "@/features/currencies/services/set-currency-active";

export {
  createCurrencyAction,
  updateCurrencyAction,
  setCurrencyActiveAction,
  getCurrencyForEditAction,
  type CreateCurrencyActionInput,
  type CreateCurrencyActionResult,
  type UpdateCurrencyActionInput,
  type UpdateCurrencyActionResult,
  type SetCurrencyActiveActionResult,
  type GetCurrencyForEditActionResult,
  type CurrencyMutationActionResult,
  type CurrencyFieldErrors,
} from "@/features/currencies/actions/currency-actions";

export { CurrenciesView } from "@/features/currencies/components/currencies-view";
export { CurrenciesTable } from "@/features/currencies/components/currencies-table";
export { CurrenciesTableSkeleton } from "@/features/currencies/components/currencies-table-skeleton";
export { CurrenciesEmptyState } from "@/features/currencies/components/currencies-empty-state";
export { CurrenciesPageHeader } from "@/features/currencies/components/currencies-page-header";
export { AddCurrencyDialog } from "@/features/currencies/components/add-currency-dialog";
export { EditCurrencyDialog } from "@/features/currencies/components/edit-currency-dialog";
export { SetCurrencyActiveButton } from "@/features/currencies/components/set-currency-active-button";
export {
  CurrencyForm,
  emptyCurrencyFormValues,
  type CurrencyFormValues,
} from "@/features/currencies/components/currency-form";
