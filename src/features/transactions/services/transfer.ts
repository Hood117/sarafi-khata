import "server-only";

import type { Customer, Wallet } from "@/generated/prisma/client";
import { findCustomerById } from "@/features/customers/repositories/customer-repository";
import {
  compareMoney,
  createBalanceCalculator,
  createCurrency,
  createMoney,
  isLedgerDirection,
  listLedgerEntriesByWallet,
  moneyFromMajorUnits,
  type CurrencyCode,
  type LedgerEntryInput,
  type Money,
} from "@/features/ledger";
import { findCurrencyByCode } from "@/features/ledger/repositories/currency-repository";
import { TransactionError } from "@/features/transactions/domain/transaction-errors";
import type { PostedTransaction } from "@/features/transactions/domain/types";
import {
  toTransferFieldErrors,
  transferSchema,
  type TransferInput,
} from "@/features/transactions/schemas/money-movement";
import { rethrowAsTransactionError } from "@/features/transactions/services/map-posting-error";
import { resolveMovementAmount } from "@/features/transactions/services/resolve-movement-amount";
import { postTransaction } from "@/features/transactions/services/post-transaction";
import { listWallets } from "@/features/wallets/repositories/wallet-repository";

export type TransferParams = TransferInput & {
  createdById: string;
};

function prismaAmountToMajorString(amount: { toString(): string }): string {
  const raw = amount.toString();
  if (!/^-?\d+(\.\d+)?$/.test(raw)) {
    return "0";
  }
  return raw;
}

async function assertActiveCustomer(
  customerId: string,
  field: "senderCustomerId" | "receiverCustomerId",
  role: "Sender" | "Receiver",
): Promise<Customer> {
  const customer = await findCustomerById(customerId);
  if (!customer) {
    throw new TransactionError("NOT_FOUND", `${role} customer was not found.`, {
      [field]: `${role} customer was not found.`,
    });
  }

  if (!customer.isActive) {
    throw new TransactionError(
      "INACTIVE",
      `${role} customer is inactive and cannot be used for transfers.`,
      { [field]: `${role} customer is inactive.` },
    );
  }

  return customer;
}

/**
 * Resolves the sole active CUSTOMER wallet for a customer.
 * Zero or multiple wallets are configuration errors (not a picker).
 */
async function resolveCustomerAccountWallet(
  customerId: string,
  field: "senderCustomerId" | "receiverCustomerId",
  role: "Sender" | "Receiver",
): Promise<Wallet> {
  const wallets = await listWallets({
    customerId,
    type: "CUSTOMER",
    isActive: true,
  });

  if (wallets.length === 0) {
    throw new TransactionError(
      "VALIDATION",
      `${role} customer has no account wallet.`,
      {
        [field]:
          `${role} customer has no account wallet. Create one on the Wallets page, then try again.`,
      },
    );
  }

  if (wallets.length > 1) {
    throw new TransactionError(
      "VALIDATION",
      `${role} customer has more than one wallet.`,
      {
        [field]:
          `${role} customer has more than one wallet. Ask an administrator to keep a single customer wallet.`,
      },
    );
  }

  const wallet = wallets[0];
  if (!wallet.customerId || wallet.customerId !== customerId) {
    throw new TransactionError(
      "VALIDATION",
      `${role} customer wallet is missing a customer link.`,
      { [field]: `${role} customer wallet is missing a customer link.` },
    );
  }

  return wallet;
}

/**
 * Ledger-derived balance for one wallet + currency (asset: debit +, credit −).
 * Does not store balances; reads append-only ledger lines only.
 */
async function getWalletCurrencyBalance(
  walletId: string,
  currencyCode: CurrencyCode,
  currency: {
    id: string;
    code: string;
    name: string;
    symbol: string | null;
    decimalPlaces: number;
  },
): Promise<Money> {
  const domainCurrency = createCurrency({
    code: currency.code,
    name: currency.name,
    symbol: currency.symbol ?? undefined,
    decimalPlaces: currency.decimalPlaces,
  });

  const dbEntries = await listLedgerEntriesByWallet(walletId, {
    currencyId: currency.id,
  });

  const domainEntries: LedgerEntryInput[] = [];

  for (const entry of dbEntries) {
    if (!isLedgerDirection(entry.direction)) {
      continue;
    }

    domainEntries.push({
      walletId: entry.walletId,
      currency: domainCurrency.code,
      direction: entry.direction,
      amount: moneyFromMajorUnits(
        prismaAmountToMajorString(entry.amount),
        domainCurrency,
      ),
    });
  }

  // Empty entry sets must not call the calculator (domain validation throws).
  if (domainEntries.length === 0) {
    return createMoney(BigInt(0), currencyCode);
  }

  return createBalanceCalculator().getBalance(domainEntries, {
    walletId,
    currency: currencyCode,
  });
}

/**
 * Transfer funds from one customer to another (same currency).
 *
 * Ledger (asset convention):
 * - CREDIT sender customer wallet (decrease sender balance)
 * - DEBIT   receiver customer wallet (increase receiver balance)
 *
 * Resolves each customer's sole CUSTOMER wallet internally so callers do not
 * need to expose wallets. All Transaction / LedgerEntry writes go through
 * `postTransaction` only.
 */
export async function transferFunds(
  input: TransferParams,
): Promise<PostedTransaction> {
  const parsed = transferSchema.safeParse(input);

  if (!parsed.success) {
    throw new TransactionError(
      "VALIDATION",
      "Please correct the highlighted fields.",
      toTransferFieldErrors(parsed.error),
    );
  }

  const data = parsed.data;

  const sender = await assertActiveCustomer(
    data.senderCustomerId,
    "senderCustomerId",
    "Sender",
  );
  const receiver = await assertActiveCustomer(
    data.receiverCustomerId,
    "receiverCustomerId",
    "Receiver",
  );

  if (sender.id === receiver.id) {
    throw new TransactionError(
      "VALIDATION",
      "Sender and receiver must be different customers.",
      { receiverCustomerId: "Receiver must be different from the sender." },
    );
  }

  const senderWallet = await resolveCustomerAccountWallet(
    sender.id,
    "senderCustomerId",
    "Sender",
  );
  const receiverWallet = await resolveCustomerAccountWallet(
    receiver.id,
    "receiverCustomerId",
    "Receiver",
  );

  if (senderWallet.id === receiverWallet.id) {
    throw new TransactionError(
      "VALIDATION",
      "Sender and receiver wallets must be different.",
      { receiverCustomerId: "Receiver must be different from the sender." },
    );
  }

  const { money, currencyCode } = await resolveMovementAmount(
    data.currencyCode,
    data.amount,
  );

  const currencyRecord = await findCurrencyByCode(currencyCode);
  if (!currencyRecord) {
    throw new TransactionError("NOT_FOUND", "Currency was not found.", {
      currencyCode: "Currency was not found.",
    });
  }

  const senderBalance = await getWalletCurrencyBalance(
    senderWallet.id,
    currencyCode,
    currencyRecord,
  );

  if (compareMoney(senderBalance, money) < 0) {
    throw new TransactionError(
      "VALIDATION",
      "Sender has insufficient balance for this transfer.",
      { amount: "Sender has insufficient balance for this transfer." },
    );
  }

  const memo = "Customer transfer";
  const description =
    data.description ??
    `Transfer ${data.amount} ${currencyCode} from ${sender.fullName} to ${receiver.fullName}`;

  try {
    return await postTransaction({
      reference: data.reference,
      type: "TRANSFER",
      valueDate: data.valueDate ?? new Date(),
      customerId: sender.id,
      description,
      createdById: input.createdById,
      entries: [
        {
          walletId: senderWallet.id,
          currency: currencyCode,
          direction: "CREDIT",
          amount: money,
          memo,
        },
        {
          walletId: receiverWallet.id,
          currency: currencyCode,
          direction: "DEBIT",
          amount: money,
          memo,
        },
      ],
    });
  } catch (error) {
    rethrowAsTransactionError(error);
  }
}
