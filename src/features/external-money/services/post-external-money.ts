import "server-only";

import { TransactionError } from "@/features/transactions/domain/transaction-errors";
import type { PostedTransaction } from "@/features/transactions/domain/types";
import { rethrowAsTransactionError } from "@/features/transactions/services/map-posting-error";
import { resolveMovementAmount } from "@/features/transactions/services/resolve-movement-amount";
import { postTransaction } from "@/features/transactions/services/post-transaction";
import {
  CASH_TILL_WALLET_NAME,
  MAIN_VAULT_WALLET_NAME,
  OPENING_EQUITY_WALLET_NAME,
} from "@/features/wallets/domain/wallet-descriptions";
import { resolveCashWalletId } from "@/features/wallets/domain/resolve-form-wallets";
import {
  createWallet,
  findWalletById,
  findWalletByName,
  listWallets,
} from "@/features/wallets/repositories/wallet-repository";

export type PostExternalMoneyParams = {
  currencyCode: string;
  amount: string;
  createdById: string;
  /** Optional override; defaults to Cash Till / Main Vault. */
  cashWalletId?: string | null;
  notes?: string | null;
  valueDate?: Date;
};

async function ensureOpeningEquityWallet() {
  const existing = await findWalletByName(OPENING_EQUITY_WALLET_NAME, {
    type: "SYSTEM",
  });
  if (existing?.isActive) {
    return existing;
  }

  return createWallet({
    name: OPENING_EQUITY_WALLET_NAME,
    type: "SYSTEM",
    isActive: true,
  });
}

async function resolveTargetCashWalletId(
  preferredWalletId?: string | null,
): Promise<string> {
  if (preferredWalletId) {
    const wallet = await findWalletById(preferredWalletId);
    if (
      wallet?.isActive &&
      (wallet.type === "TILL" || wallet.type === "VAULT")
    ) {
      return wallet.id;
    }
    throw new TransactionError(
      "VALIDATION",
      "Choose an active cash till or vault wallet.",
      { cashWalletId: "Cash wallet was not found or is not a till/vault." },
    );
  }

  const cashWallets = await listWallets({ isActive: true });
  const cashResolve = resolveCashWalletId(
    cashWallets.map((wallet) => ({
      id: wallet.id,
      label: wallet.name,
      type: wallet.type,
    })),
  );

  if (cashResolve.ok) {
    return cashResolve.walletId;
  }

  const fallback =
    (await findWalletByName(CASH_TILL_WALLET_NAME, { type: "TILL" })) ??
    (await findWalletByName(MAIN_VAULT_WALLET_NAME, { type: "VAULT" }));

  if (!fallback?.id) {
    throw new TransactionError(
      "VALIDATION",
      "Cash Till or Main Vault is required to receive external money.",
      { cashWalletId: "Cash wallet was not found." },
    );
  }

  return fallback.id;
}

/**
 * Saraf injects external capital into the shop:
 * - cash till/vault increases (DEBIT)
 * - Opening Equity balances the entry (CREDIT)
 */
export async function postExternalMoney(
  input: PostExternalMoneyParams,
): Promise<PostedTransaction> {
  const cashWalletId = await resolveTargetCashWalletId(input.cashWalletId);
  const equity = await ensureOpeningEquityWallet();
  const { money, currencyCode } = await resolveMovementAmount(
    input.currencyCode,
    input.amount,
  );
  const notes = input.notes?.trim() || null;
  const description = notes
    ? `External money: ${notes}`
    : "External money added to shop cash";

  try {
    return await postTransaction({
      reference: `EXT-MONEY-${Date.now()}`,
      type: "ADJUSTMENT",
      valueDate: input.valueDate ?? new Date(),
      description,
      createdById: input.createdById,
      entries: [
        {
          walletId: cashWalletId,
          currency: currencyCode,
          direction: "DEBIT",
          amount: money,
          memo: "External capital received into cash",
        },
        {
          walletId: equity.id,
          currency: currencyCode,
          direction: "CREDIT",
          amount: money,
          memo: "Opening equity for external capital",
        },
      ],
    });
  } catch (error) {
    rethrowAsTransactionError(error);
  }
}
