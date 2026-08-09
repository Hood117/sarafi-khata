import type { CurrencyCode } from "@/features/ledger/domain/currency";
import type { Money } from "@/features/ledger/domain/money";

export type LedgerDirection = "DEBIT" | "CREDIT";

/**
 * Domain representation of a ledger line (not a Prisma model).
 */
export type LedgerEntryInput = {
  walletId: string;
  currency: CurrencyCode;
  direction: LedgerDirection;
  /** Always positive in domain rules; sign is expressed by direction. */
  amount: Money;
  memo?: string;
};

export type CurrencyBalance = {
  currency: CurrencyCode;
  debitTotal: Money;
  creditTotal: Money;
  /** debitTotal - creditTotal in minor units terms for that currency. */
  net: Money;
};

export type WalletCurrencyBalance = {
  walletId: string;
  currency: CurrencyCode;
  /** Net signed minor units: debit increases, credit decreases (asset convention). */
  balance: Money;
};
