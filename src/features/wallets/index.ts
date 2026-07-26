/**
 * Public API for the wallets feature.
 * Import from this module only — do not reach into internal folders.
 */

export {
  createWallet,
  findWalletById,
  findWalletByName,
  listWallets,
  updateWallet,
  softDeleteWallet,
  type CreateWalletData,
  type UpdateWalletData,
  type WalletListOptions,
} from "@/features/wallets/repositories/wallet-repository";

export { WalletError, isWalletError } from "@/features/wallets/domain/errors";
export type { WalletErrorCode, WalletField } from "@/features/wallets/domain/errors";
export {
  EXCHANGE_DIFFERENCE_WALLET_NAME,
  getWalletDescription,
  SYSTEM_WALLET_DESCRIPTIONS,
} from "@/features/wallets/domain/wallet-descriptions";
export { normalizeWalletInput } from "@/features/wallets/domain/wallet-rules";
export type {
  CustomerWalletBalanceRow,
  WalletArchiveFilter,
  WalletCustomerOption,
  WalletDetail,
  WalletFormData,
  WalletInput,
  WalletListItem,
} from "@/features/wallets/domain/types";

export {
  walletFormSchema,
  walletTypeSchema,
  toWalletFormFieldErrors,
  type WalletFormSchemaInput,
  type WalletFormSchemaOutput,
  type WalletFormFieldErrors,
} from "@/features/wallets/schemas/wallet-form";

export { createWalletRecord } from "@/features/wallets/services/create-wallet";
export { updateWalletRecord } from "@/features/wallets/services/update-wallet";
export {
  getWalletList,
  type GetWalletListOptions,
} from "@/features/wallets/services/list-wallets";
export {
  getWalletById,
  getWalletForForm,
} from "@/features/wallets/services/get-wallet";
export { archiveWalletRecord } from "@/features/wallets/services/archive-wallet";
export { getCustomerWalletBalanceRows } from "@/features/wallets/services/get-customer-wallets";

export {
  createWalletAction,
  updateWalletAction,
  archiveWalletAction,
  getWalletForEditAction,
  type CreateWalletActionInput,
  type CreateWalletActionResult,
  type UpdateWalletActionInput,
  type UpdateWalletActionResult,
  type ArchiveWalletActionResult,
  type GetWalletForEditActionResult,
  type WalletMutationActionResult,
  type WalletFieldErrors,
} from "@/features/wallets/actions/wallet-actions";

export { WalletsView } from "@/features/wallets/components/wallets-view";
export { WalletsTable } from "@/features/wallets/components/wallets-table";
export { WalletsTableSkeleton } from "@/features/wallets/components/wallets-table-skeleton";
export { WalletsEmptyState } from "@/features/wallets/components/wallets-empty-state";
export { WalletsPageHeader } from "@/features/wallets/components/wallets-page-header";
export { AddWalletDialog } from "@/features/wallets/components/add-wallet-dialog";
export { EditWalletDialog } from "@/features/wallets/components/edit-wallet-dialog";
export { ArchiveWalletButton } from "@/features/wallets/components/archive-wallet-button";
export { WalletForm } from "@/features/wallets/components/wallet-form";
