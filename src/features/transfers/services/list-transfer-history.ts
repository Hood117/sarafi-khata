import "server-only";

import { formatCustomerLabel } from "@/features/customers/domain/format-customer-label";
import { listCustomers } from "@/features/customers/repositories/customer-repository";
import { listCurrencies } from "@/features/ledger/repositories/currency-repository";
import { TRANSACTION_STATUS_LABELS } from "@/features/transactions/domain/labels";
import { formatPrismaAmount } from "@/features/transactions/services/ledger-amount-display";
import { listTransactions } from "@/features/transactions/repositories/transaction-repository";
import type {
  GetTransferHistoryOptions,
  TransferHistoryListItem,
} from "@/features/transfers/domain/types";
import { listWallets } from "@/features/wallets/repositories/wallet-repository";
import { prisma } from "@/server/db";

function matchesSearch(item: TransferHistoryListItem, search: string): boolean {
  const query = search.trim().toLowerCase();
  if (!query) {
    return true;
  }

  const haystack = [
    item.reference,
    item.senderName ?? "",
    item.receiverName ?? "",
    item.currencyCode,
    item.amountDisplay,
    item.operatorName ?? "",
    item.statusLabel,
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

/**
 * List posted TRANSFER transactions for the history table.
 * Sender = CREDIT customer wallet; receiver = DEBIT customer wallet.
 * Does not compute wallet balances or write ledger rows.
 */
export async function getTransferHistory(
  options: GetTransferHistoryOptions = {},
): Promise<TransferHistoryListItem[]> {
  const [transactions, currencies, customers, wallets, users] =
    await Promise.all([
      listTransactions({ type: "TRANSFER" }),
      listCurrencies({ includeDeleted: true }),
      listCustomers({ includeDeleted: true }),
      listWallets({ includeDeleted: true }),
      prisma.user.findMany({
        select: { id: true, fullName: true, username: true },
      }),
    ]);

  const transactionIds = transactions.map((transaction) => transaction.id);
  const entries =
    transactionIds.length === 0
      ? []
      : await prisma.ledgerEntry.findMany({
          where: { transactionId: { in: transactionIds } },
          orderBy: { createdAt: "asc" },
        });

  const currenciesById = new Map(
    currencies.map((currency) => [currency.id, currency] as const),
  );
  const customerNames = new Map(
    customers.map((customer) =>
      [
        customer.id,
        formatCustomerLabel(customer.fullName, customer.code),
      ] as const,
    ),
  );
  const walletsById = new Map(
    wallets.map((wallet) => [wallet.id, wallet] as const),
  );
  const operatorNames = new Map(
    users.map(
      (user) =>
        [user.id, user.fullName.trim() || user.username] as const,
    ),
  );

  const entriesByTransaction = new Map<string, typeof entries>();
  for (const entry of entries) {
    const current = entriesByTransaction.get(entry.transactionId) ?? [];
    current.push(entry);
    entriesByTransaction.set(entry.transactionId, current);
  }

  const items: TransferHistoryListItem[] = transactions.map((transaction) => {
    const txnEntries = entriesByTransaction.get(transaction.id) ?? [];
    const senderEntry = txnEntries.find(
      (entry) => entry.direction === "CREDIT",
    );
    const receiverEntry = txnEntries.find(
      (entry) => entry.direction === "DEBIT",
    );

    const senderWallet = senderEntry
      ? walletsById.get(senderEntry.walletId)
      : undefined;
    const receiverWallet = receiverEntry
      ? walletsById.get(receiverEntry.walletId)
      : undefined;

    const currency = senderEntry
      ? currenciesById.get(senderEntry.currencyId)
      : receiverEntry
        ? currenciesById.get(receiverEntry.currencyId)
        : undefined;

    const amountEntry = senderEntry ?? receiverEntry;
    const amountDisplay =
      amountEntry && currency
        ? (formatPrismaAmount(amountEntry.amount, currency) ??
          amountEntry.amount.toString())
        : "—";

    return {
      id: transaction.id,
      reference: transaction.reference,
      senderName: senderWallet?.customerId
        ? (customerNames.get(senderWallet.customerId) ?? null)
        : null,
      receiverName: receiverWallet?.customerId
        ? (customerNames.get(receiverWallet.customerId) ?? null)
        : null,
      currencyCode: currency?.code ?? "—",
      amountDisplay,
      operatorName: transaction.createdById
        ? (operatorNames.get(transaction.createdById) ?? null)
        : null,
      valueDate: transaction.valueDate.toISOString(),
      status: transaction.status,
      statusLabel: TRANSACTION_STATUS_LABELS[transaction.status],
    };
  });

  const search = options.search?.trim() ?? "";
  if (!search) {
    return items;
  }

  return items.filter((item) => matchesSearch(item, search));
}
