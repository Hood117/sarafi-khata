import "server-only";

import { formatCustomerLabel } from "@/features/customers/domain/format-customer-label";
import { listCustomersByIds } from "@/features/customers/repositories/customer-repository";
import { listCurrencies } from "@/features/ledger/repositories/currency-repository";
import { listLedgerEntries } from "@/features/ledger/repositories/ledger-repository";
import type { TransactionListItem } from "@/features/transactions/domain/types";
import {
  listTransactions,
  type TransactionListOptions,
} from "@/features/transactions/repositories/transaction-repository";
import { summarizeDebitTotals } from "@/features/transactions/services/ledger-amount-display";
import { prisma } from "@/server/db";

export type GetTransactionListOptions = Pick<
  TransactionListOptions,
  | "status"
  | "type"
  | "customerId"
  | "createdById"
  | "valueDateFrom"
  | "valueDateTo"
  | "take"
  | "includeDeleted"
>;

/**
 * Read-only transaction list rows for UI / dashboard.
 * Loads ledger lines only for the selected transactions (not the full ledger).
 */
export async function getTransactionList(
  options: GetTransactionListOptions = {},
): Promise<TransactionListItem[]> {
  const transactions = await listTransactions(options);
  if (transactions.length === 0) {
    return [];
  }

  const transactionIds = transactions.map((transaction) => transaction.id);
  const customerIds = [
    ...new Set(
      transactions
        .map((transaction) => transaction.customerId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const operatorIds = [
    ...new Set(
      transactions
        .map((transaction) => transaction.createdById)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const [entries, currencies, customers, users] = await Promise.all([
    listLedgerEntries({ transactionIds }),
    listCurrencies({ includeDeleted: true }),
    listCustomersByIds(customerIds, { includeDeleted: true }),
    operatorIds.length === 0
      ? Promise.resolve([])
      : prisma.user.findMany({
          where: { id: { in: operatorIds } },
          select: { id: true, fullName: true, username: true },
        }),
  ]);

  const currenciesById = new Map(
    currencies.map((currency) => [currency.id, currency] as const),
  );
  const customerNames = new Map(
    customers.map(
      (customer) =>
        [
          customer.id,
          formatCustomerLabel(customer.fullName, customer.code),
        ] as const,
    ),
  );
  const operatorNames = new Map(
    users.map(
      (user) =>
        [user.id, user.fullName.trim() || user.username] as const,
    ),
  );

  const entriesByTransaction = new Map<
    string,
    Awaited<ReturnType<typeof listLedgerEntries>>
  >();

  for (const entry of entries) {
    const current = entriesByTransaction.get(entry.transactionId) ?? [];
    current.push(entry);
    entriesByTransaction.set(entry.transactionId, current);
  }

  return transactions.map((transaction) => {
    const summary = summarizeDebitTotals(
      entriesByTransaction.get(transaction.id) ?? [],
      currenciesById,
    );

    return {
      id: transaction.id,
      reference: transaction.reference,
      type: transaction.type,
      customerName: transaction.customerId
        ? (customerNames.get(transaction.customerId) ?? null)
        : null,
      currencyDisplay: summary.currencyDisplay,
      amountDisplay: summary.amountDisplay,
      status: transaction.status,
      operatorName: transaction.createdById
        ? (operatorNames.get(transaction.createdById) ?? null)
        : null,
      valueDate: transaction.valueDate.toISOString(),
    };
  });
}
