import "server-only";

import { listCustomers } from "@/features/customers/repositories/customer-repository";
import { listCurrencies } from "@/features/ledger/repositories/currency-repository";
import { listLedgerEntries } from "@/features/ledger/repositories/ledger-repository";
import type { TransactionListItem } from "@/features/transactions/domain/types";
import { listTransactions } from "@/features/transactions/repositories/transaction-repository";
import { summarizeDebitTotals } from "@/features/transactions/services/ledger-amount-display";
import { prisma } from "@/server/db";

export async function getTransactionList(): Promise<TransactionListItem[]> {
  const [transactions, entries, currencies, customers, users] =
    await Promise.all([
      listTransactions(),
      listLedgerEntries(),
      listCurrencies({ includeDeleted: true }),
      listCustomers({ includeDeleted: true }),
      prisma.user.findMany({
        select: { id: true, fullName: true, username: true },
      }),
    ]);

  const currenciesById = new Map(
    currencies.map((currency) => [currency.id, currency] as const),
  );
  const customerNames = new Map(
    customers.map((customer) => [customer.id, customer.fullName] as const),
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
