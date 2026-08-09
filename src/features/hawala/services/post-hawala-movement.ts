import "server-only";

import type { HawalaDirection, HawalaTransfer, Wallet } from "@/generated/prisma/client";
import type { CurrencyCode, Money } from "@/features/ledger/domain";
import {
  createCurrency,
  moneyFromMajorUnits,
} from "@/features/ledger/domain";
import { findCurrencyByCode } from "@/features/ledger/repositories/currency-repository";
import { HawalaError } from "@/features/hawala/domain/errors";
import { markHawalaCompleted } from "@/features/hawala/repositories/hawala-repository";
import { rethrowAsHawalaError } from "@/features/hawala/services/map-posting-error";
import { isPostingError } from "@/features/transactions/domain/errors";
import { findTransactionByReference } from "@/features/transactions/repositories/transaction-repository";
import { postTransaction } from "@/features/transactions/services/post-transaction";
import { prismaAmountToMajorString } from "@/features/transactions/services/ledger-amount-display";
import {
  HAWALA_WALK_IN_OUTBOUND_WALLET_NAME,
  OWN_HAWALA_COMMISSION_INCOME_WALLET_NAME,
} from "@/features/wallets/domain/wallet-descriptions";
import {
  createWallet,
  findWalletByName,
  listWallets,
} from "@/features/wallets/repositories/wallet-repository";

type PostHawalaMovementParams = {
  hawala: HawalaTransfer;
  direction: HawalaDirection;
  currencyCode: CurrencyCode;
  money: Money;
  createdById: string;
};

type LedgerPostEntry = Parameters<typeof postTransaction>[0]["entries"][number];

async function ensureOwnCommissionIncomeWallet() {
  const existing = await findWalletByName(
    OWN_HAWALA_COMMISSION_INCOME_WALLET_NAME,
    { type: "SYSTEM" },
  );
  if (existing?.isActive) {
    return existing;
  }
  return createWallet({
    name: OWN_HAWALA_COMMISSION_INCOME_WALLET_NAME,
    type: "SYSTEM",
    isActive: true,
  });
}

async function ensureWalkInOutboundWallet() {
  const existing = await findWalletByName(
    HAWALA_WALK_IN_OUTBOUND_WALLET_NAME,
    { type: "SYSTEM" },
  );
  if (existing?.isActive) {
    return existing;
  }
  return createWallet({
    name: HAWALA_WALK_IN_OUTBOUND_WALLET_NAME,
    type: "SYSTEM",
    isActive: true,
  });
}

async function resolveSenderCustomerWallet(
  senderCustomerId: string,
): Promise<Wallet> {
  const wallets = await listWallets({
    customerId: senderCustomerId,
    type: "CUSTOMER",
    isActive: true,
  });

  if (wallets.length === 0) {
    throw new HawalaError(
      "VALIDATION",
      "Sender customer has no account wallet.",
      {
        senderCustomerId:
          "Sender customer has no account wallet. Create one on the Wallets page, then try again.",
      },
    );
  }

  if (wallets.length > 1) {
    throw new HawalaError(
      "VALIDATION",
      "Sender customer has more than one wallet.",
      {
        senderCustomerId:
          "Sender customer has more than one wallet. Ask an administrator to keep a single customer wallet.",
      },
    );
  }

  return wallets[0]!;
}

async function linkExistingPostedTransaction(
  hawala: HawalaTransfer,
): Promise<HawalaTransfer | null> {
  const existing = await findTransactionByReference(hawala.reference);
  if (
    !existing ||
    existing.type !== "HAWALA" ||
    existing.status !== "POSTED"
  ) {
    return null;
  }

  return markHawalaCompleted(
    hawala.id,
    existing.id,
    existing.postedAt ?? new Date(),
  );
}

/**
 * Builds SEND principal legs.
 *
 * Existing sender customer: CREDIT customer (decrease balance), DEBIT clearing.
 * Walk-in / external: CREDIT Hawala Walk-in Outbound (no shop cash), DEBIT clearing.
 *
 * RECEIVE stays: DEBIT clearing, CREDIT cash.
 */
async function buildSendPrincipalEntries(
  hawala: HawalaTransfer,
  currencyCode: CurrencyCode,
  money: Money,
): Promise<LedgerPostEntry[]> {
  const memo = "Hawala send";
  const clearingLeg: LedgerPostEntry = {
    walletId: hawala.clearingWalletId,
    currency: currencyCode,
    direction: "DEBIT",
    amount: money,
    memo,
  };

  if (hawala.senderCustomerId) {
    const customerWallet = await resolveSenderCustomerWallet(
      hawala.senderCustomerId,
    );
    return [
      {
        walletId: customerWallet.id,
        currency: currencyCode,
        direction: "CREDIT",
        amount: money,
        memo,
      },
      clearingLeg,
    ];
  }

  const walkInWallet = await ensureWalkInOutboundWallet();
  return [
    {
      walletId: walkInWallet.id,
      currency: currencyCode,
      direction: "CREDIT",
      amount: money,
      memo,
    },
    clearingLeg,
  ];
}

/**
 * Posts hawala principal (+ optional own-commission cash income) through the
 * shared posting service. Does not write LedgerEntry rows directly.
 *
 * SEND (existing sender): CREDIT customer, DEBIT clearing
 * SEND (walk-in): CREDIT Hawala Walk-in Outbound, DEBIT clearing (no cash)
 * RECEIVE: DEBIT clearing, CREDIT cash
 * Own commission (either direction): DEBIT cash, CREDIT Hawala Commission Income
 *
 * Idempotent recovery: if a HAWALA transaction with the same reference already
 * exists (e.g. post succeeded but status update failed), links it instead of
 * posting again.
 */
export async function postHawalaMovement(
  params: PostHawalaMovementParams,
): Promise<HawalaTransfer> {
  const { hawala, direction, currencyCode, money, createdById } = params;

  if (hawala.status !== "PENDING" || hawala.transactionId) {
    throw new HawalaError(
      "INVALID_STATUS",
      "Only pending hawala transfers without a linked transaction can be posted.",
    );
  }

  const alreadyLinked = await linkExistingPostedTransaction(hawala);
  if (alreadyLinked) {
    return alreadyLinked;
  }

  const isSend = direction === "SEND";
  const entries: LedgerPostEntry[] = isSend
    ? await buildSendPrincipalEntries(hawala, currencyCode, money)
    : [
        {
          walletId: hawala.clearingWalletId,
          currency: currencyCode,
          direction: "DEBIT",
          amount: money,
          memo: "Hawala receive",
        },
        {
          walletId: hawala.cashWalletId,
          currency: currencyCode,
          direction: "CREDIT",
          amount: money,
          memo: "Hawala receive",
        },
      ];

  if (hawala.ownCommissionAmount != null) {
    const ownMajor = prismaAmountToMajorString(hawala.ownCommissionAmount);
    if (Number(ownMajor) > 0) {
      const currency = await findCurrencyByCode(currencyCode);
      if (!currency) {
        throw new HawalaError("NOT_FOUND", "Currency was not found.", {
          currencyCode: "Currency was not found.",
        });
      }
      const ownMoney = moneyFromMajorUnits(
        ownMajor,
        createCurrency({
          code: currency.code,
          name: currency.name,
          symbol: currency.symbol ?? undefined,
          decimalPlaces: currency.decimalPlaces,
        }),
      );
      const incomeWallet = await ensureOwnCommissionIncomeWallet();
      const feeMemo = "Hawala commission income";
      entries.push(
        {
          walletId: hawala.cashWalletId,
          currency: currencyCode,
          direction: "DEBIT",
          amount: ownMoney,
          memo: feeMemo,
        },
        {
          walletId: incomeWallet.id,
          currency: currencyCode,
          direction: "CREDIT",
          amount: ownMoney,
          memo: feeMemo,
        },
      );
    }
  }

  try {
    const posted = await postTransaction({
      reference: hawala.reference,
      type: "HAWALA",
      valueDate: hawala.valueDate,
      customerId: hawala.customerId,
      description: hawala.notes,
      createdById,
      entries,
    });

    return markHawalaCompleted(
      hawala.id,
      posted.id,
      posted.postedAt ?? new Date(),
    );
  } catch (error) {
    if (isPostingError(error) && error.code === "CONFLICT") {
      const recovered = await linkExistingPostedTransaction(hawala);
      if (recovered) {
        return recovered;
      }
    }

    rethrowAsHawalaError(error);
  }
}
