/**
 * Public API for the transactions feature.
 * Import from this module only — do not reach into internal folders.
 */

export {
  createTransaction,
  findTransactionById,
  findTransactionByReference,
  listTransactions,
  updateTransaction,
  softDeleteTransaction,
  type CreateTransactionData,
  type UpdateTransactionData,
  type TransactionListOptions,
} from "@/features/transactions/repositories/transaction-repository";
