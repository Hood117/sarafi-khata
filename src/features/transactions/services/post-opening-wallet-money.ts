import "server-only";

import { addMoney } from "@/features/ledger/domain/money";
import { TransactionError } from "@/features/transactions/domain/transaction-errors";
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

export type PostOpeningWalletMoneyParams = {
  customerId: string;
  customerWalletId: string;
  currencyCode: string;
  amount: string;
  createdById: string;
  customerName: string;
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

/**
 * Customer brings opening wallet money to the saraf:
 * - customer wallet balance increases (DEBIT)
 * - system cash (till/vault) increases (DEBIT)
 * - Opening Equity balances the double DEBIT (CREDIT 2×)
 */
export async function postOpeningWalletMoney(
  input: PostOpeningWalletMoneyParams,
) {
  const customerWallet = await findWalletById(input.customerWalletId);
  if (
    !customerWallet ||
    customerWallet.type !== "CUSTOMER" ||
    customerWallet.customerId !== input.customerId
  ) {
    throw new TransactionError(
      "VALIDATION",
      "Customer wallet was not found for opening money.",
      { customerWalletId: "Customer wallet was not found." },
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

  let cashWalletId = cashResolve.ok ? cashResolve.walletId : null;
  if (!cashWalletId) {
    const fallback =
      (await findWalletByName(CASH_TILL_WALLET_NAME, { type: "TILL" })) ??
      (await findWalletByName(MAIN_VAULT_WALLET_NAME, { type: "VAULT" }));
    cashWalletId = fallback?.id ?? null;
  }

  if (!cashWalletId) {
    throw new TransactionError(
      "VALIDATION",
      "Cash Till or Main Vault is required to receive opening wallet money.",
      { cashWalletId: "Cash wallet was not found." },
    );
  }

  const equity = await ensureOpeningEquityWallet();
  const { money, currencyCode } = await resolveMovementAmount(
    input.currencyCode,
    input.amount,
  );
  const equityCredit = addMoney(money, money);

  try {
    return await postTransaction({
      reference: `OPEN-WALLET-${input.customerId.slice(0, 8)}-${Date.now()}`,
      type: "ADJUSTMENT",
      valueDate: new Date(),
      customerId: input.customerId,
      description: `Wallet money from ${input.customerName}`,
      createdById: input.createdById,
      entries: [
        {
          walletId: customerWallet.id,
          currency: currencyCode,
          direction: "DEBIT",
          amount: money,
          memo: "Customer wallet money received",
        },
        {
          walletId: cashWalletId,
          currency: currencyCode,
          direction: "DEBIT",
          amount: money,
          memo: "Cash received with customer wallet money",
        },
        {
          walletId: equity.id,
          currency: currencyCode,
          direction: "CREDIT",
          amount: equityCredit,
          memo: "Opening equity balancing leg",
        },
      ],
    });
  } catch (error) {
    rethrowAsTransactionError(error);
  }
}
