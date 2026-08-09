import "server-only";

import { requirePermission } from "@/features/auth/permissions/authorize";
import { queueAutoBackup } from "@/features/backup/services/auto-backup";
import type {
  ExternalMoneyListItem,
  ExternalMoneyListOptions,
} from "@/features/external-money/domain/types";
import {
  displayExternalMoneyReference,
  isExternalMoneyTransaction,
  notesFromExternalMoneyDescription,
} from "@/features/external-money/schemas/external-money-form";
import { listCurrencies } from "@/features/ledger/repositories/currency-repository";
import { listLedgerEntries } from "@/features/ledger/repositories/ledger-repository";
import {
  formatCurrencyLabel,
  formatMoneyWithCurrency,
} from "@/features/transactions/domain/currency-display";
import {
  formatPrismaAmount,
  prismaAmountToMajorString,
} from "@/features/transactions/services/ledger-amount-display";
import { findWalletById } from "@/features/wallets/repositories/wallet-repository";
import { prisma } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";

function buildExternalMoneyWhere(
  options: ExternalMoneyListOptions,
): Prisma.TransactionWhereInput {
  const archiveFilter = options.archiveFilter ?? "active";
  const search = options.search?.trim() ?? "";

  return {
    type: "ADJUSTMENT",
    ...(archiveFilter === "archived"
      ? { deletedAt: { not: null } }
      : { deletedAt: null }),
    AND: [
      {
        OR: [
          { reference: { startsWith: "EXT-MONEY-" } },
          { reference: { startsWith: "deleted:EXT-MONEY-" } },
          { description: { startsWith: "External money" } },
          { description: { startsWith: "external money" } },
        ],
      },
      ...(search
        ? [
            {
              OR: [
                { reference: { contains: search } },
                { description: { contains: search } },
              ],
            } satisfies Prisma.TransactionWhereInput,
          ]
        : []),
    ],
  };
}

export async function listExternalMoney(
  options: ExternalMoneyListOptions = {},
): Promise<ExternalMoneyListItem[]> {
  await requirePermission("transactions.manage");

  const transactions = await prisma.transaction.findMany({
    where: buildExternalMoneyWhere(options),
    orderBy: [{ valueDate: "desc" }, { createdAt: "desc" }],
  });

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
    listLedgerEntries({
      transactionIds,
      includeDeletedTransactions: true,
    }),
    listCurrencies({ includeDeleted: true }),
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
  const operatorNames = new Map(
    users.map(
      (user) => [user.id, user.fullName.trim() || user.username] as const,
    ),
  );

  const debitByTransaction = new Map<
    string,
    {
      currencyCode: string;
      currencySymbol: string | null;
      amountDisplay: string;
      walletId: string;
    }
  >();

  for (const entry of entries) {
    if (entry.direction !== "DEBIT") {
      continue;
    }
    if (debitByTransaction.has(entry.transactionId)) {
      continue;
    }
    const currency = currenciesById.get(entry.currencyId);
    const amountDisplay = currency
      ? (formatPrismaAmount(entry.amount, currency) ??
        prismaAmountToMajorString(entry.amount))
      : prismaAmountToMajorString(entry.amount);
    debitByTransaction.set(entry.transactionId, {
      currencyCode: currency?.code ?? "—",
      currencySymbol: currency?.symbol ?? null,
      amountDisplay,
      walletId: entry.walletId,
    });
  }

  const walletIds = [
    ...new Set(
      [...debitByTransaction.values()].map((entry) => entry.walletId),
    ),
  ];
  const wallets = await Promise.all(
    walletIds.map((walletId) =>
      findWalletById(walletId, { includeDeleted: true }),
    ),
  );
  const walletNames = new Map(
    wallets
      .filter((wallet): wallet is NonNullable<typeof wallet> => Boolean(wallet))
      .map((wallet) => [wallet.id, wallet.name] as const),
  );

  return transactions
    .filter((transaction) =>
      isExternalMoneyTransaction({
        type: transaction.type,
        reference: transaction.reference,
        description: transaction.description,
      }),
    )
    .map((transaction) => {
      const debit = debitByTransaction.get(transaction.id);
      const currencyCode = debit?.currencyCode ?? "—";
      const currencySymbol = debit?.currencySymbol ?? null;
      const amountDisplay = debit?.amountDisplay ?? "—";

      return {
        id: transaction.id,
        reference: displayExternalMoneyReference(transaction.reference),
        notes: notesFromExternalMoneyDescription(transaction.description),
        currencyCode,
        currencySymbol,
        currencyLabel: formatCurrencyLabel({
          code: currencyCode,
          symbol: currencySymbol,
        }),
        amountDisplay,
        amountFormatted: formatMoneyWithCurrency({
          code: currencyCode,
          symbol: currencySymbol,
          amountDisplay,
        }),
        cashWalletName: debit
          ? (walletNames.get(debit.walletId) ?? "—")
          : "—",
        operatorName: transaction.createdById
          ? (operatorNames.get(transaction.createdById) ?? null)
          : null,
        valueDate: transaction.valueDate.toISOString(),
        isArchived: transaction.deletedAt !== null,
      } satisfies ExternalMoneyListItem;
    });
}
