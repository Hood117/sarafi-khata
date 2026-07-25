/**
 * Public API for the ledger feature.
 * Import from this module only — do not reach into internal folders.
 */

export {
  // Currency
  createCurrency,
  toCurrencyCode,
  assertSameCurrencyCode,
  type Currency,
  type CurrencyCode,
  // Money
  createMoney,
  moneyFromMajorUnits,
  addMoney,
  subtractMoney,
  negateMoney,
  absMoney,
  isZeroMoney,
  isPositiveMoney,
  compareMoney,
  assertSameCurrency,
  type Money,
  // Ledger types & validation
  type LedgerDirection,
  type LedgerEntryInput,
  type CurrencyBalance,
  type WalletCurrencyBalance,
  isLedgerDirection,
  assertPositiveLedgerAmount,
  assertLedgerEntryCurrencyConsistency,
  validateLedgerEntry,
  validateLedgerEntries,
  summarizeByCurrency,
  assertLedgerBalanced,
  isLedgerBalanced,
  oppositeDirection,
  createReversalEntry,
  // Balance
  type BalanceKey,
  type BalanceSnapshot,
  type BalanceCalculator,
  type BalanceReadModel,
  createBalanceCalculator,
  // Errors
  LedgerDomainError,
  isLedgerDomainError,
  type LedgerDomainErrorCode,
} from "@/features/ledger/domain";

export {
  createLedgerEntry,
  createLedgerEntries,
  findLedgerEntryById,
  listLedgerEntriesByTransaction,
  listLedgerEntriesByWallet,
  listLedgerEntries,
  type CreateLedgerEntryData,
  type CreateLedgerEntryManyData,
  type LedgerEntryListOptions,
} from "@/features/ledger/repositories/ledger-repository";

export {
  createCurrencyRecord,
  findCurrencyById,
  findCurrencyByCode,
  listCurrencies,
  updateCurrency,
  softDeleteCurrency,
  type CreateCurrencyData,
  type UpdateCurrencyData,
  type CurrencyListOptions,
} from "@/features/ledger/repositories/currency-repository";

export {
  createExchangeRate,
  findExchangeRateById,
  listExchangeRates,
  findLatestExchangeRate,
  updateExchangeRate,
  softDeleteExchangeRate,
  type CreateExchangeRateData,
  type UpdateExchangeRateData,
  type ExchangeRateListOptions,
} from "@/features/ledger/repositories/exchange-rate-repository";
