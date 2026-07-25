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
