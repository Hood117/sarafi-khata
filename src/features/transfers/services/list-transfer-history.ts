import "server-only";

import { formatCustomerLabel } from "@/features/customers/domain/format-customer-label";
import { listCustomersByIds } from "@/features/customers/repositories/customer-repository";
import { listCurrencies } from "@/features/ledger/repositories/currency-repository";
import { TRANSACTION_STATUS_LABELS } from "@/features/transactions/domain/labels";
import { formatPrismaAmount } from "@/features/transactions/services/ledger-amount-display";
import {
  listTransactions,
  listTransactionsPage,
} from "@/features/transactions/repositories/transaction-repository";
import type {
  GetTransferHistoryOptions,
  TransferHistoryListItem,
} from "@/features/transfers/domain/types";
import type { ListPage } from "@/lib/pagination";
import { prisma } from "@/server/db";

type TransferTxn = Awaited<ReturnType<typeof listTransactions>>[number];

async function enrichTransferHistory(
  transactions: TransferTxn[],
): Promise<TransferHistoryListItem[]> {
  if (transactions.length === 0) {
    return [];
  }

  const transactionIds = transactions.map((transaction) => transaction.id);
  const operatorIds = [
    ...new Set(
      transactions
        .map((transaction) => transaction.createdById)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const [entries, currencies, users] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where: { transactionId: { in: transactionIds } },
      orderBy: { createdAt: "asc" },
    }),
    listCurrencies({ includeDeleted: true }),
    operatorIds.length === 0
      ? Promise.resolve([])
      : prisma.user.findMany({
          where: { id: { in: operatorIds } },
          select: { id: true, fullName: true, username: true },
        }),
  ]);

  const walletIds = [...new Set(entries.map((entry) => entry.walletId))];
  const wallets =
    walletIds.length === 0
      ? []
      : await prisma.wallet.findMany({
          where: { id: { in: walletIds } },
          select: { id: true, customerId: true },
        });

  const customerIds = [
    ...new Set(
      wallets
        .map((wallet) => wallet.customerId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const customers = await listCustomersByIds(customerIds, {
    includeDeleted: true,
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

  return transactions.map((transaction) => {
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
}

/**
 * Bounded transfer history. Prefer `getTransferHistoryPage` for desk screens.
 */
export async function getTransferHistory(
  options: GetTransferHistoryOptions = {},
): Promise<TransferHistoryListItem[]> {
  const transactions = await listTransactions({
    type: "TRANSFER",
    search: options.search,
    ...(options.valueDateFrom ? { valueDateFrom: options.valueDateFrom } : {}),
    ...(options.valueDateTo ? { valueDateTo: options.valueDateTo } : {}),
    ...(typeof options.take === "number" ? { take: options.take } : { take: 100 }),
  });
  return enrichTransferHistory(transactions);
}

/**
 * Paginated transfer history — SQL filter/page, enrich only the page.
 */
export async function getTransferHistoryPage(
  options: GetTransferHistoryOptions = {},
): Promise<ListPage<TransferHistoryListItem>> {
  const pageResult = await listTransactionsPage({
    type: "TRANSFER",
    search: options.search,
    ...(options.valueDateFrom ? { valueDateFrom: options.valueDateFrom } : {}),
    ...(options.valueDateTo ? { valueDateTo: options.valueDateTo } : {}),
    page: options.page,
    pageSize: options.pageSize,
  });
  const items = await enrichTransferHistory(pageResult.items);
  return {
    items,
    total: pageResult.total,
    page: pageResult.page,
    pageSize: pageResult.pageSize,
  };
}
