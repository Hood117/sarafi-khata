/**
 * Public API for the transactions feature.
 * Import from this module only — do not reach into internal folders.
 *
 * Money movements must go through `postTransaction` (or deposit/withdraw/adjust/
 * exchange services that call it). Transaction/ledger writes are not exported here.
 */

export {
  findTransactionById,
  findTransactionByReference,
  listTransactions,
  type TransactionListOptions,
} from "@/features/transactions/repositories/transaction-repository";

export { postTransaction } from "@/features/transactions/services/post-transaction";
export { depositFunds } from "@/features/transactions/services/deposit";
export { withdrawFunds } from "@/features/transactions/services/withdraw";
export { adjustFunds } from "@/features/transactions/services/adjust";
export {
  exchangeFunds,
  type ExchangeParams,
  type ExchangeFundsResult,
} from "@/features/transactions/services/exchange";

export type {
  PostingLineInput,
  PostTransactionInput,
  PostedTransaction,
  TransactionListItem,
  TransactionLedgerEntryRow,
  TransactionDetail,
  TransactionFormType,
  CustomerHistorySort,
  CustomerHistoryFilters,
  CustomerHistoryEvent,
  CustomerHistoryResult,
  GetCustomerHistoryOptions,
  TransactionCustomerOption,
  TransactionWalletOption,
  TransactionCurrencyOption,
  TransactionFormOptions,
} from "@/features/transactions/domain/types";

export {
  TRANSACTION_TYPE_LABELS,
  TRANSACTION_STATUS_LABELS,
} from "@/features/transactions/domain/labels";

export { getTransactionList } from "@/features/transactions/services/list-transactions";
export { getTransactionDetail } from "@/features/transactions/services/get-transaction-detail";
export { getCustomerHistory } from "@/features/transactions/services/get-customer-history";
export { getTransactionFormOptions } from "@/features/transactions/services/get-transaction-form-options";

export { TransactionsView } from "@/features/transactions/components/transactions-view";
export { TransactionsTable } from "@/features/transactions/components/transactions-table";
export { TransactionsTableSkeleton } from "@/features/transactions/components/transactions-table-skeleton";
export { TransactionsEmptyState } from "@/features/transactions/components/transactions-empty-state";
export { TransactionsPageHeader } from "@/features/transactions/components/transactions-page-header";
export { AddTransactionDialog } from "@/features/transactions/components/add-transaction-dialog";
export {
  TransactionForm,
  emptyTransactionFormValues,
  type TransactionFormValues,
} from "@/features/transactions/components/transaction-form";
export { TransactionDetailView } from "@/features/transactions/components/transaction-detail";
export { TransactionDetailSkeleton } from "@/features/transactions/components/transaction-detail-skeleton";
export { TransactionReceipt } from "@/features/transactions/components/transaction-receipt";
export { PrintReceiptButton } from "@/features/transactions/components/print-receipt-button";

export {
  PostingError,
  isPostingError,
  type PostingErrorCode,
} from "@/features/transactions/domain/errors";

export {
  TransactionError,
  isTransactionError,
  type TransactionErrorCode,
  type TransactionField,
} from "@/features/transactions/domain/transaction-errors";

export {
  isTransactionType,
  normalizePostTransactionInput,
  type NormalizedPostTransactionInput,
} from "@/features/transactions/domain/transaction-rules";

export {
  depositSchema,
  withdrawalSchema,
  manualAdjustmentSchema,
  exchangeSchema,
  toDepositFieldErrors,
  toWithdrawalFieldErrors,
  toManualAdjustmentFieldErrors,
  toExchangeFieldErrors,
  type DepositInput,
  type WithdrawalInput,
  type ManualAdjustmentInput,
  type ExchangeInput,
  type DepositFieldErrors,
  type WithdrawalFieldErrors,
  type ManualAdjustmentFieldErrors,
  type ExchangeFieldErrors,
} from "@/features/transactions/schemas/money-movement";

export {
  transactionFormSchema,
  transactionFormTypeSchema,
  toTransactionFormFieldErrors,
  type TransactionFormSchemaInput,
  type TransactionFormSchemaOutput,
  type TransactionFormFieldErrors,
} from "@/features/transactions/schemas/transaction-form";

export {
  depositAction,
  withdrawalAction,
  manualAdjustmentAction,
  createExchangeAction,
  type DepositActionInput,
  type WithdrawalActionInput,
  type ManualAdjustmentActionInput,
  type CreateExchangeActionInput,
  type DepositActionResult,
  type WithdrawalActionResult,
  type ManualAdjustmentActionResult,
  type CreateExchangeActionResult,
  type TransactionMutationActionResult,
  type TransactionFieldErrors,
} from "@/features/transactions/actions/transaction-actions";
