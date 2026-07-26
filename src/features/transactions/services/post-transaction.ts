import "server-only";

import {
  moneyToMajorUnitString,
  toCurrencyCode,
  type CurrencyCode,
} from "@/features/ledger/domain";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { PostingError } from "@/features/transactions/domain/errors";
import { normalizePostTransactionInput } from "@/features/transactions/domain/transaction-rules";
import type {
  PostedTransaction,
  PostTransactionInput,
} from "@/features/transactions/domain/types";

/**
 * Single entry point for every money movement.
 *
 * Future deposit, withdrawal, transfer, exchange, hawala, and adjustment flows
 * must build a balanced PostTransactionInput and call this service — never write
 * Transaction / LedgerEntry rows directly.
 *
 * Guarantees:
 * - Domain + business validation before write
 * - Ledger balanced per currency
 * - Transaction + all LedgerEntry rows in one prisma.$transaction()
 * - Append-only ledger (create only)
 * - Wallet balances remain derived from ledger (no balance column updates)
 */
export async function postTransaction(
  input: PostTransactionInput,
): Promise<PostedTransaction> {
  const normalized = normalizePostTransactionInput(input);

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.transaction.findFirst({
        where: {
          reference: normalized.reference,
          deletedAt: null,
        },
      });

      if (existing) {
        throw new PostingError(
          "CONFLICT",
          `Transaction reference "${normalized.reference}" already exists.`,
          "reference",
        );
      }

      if (normalized.customerId) {
        const customer = await tx.customer.findFirst({
          where: {
            id: normalized.customerId,
            deletedAt: null,
          },
        });

        if (!customer) {
          throw new PostingError(
            "NOT_FOUND",
            "Customer was not found.",
            "customerId",
          );
        }

        if (!customer.isActive) {
          throw new PostingError(
            "INACTIVE",
            "Customer is inactive and cannot be used for posting.",
            "customerId",
          );
        }
      }

      if (normalized.createdById) {
        const user = await tx.user.findUnique({
          where: { id: normalized.createdById },
        });

        if (!user) {
          throw new PostingError(
            "NOT_FOUND",
            "Created-by user was not found.",
            "createdById",
          );
        }

        if (!user.isActive) {
          throw new PostingError(
            "INACTIVE",
            "Created-by user is inactive and cannot post transactions.",
            "createdById",
          );
        }
      }

      const walletIds = [...new Set(normalized.entries.map((e) => e.walletId))];
      const wallets = await tx.wallet.findMany({
        where: {
          id: { in: walletIds },
          deletedAt: null,
        },
      });

      if (wallets.length !== walletIds.length) {
        const found = new Set(wallets.map((wallet) => wallet.id));
        const missing = walletIds.find((id) => !found.has(id));
        throw new PostingError(
          "NOT_FOUND",
          `Wallet was not found: ${missing ?? "unknown"}.`,
          "entries",
        );
      }

      for (const wallet of wallets) {
        if (!wallet.isActive) {
          throw new PostingError(
            "INACTIVE",
            `Wallet "${wallet.name}" is inactive and cannot receive postings.`,
            "entries",
          );
        }

        if (wallet.type === "CUSTOMER" && !wallet.customerId) {
          throw new PostingError(
            "VALIDATION",
            `Customer wallet "${wallet.name}" is missing a customer link.`,
            "entries",
          );
        }
      }

      const currencyCodes = [
        ...new Set(normalized.entries.map((entry) => entry.currency)),
      ];
      const currencies = await tx.currency.findMany({
        where: {
          code: { in: currencyCodes },
          deletedAt: null,
        },
      });

      const currenciesByCode = new Map(
        currencies.map((currency) => {
          const code = toCurrencyCode(currency.code);
          return [code, currency] as const;
        }),
      );

      for (const code of currencyCodes) {
        const currency = currenciesByCode.get(code as CurrencyCode);
        if (!currency) {
          throw new PostingError(
            "NOT_FOUND",
            `Currency was not found: ${code}.`,
            "entries",
          );
        }

        if (!currency.isActive) {
          throw new PostingError(
            "INACTIVE",
            `Currency ${currency.code} is inactive and cannot be used for posting.`,
            "entries",
          );
        }
      }

      const exchangeRateIds = [
        ...new Set(
          normalized.entries
            .map((entry) => entry.exchangeRateId)
            .filter((id): id is string => typeof id === "string"),
        ),
      ];

      if (exchangeRateIds.length > 0) {
        // Allow soft-deleted rates so EXCHANGE can link immutable historical
        // snapshots (inactive) without treating them as live market rates.
        const rates = await tx.exchangeRate.findMany({
          where: {
            id: { in: exchangeRateIds },
          },
        });

        if (rates.length !== exchangeRateIds.length) {
          const found = new Set(rates.map((rate) => rate.id));
          const missing = exchangeRateIds.find((id) => !found.has(id));
          throw new PostingError(
            "NOT_FOUND",
            `Exchange rate was not found: ${missing ?? "unknown"}.`,
            "entries",
          );
        }
      }

      const postedAt = new Date();

      const transaction = await tx.transaction.create({
        data: {
          reference: normalized.reference,
          type: normalized.type,
          status: "POSTED",
          valueDate: normalized.valueDate,
          postedAt,
          description: normalized.description,
          ...(normalized.customerId
            ? { customer: { connect: { id: normalized.customerId } } }
            : {}),
          ...(normalized.createdById
            ? { createdBy: { connect: { id: normalized.createdById } } }
            : {}),
        },
      });

      const ledgerRows = normalized.entries.map((entry) => {
        const currency = currenciesByCode.get(entry.currency);
        if (!currency) {
          throw new PostingError(
            "NOT_FOUND",
            `Currency was not found: ${entry.currency}.`,
            "entries",
          );
        }

        const amount = new Prisma.Decimal(
          moneyToMajorUnitString(entry.amount, currency.decimalPlaces),
        );

        return {
          transactionId: transaction.id,
          walletId: entry.walletId,
          currencyId: currency.id,
          direction: entry.direction,
          amount,
          exchangeRateId: entry.exchangeRateId ?? null,
          memo: entry.memo ?? null,
        };
      });

      await tx.ledgerEntry.createMany({ data: ledgerRows });

      const ledgerEntries = await tx.ledgerEntry.findMany({
        where: { transactionId: transaction.id },
        orderBy: { createdAt: "asc" },
      });

      if (ledgerEntries.length !== ledgerRows.length) {
        throw new PostingError(
          "VALIDATION",
          "Failed to persist all ledger entries for the transaction.",
          "entries",
        );
      }

      return {
        ...transaction,
        ledgerEntries,
      };
    });
  } catch (error) {
    if (error instanceof PostingError) {
      throw error;
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new PostingError(
        "CONFLICT",
        `Transaction reference "${normalized.reference}" already exists.`,
        "reference",
      );
    }

    throw error;
  }
}
