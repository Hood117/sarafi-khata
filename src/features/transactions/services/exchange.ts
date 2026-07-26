import "server-only";

import type { Wallet } from "@/generated/prisma/client";
import { findCustomerById } from "@/features/customers/repositories/customer-repository";
import {
  createCurrency,
  createExchangeRate,
  isLedgerDomainError,
  moneyToMajorUnitString,
  type CurrencyCode,
  type Money,
} from "@/features/ledger";
import { findCurrencyByCode } from "@/features/ledger/repositories/currency-repository";
import { prisma } from "@/server/db";
import { EXCHANGE_DIFFERENCE_WALLET_NAME } from "@/features/wallets/domain/wallet-descriptions";
import { findWalletById } from "@/features/wallets/repositories/wallet-repository";
import { convertMoneyByRate } from "@/features/transactions/domain/exchange-rate-math";
import { TransactionError } from "@/features/transactions/domain/transaction-errors";
import type { PostedTransaction } from "@/features/transactions/domain/types";
import {
  exchangeSchema,
  toExchangeFieldErrors,
  type ExchangeInput,
} from "@/features/transactions/schemas/money-movement";
import { rethrowAsTransactionError } from "@/features/transactions/services/map-posting-error";
import { postTransaction } from "@/features/transactions/services/post-transaction";
import { resolveDealExchangeRate } from "@/features/transactions/services/resolve-deal-exchange-rate";
import { resolveExchangeDifferenceWallet } from "@/features/transactions/services/resolve-exchange-difference-wallet";
import { resolveMovementAmount } from "@/features/transactions/services/resolve-movement-amount";

/** Snapshot source marker — inactive rows linked on ledger for audit. */
const TRANSACTION_RATE_SNAPSHOT_SOURCE = "transaction-snapshot";

export type ExchangeParams = ExchangeInput & {
  createdById: string;
};

export type ExchangeFundsResult = {
  transaction: PostedTransaction;
  fromCurrencyCode: string;
  toCurrencyCode: string;
  fromAmount: string;
  toAmount: string;
  /** To-currency units per 1 from-currency unit actually used. */
  rate: string;
  rateSource: "market" | "manual";
  /** Immutable snapshot rate row linked on every ledger line. */
  exchangeRateId: string;
};

function assertExchangeWallet(
  wallet: Wallet,
  field: "fromWalletId" | "toWalletId",
  customerId: string,
  exchangeDifferenceWalletId: string,
): void {
  if (!wallet.isActive) {
    throw new TransactionError(
      "INACTIVE",
      `Wallet "${wallet.name}" is inactive and cannot be used for exchange.`,
      { [field]: "Wallet is inactive." },
    );
  }

  if (wallet.id === exchangeDifferenceWalletId) {
    throw new TransactionError(
      "VALIDATION",
      `"${EXCHANGE_DIFFERENCE_WALLET_NAME}" cannot be used as an exchange from/to wallet.`,
      {
        [field]: `Select a customer, vault, or till wallet — not ${EXCHANGE_DIFFERENCE_WALLET_NAME}.`,
      },
    );
  }

  if (
    wallet.type !== "CUSTOMER" &&
    wallet.type !== "VAULT" &&
    wallet.type !== "TILL"
  ) {
    throw new TransactionError(
      "VALIDATION",
      "Exchange wallets must be customer, vault, or till wallets.",
      { [field]: "Select a customer, vault, or till wallet." },
    );
  }

  if (wallet.type === "CUSTOMER") {
    if (!wallet.customerId) {
      throw new TransactionError(
        "VALIDATION",
        `Customer wallet "${wallet.name}" is missing a customer link.`,
        { [field]: "Customer wallet is missing a customer link." },
      );
    }

    if (wallet.customerId !== customerId) {
      throw new TransactionError(
        "VALIDATION",
        "Customer wallet does not belong to the selected customer.",
        { [field]: "Wallet does not belong to this customer." },
      );
    }
  }
}

async function loadActiveCurrency(code: string, field: "fromCurrencyCode" | "toCurrencyCode") {
  const currency = await findCurrencyByCode(code);
  if (!currency) {
    throw new TransactionError("NOT_FOUND", "Currency was not found.", {
      [field]: "Currency was not found.",
    });
  }

  if (!currency.isActive) {
    throw new TransactionError(
      "INACTIVE",
      "Currency is inactive and cannot be used.",
      { [field]: "Currency is inactive." },
    );
  }

  return currency;
}

function buildExchangeDescription(input: {
  userDescription: string | null;
  fromAmount: string;
  fromCurrencyCode: string;
  toAmount: string;
  toCurrencyCode: string;
  rate: string;
  rateSource: "market" | "manual";
}): string {
  const summary = `Currency exchange: ${input.fromAmount} ${input.fromCurrencyCode} → ${input.toAmount} ${input.toCurrencyCode} @ ${input.rate} (${input.rateSource})`;
  if (!input.userDescription) {
    return summary;
  }
  return `${summary}. ${input.userDescription}`;
}

/**
 * Exchange from-currency into to-currency for a customer.
 *
 * Ledger (asset convention, balanced per currency via Exchange Difference):
 * - CREDIT fromWallet / fromCurrency (give up from amount)
 * - DEBIT   toWallet   / toCurrency   (receive converted amount)
 * - DEBIT   Exchange Difference / fromCurrency
 * - CREDIT  Exchange Difference / toCurrency
 *
 * Rate defaults to the latest active Settings rate. Optional manual override
 * requires `allowManualRateOverride`. The exact rate used is snapshotted into
 * an inactive ExchangeRate row and linked on every ledger line.
 *
 * All Transaction / LedgerEntry writes go through `postTransaction` only.
 */
export async function exchangeFunds(
  input: ExchangeParams,
): Promise<ExchangeFundsResult> {
  const parsed = exchangeSchema.safeParse(input);

  if (!parsed.success) {
    throw new TransactionError(
      "VALIDATION",
      "Please correct the highlighted fields.",
      toExchangeFieldErrors(parsed.error),
    );
  }

  const data = parsed.data;
  const valueDate = data.valueDate ?? new Date();

  const customer = await findCustomerById(data.customerId);
  if (!customer) {
    throw new TransactionError("NOT_FOUND", "Customer was not found.", {
      customerId: "Customer was not found.",
    });
  }

  if (!customer.isActive) {
    throw new TransactionError(
      "INACTIVE",
      "Customer is inactive and cannot be used for exchange.",
      { customerId: "Customer is inactive." },
    );
  }

  const exchangeDifferenceWallet = await resolveExchangeDifferenceWallet();

  const fromWallet = await findWalletById(data.fromWalletId);
  if (!fromWallet) {
    throw new TransactionError("NOT_FOUND", "From wallet was not found.", {
      fromWalletId: "From wallet was not found.",
    });
  }

  const toWallet = await findWalletById(data.toWalletId);
  if (!toWallet) {
    throw new TransactionError("NOT_FOUND", "To wallet was not found.", {
      toWalletId: "To wallet was not found.",
    });
  }

  assertExchangeWallet(
    fromWallet,
    "fromWalletId",
    customer.id,
    exchangeDifferenceWallet.id,
  );
  assertExchangeWallet(
    toWallet,
    "toWalletId",
    customer.id,
    exchangeDifferenceWallet.id,
  );

  const fromCurrency = await loadActiveCurrency(
    data.fromCurrencyCode,
    "fromCurrencyCode",
  );
  const toCurrency = await loadActiveCurrency(
    data.toCurrencyCode,
    "toCurrencyCode",
  );

  const { money: fromMoney, currencyCode: fromCurrencyCode } =
    await resolveMovementAmount(fromCurrency.code, data.amount);

  const dealRate = await resolveDealExchangeRate({
    fromCurrency,
    toCurrency,
    valueDate,
    allowManualRateOverride: data.allowManualRateOverride,
    manualRate: data.manualRate,
  });

  const toDomainCurrency = createCurrency({
    code: toCurrency.code,
    name: toCurrency.name,
    symbol: toCurrency.symbol ?? undefined,
    decimalPlaces: toCurrency.decimalPlaces,
  });

  let toMoney: Money;
  try {
    toMoney = convertMoneyByRate({
      fromMoney,
      fromDecimalPlaces: fromCurrency.decimalPlaces,
      toCurrencyCode: toDomainCurrency.code,
      toDecimalPlaces: toCurrency.decimalPlaces,
      rate: dealRate.rate,
    });
  } catch (error) {
    if (isLedgerDomainError(error)) {
      throw new TransactionError("VALIDATION", error.message, {
        amount: error.message,
        manualRate: error.message,
      });
    }
    throw error;
  }

  const fromAmountDisplay = moneyToMajorUnitString(
    fromMoney,
    fromCurrency.decimalPlaces,
  );
  const toAmountDisplay = moneyToMajorUnitString(
    toMoney,
    toCurrency.decimalPlaces,
  );

  // Immutable snapshot of the exact deal rate (to per 1 from). Stored inactive
  // so Settings findLatest never treats it as a live market rate. Source keeps
  // an optional pointer back to the catalog row used for the quote.
  const snapshotSource = dealRate.catalogRateId
    ? `${TRANSACTION_RATE_SNAPSHOT_SOURCE}:${dealRate.catalogRateId}`
    : `${TRANSACTION_RATE_SNAPSHOT_SOURCE}:manual`;

  const snapshotRate = await createExchangeRate({
    rate: dealRate.rate,
    effectiveAt: valueDate,
    source: snapshotSource,
    deletedAt: new Date(),
    baseCurrency: { connect: { id: fromCurrency.id } },
    quoteCurrency: { connect: { id: toCurrency.id } },
  });

  const description = buildExchangeDescription({
    userDescription: data.description,
    fromAmount: fromAmountDisplay,
    fromCurrencyCode,
    toAmount: toAmountDisplay,
    toCurrencyCode: toDomainCurrency.code,
    rate: dealRate.rate,
    rateSource: dealRate.rateSource,
  });

  const memo = `Currency exchange @ ${dealRate.rate}`;
  const toCurrencyCode = toDomainCurrency.code as CurrencyCode;

  try {
    const transaction = await postTransaction({
      reference: data.reference,
      type: "EXCHANGE",
      valueDate,
      customerId: customer.id,
      description,
      createdById: input.createdById,
      entries: [
        {
          walletId: fromWallet.id,
          currency: fromCurrencyCode,
          direction: "CREDIT",
          amount: fromMoney,
          exchangeRateId: snapshotRate.id,
          memo,
        },
        {
          walletId: toWallet.id,
          currency: toCurrencyCode,
          direction: "DEBIT",
          amount: toMoney,
          exchangeRateId: snapshotRate.id,
          memo,
        },
        {
          walletId: exchangeDifferenceWallet.id,
          currency: fromCurrencyCode,
          direction: "DEBIT",
          amount: fromMoney,
          exchangeRateId: snapshotRate.id,
          memo,
        },
        {
          walletId: exchangeDifferenceWallet.id,
          currency: toCurrencyCode,
          direction: "CREDIT",
          amount: toMoney,
          exchangeRateId: snapshotRate.id,
          memo,
        },
      ],
    });

    return {
      transaction,
      fromCurrencyCode,
      toCurrencyCode,
      fromAmount: fromAmountDisplay,
      toAmount: toAmountDisplay,
      rate: dealRate.rate,
      rateSource: dealRate.rateSource,
      exchangeRateId: snapshotRate.id,
    };
  } catch (error) {
    await prisma.exchangeRate
      .delete({ where: { id: snapshotRate.id } })
      .catch(() => undefined);
    rethrowAsTransactionError(error);
  }
}
