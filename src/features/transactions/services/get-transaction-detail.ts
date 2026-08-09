import "server-only";

import { formatCustomerLabel } from "@/features/customers/domain/format-customer-label";
import { findCustomerById } from "@/features/customers/repositories/customer-repository";
import { formatExchangePartyLabel } from "@/features/exchange/domain/derive-exchange-summary";
import { listCurrencies } from "@/features/ledger/repositories/currency-repository";
import { listLedgerEntriesByTransaction } from "@/features/ledger/repositories/ledger-repository";
import { getSystemSetting } from "@/features/settings/repositories/system-setting-repository";
import {
  TRANSACTION_STATUS_LABELS,
  resolveTransactionTypeLabel,
} from "@/features/transactions/domain/labels";
import { formatCurrencyLabel, formatMoneyWithCurrency } from "@/features/transactions/domain/currency-display";
import { TransactionError } from "@/features/transactions/domain/transaction-errors";
import type {
  TransactionDetail,
  TransactionLedgerEntryRow,
} from "@/features/transactions/domain/types";
import { findTransactionById } from "@/features/transactions/repositories/transaction-repository";
import {
  formatPrismaAmount,
  summarizeDebitTotals,
} from "@/features/transactions/services/ledger-amount-display";
import { findWalletById } from "@/features/wallets/repositories/wallet-repository";
import { prisma } from "@/server/db";

export async function getTransactionDetail(
  id: string,
): Promise<TransactionDetail> {
  const transaction = await findTransactionById(id, { includeDeleted: true });

  if (!transaction) {
    throw new TransactionError("NOT_FOUND", "Transaction not found.");
  }

  const [entries, currencies, appNameSetting, hawala] = await Promise.all([
    listLedgerEntriesByTransaction(transaction.id),
    listCurrencies({ includeDeleted: true }),
    getSystemSetting("app.name"),
    transaction.type === "HAWALA"
      ? prisma.hawalaTransfer.findFirst({
          where: { transactionId: transaction.id, deletedAt: null },
          select: { direction: true },
        })
      : Promise.resolve(null),
  ]);

  const currenciesById = new Map(
    currencies.map((currency) => [currency.id, currency] as const),
  );

  const walletIds = [...new Set(entries.map((entry) => entry.walletId))];
  const wallets = await Promise.all(
    walletIds.map((walletId) =>
      findWalletById(walletId, { includeDeleted: true }),
    ),
  );
  const walletsById = new Map(
    wallets
      .filter((wallet): wallet is NonNullable<typeof wallet> => wallet !== null)
      .map((wallet) => [wallet.id, wallet] as const),
  );

  const [customer, operator] = await Promise.all([
    transaction.customerId
      ? findCustomerById(transaction.customerId, { includeDeleted: true })
      : Promise.resolve(null),
    transaction.createdById
      ? prisma.user.findUnique({
          where: { id: transaction.createdById },
          select: { fullName: true, username: true },
        })
      : Promise.resolve(null),
  ]);

  const summary = summarizeDebitTotals(entries, currenciesById);

  const ledgerEntries: TransactionLedgerEntryRow[] = entries.map((entry) => {
    const currency = currenciesById.get(entry.currencyId);
    const wallet = walletsById.get(entry.walletId);
    const rawAmount = currency
      ? (formatPrismaAmount(entry.amount, currency) ??
        prismaAmountFallback(entry.amount))
      : prismaAmountFallback(entry.amount);

    return {
      id: entry.id,
      walletName: wallet?.name ?? "Unknown wallet",
      currencyCode: currency
        ? formatCurrencyLabel({
            code: currency.code,
            symbol: currency.symbol,
          })
        : "—",
      direction: entry.direction,
      amountDisplay: currency
        ? formatMoneyWithCurrency({
            code: currency.code,
            symbol: currency.symbol,
            amountDisplay: rawAmount,
          })
        : rawAmount,
      memo: entry.memo,
    };
  });

  const walletNames = [
    ...new Set(ledgerEntries.map((entry) => entry.walletName)),
  ];

  return {
    id: transaction.id,
    reference: transaction.reference,
    type: transaction.type,
    typeLabel: resolveTransactionTypeLabel({
      type: transaction.type,
      reference: transaction.reference,
      description: transaction.description,
      hawalaDirection: hawala?.direction ?? null,
    }),
    status: transaction.status,
    statusLabel: TRANSACTION_STATUS_LABELS[transaction.status],
    customerId: transaction.customerId,
    customerName: formatExchangePartyLabel({
      customerName: customer
        ? formatCustomerLabel(customer.fullName, customer.code)
        : null,
      walkInName: transaction.walkInName,
      walkInPhone: transaction.walkInPhone,
    }),
    walkInName: transaction.walkInName,
    walkInPhone: transaction.walkInPhone,
    walletDisplay: walletNames.length > 0 ? walletNames.join(", ") : "—",
    currencyDisplay: summary.currencyDisplay,
    amountDisplay: summary.amountDisplay,
    notes: transaction.description,
    operatorName: operator
      ? operator.fullName.trim() || operator.username
      : null,
    valueDate: transaction.valueDate.toISOString(),
    postedAt: transaction.postedAt?.toISOString() ?? null,
    createdAt: transaction.createdAt.toISOString(),
    appName: appNameSetting?.value?.trim() || "Saraf",
    ledgerEntries,
  };
}

function prismaAmountFallback(amount: { toString(): string }): string {
  return amount.toString();
}
