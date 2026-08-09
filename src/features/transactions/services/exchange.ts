import "server-only";

import type { Wallet } from "@/generated/prisma/client";
import { findCustomerById } from "@/features/customers/repositories/customer-repository";
import { deriveDealRateFromAmounts } from "@/features/exchange/domain/derive-deal-rate-from-amounts";
import {
  createExchangeRate,
  type CurrencyCode,
  moneyToMajorUnitString,
} from "@/features/ledger";
import { findCurrencyByCode } from "@/features/ledger/repositories/currency-repository";
import { prisma } from "@/server/db";
import { EXCHANGE_DIFFERENCE_WALLET_NAME } from "@/features/wallets/domain/wallet-descriptions";
import { findWalletById } from "@/features/wallets/repositories/wallet-repository";
import { TransactionError } from "@/features/transactions/domain/transaction-errors";
import type { PostedTransaction } from "@/features/transactions/domain/types";
import {
  exchangeSchema,
  toExchangeFieldErrors,
  type ExchangeInput,
} from "@/features/transactions/schemas/money-movement";
import { rethrowAsTransactionError } from "@/features/transactions/services/map-posting-error";
import { postTransaction } from "@/features/transactions/services/post-transaction";
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
  customerId: string | null,
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

  if (customerId == null) {
    if (wallet.type !== "VAULT" && wallet.type !== "TILL") {
      throw new TransactionError(
        "VALIDATION",
        "Walk-in exchange must use vault or till cash wallets.",
        { [field]: "Select a vault or till wallet." },
      );
    }
    return;
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

async function loadActiveCurrency(
  code: string,
  field: "fromCurrencyCode" | "toCurrencyCode",
) {
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
 * Exchange from-currency into to-currency.
 *
 * Desk workflow: cashier enters both give and receive amounts; the effective
 * deal rate is derived and snapshotted. Receive amount is posted exactly as
 * entered (not recomputed from a market rate).
 *
 * Existing customer (customer wallet):
 * - CREDIT fromWallet / fromCurrency
 * - DEBIT   toWallet   / toCurrency
 * - DEBIT   Exchange Difference / fromCurrency
 * - CREDIT  Exchange Difference / toCurrency
 *
 * Walk-in (vault/till cash — shop receives from-currency, pays to-currency):
 * - DEBIT   cash / fromCurrency
 * - CREDIT  cash / toCurrency
 * - CREDIT  Exchange Difference / fromCurrency
 * - DEBIT   Exchange Difference / toCurrency
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
  const customerId = data.customerId;
  const isWalkIn = customerId == null;

  if (!isWalkIn) {
    const customer = await findCustomerById(customerId);
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
    customerId,
    exchangeDifferenceWallet.id,
  );
  assertExchangeWallet(
    toWallet,
    "toWalletId",
    customerId,
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

  const { money: toMoney } = await resolveMovementAmount(
    toCurrency.code,
    data.toAmount,
  );

  const fromAmountDisplay = moneyToMajorUnitString(
    fromMoney,
    fromCurrency.decimalPlaces,
  );
  const toAmountDisplay = moneyToMajorUnitString(
    toMoney,
    toCurrency.decimalPlaces,
  );

  const derived = deriveDealRateFromAmounts({
    giveAmountMajor: fromAmountDisplay,
    giveCurrencyCode: fromCurrencyCode,
    giveDecimalPlaces: fromCurrency.decimalPlaces,
    receiveAmountMajor: toAmountDisplay,
    receiveCurrencyCode: toCurrency.code,
    receiveDecimalPlaces: toCurrency.decimalPlaces,
  });

  if (!derived) {
    throw new TransactionError(
      "VALIDATION",
      "Unable to derive a deal rate from the entered amounts.",
      {
        amount: "Check give and receive amounts.",
        toAmount: "Check give and receive amounts.",
      },
    );
  }

  const dealRate = {
    rate: derived.serviceRate,
    rateSource: "manual" as const,
  };

  const toCurrencyCode = toCurrency.code as CurrencyCode;

  // Immutable snapshot of the exact deal rate (to per 1 from). Stored inactive
  // so Settings findLatest never treats it as a live market rate.
  const snapshotSource = `${TRANSACTION_RATE_SNAPSHOT_SOURCE}:deal-amounts`;

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
    toCurrencyCode,
    rate: dealRate.rate,
    rateSource: dealRate.rateSource,
  });

  const memo = `Currency exchange @ ${dealRate.rate}`;

  // Existing customer: convert balances on the customer wallet (ADR-023).
  // Walk-in: shop receives from-currency / pays to-currency on cash (asset +).
  const economicFromDirection = isWalkIn ? "DEBIT" : "CREDIT";
  const economicToDirection = isWalkIn ? "CREDIT" : "DEBIT";
  const differenceFromDirection = isWalkIn ? "CREDIT" : "DEBIT";
  const differenceToDirection = isWalkIn ? "DEBIT" : "CREDIT";

  try {
    const transaction = await postTransaction({
      reference: data.reference,
      type: "EXCHANGE",
      valueDate,
      customerId,
      walkInName: isWalkIn ? data.walkInName : null,
      walkInPhone: isWalkIn ? data.walkInPhone : null,
      description,
      createdById: input.createdById,
      entries: [
        {
          walletId: fromWallet.id,
          currency: fromCurrencyCode,
          direction: economicFromDirection,
          amount: fromMoney,
          exchangeRateId: snapshotRate.id,
          memo,
        },
        {
          walletId: toWallet.id,
          currency: toCurrencyCode,
          direction: economicToDirection,
          amount: toMoney,
          exchangeRateId: snapshotRate.id,
          memo,
        },
        {
          walletId: exchangeDifferenceWallet.id,
          currency: fromCurrencyCode,
          direction: differenceFromDirection,
          amount: fromMoney,
          exchangeRateId: snapshotRate.id,
          memo,
        },
        {
          walletId: exchangeDifferenceWallet.id,
          currency: toCurrencyCode,
          direction: differenceToDirection,
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
    // Snapshot was created soft-archived (`deletedAt` set). Keep the row for
    // audit — never hard-delete financial rate records.
    rethrowAsTransactionError(error);
  }
}
