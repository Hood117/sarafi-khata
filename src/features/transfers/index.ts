/**
 * Public API for the Customer Transfer desk UI.
 * Financial writes go through `createTransferAction` → `transferFunds` only.
 */

export type {
  TransferCurrencyOption,
  TransferCustomerOption,
  TransferFormOptions,
  TransferHistoryListItem,
  GetTransferHistoryOptions,
  TransferDetail,
} from "@/features/transfers/domain/types";

export { createTransferReference } from "@/features/transfers/domain/create-transfer-reference";
export { deriveTransferSummaryFromLedgerRows } from "@/features/transfers/domain/derive-transfer-summary";

export { getTransferFormOptions } from "@/features/transfers/services/get-transfer-form-options";
export { getTransferHistory } from "@/features/transfers/services/list-transfer-history";
export { getTransferDetail } from "@/features/transfers/services/get-transfer-detail";

export {
  transferFormSchema,
  toTransferFormFieldErrors,
  type TransferFormFieldErrors,
  type TransferFormSchemaInput,
  type TransferFormSchemaOutput,
} from "@/features/transfers/schemas/transfer-form";

export {
  TransferForm,
  emptyTransferFormValues,
  type TransferFormValues,
} from "@/features/transfers/components/transfer-form";
export { TransferView } from "@/features/transfers/components/transfer-view";
export { TransferPageSkeleton } from "@/features/transfers/components/transfer-page-skeleton";
export { TransferHistoryTable } from "@/features/transfers/components/transfer-history-table";
export { TransferHistoryTableSkeleton } from "@/features/transfers/components/transfer-history-table-skeleton";
export { TransferHistoryEmptyState } from "@/features/transfers/components/transfer-history-empty-state";
export { TransferHistoryFilters } from "@/features/transfers/components/transfer-history-filters";
export { TransferDetailView } from "@/features/transfers/components/transfer-detail";
export { TransferDetailSkeleton } from "@/features/transfers/components/transfer-detail-skeleton";
