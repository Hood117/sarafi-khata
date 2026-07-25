export {
  createCurrency,
  toCurrencyCode,
  assertSameCurrencyCode,
  type Currency,
  type CurrencyCode,
} from "@/features/ledger/domain/currency";

export {
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
} from "@/features/ledger/domain/money";

export type {
  LedgerDirection,
  LedgerEntryInput,
  CurrencyBalance,
  WalletCurrencyBalance,
} from "@/features/ledger/domain/ledger-types";

export {
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
} from "@/features/ledger/domain/validation";

export type {
  BalanceKey,
  BalanceSnapshot,
  BalanceCalculator,
  BalanceReadModel,
} from "@/features/ledger/domain/balance";

export { createBalanceCalculator } from "@/features/ledger/domain/balance-calculator";

export {
  LedgerDomainError,
  isLedgerDomainError,
  type LedgerDomainErrorCode,
} from "@/features/ledger/domain/errors";
