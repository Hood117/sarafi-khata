import "server-only";

import {
  createCurrency,
  createReversalEntry,
  moneyFromMajorUnits,
  toCurrencyCode,
  type LedgerEntryInput,
} from "@/features/ledger/domain";
import { listLedgerEntriesByTransaction } from "@/features/ledger/repositories/ledger-repository";
import { TransactionError } from "@/features/transactions/domain/transaction-errors";
import type { PostedTransaction } from "@/features/transactions/domain/types";
import { rethrowAsTransactionError } from "@/features/transactions/services/map-posting-error";
import { postTransaction } from "@/features/transactions/services/post-transaction";
import {
  findTransactionById,
  findTransactionByReference,
} from "@/features/transactions/repositories/transaction-repository";
import { prisma } from "@/server/db";

export type VoidTransactionParams = {
  transactionId: string;
  createdById: string;
  reason?: string | null;
};

export type VoidTransactionResult = {
  original: {
    id: string;
    reference: string;
    status: "VOIDED";
  };
  reversal: PostedTransaction;
};

function buildVoidReference(originalReference: string): string {
  const base = `VOID-${originalReference}`.slice(0, 90);
  return base;
}

/**
 * Voids a POSTED transaction by posting reversing ledger legs through
 * postTransaction, then marking the original status VOIDED.
 *
 * Never deletes or edits original ledger rows (append-only).
 */
export async function voidPostedTransaction(
  params: VoidTransactionParams,
): Promise<VoidTransactionResult> {
  const original = await findTransactionById(params.transactionId);
  if (!original || original.deletedAt) {
    throw new TransactionError("NOT_FOUND", "Transaction was not found.");
  }

  if (original.status === "VOIDED") {
    throw new TransactionError(
      "INVALID_STATUS",
      "This transaction is already voided.",
    );
  }

  if (original.status !== "POSTED") {
    throw new TransactionError(
      "INVALID_STATUS",
      "Only posted transactions can be voided.",
    );
  }

  const entries = await listLedgerEntriesByTransaction(original.id);
  if (entries.length === 0) {
    throw new TransactionError(
      "VALIDATION",
      "Transaction has no ledger entries to reverse.",
    );
  }

  const currencyIds = [...new Set(entries.map((entry) => entry.currencyId))];
  const currencies = await prisma.currency.findMany({
    where: { id: { in: currencyIds } },
  });
  const currenciesById = new Map(
    currencies.map((currency) => [currency.id, currency] as const),
  );

  const reversalLines: LedgerEntryInput[] = [];
  for (const entry of entries) {
    const currency = currenciesById.get(entry.currencyId);
    if (!currency) {
      throw new TransactionError(
        "NOT_FOUND",
        "A currency on the original transaction was not found.",
      );
    }

    const domainCurrency = createCurrency({
      code: currency.code,
      name: currency.name,
      symbol: currency.symbol ?? undefined,
      decimalPlaces: currency.decimalPlaces,
    });

    const money = moneyFromMajorUnits(
      entry.amount.toString(),
      domainCurrency,
    );

    const reversed = createReversalEntry(
      {
        walletId: entry.walletId,
        currency: toCurrencyCode(currency.code),
        direction: entry.direction,
        amount: money,
        memo: entry.memo ?? undefined,
      },
      `Void of ${original.reference}`,
    );

    reversalLines.push(reversed);
  }

  const voidReference = buildVoidReference(original.reference);
  const existingVoid = await findTransactionByReference(voidReference);
  if (existingVoid) {
    throw new TransactionError(
      "CONFLICT",
      `A void transaction already exists for reference ${original.reference}.`,
      { reference: "Void reference already exists." },
    );
  }

  const reason = params.reason?.trim() || null;
  const description = reason
    ? `Void of ${original.reference}: ${reason}`
    : `Void of ${original.reference}`;

  let reversal: PostedTransaction;
  try {
    reversal = await postTransaction({
      reference: voidReference,
      type: "ADJUSTMENT",
      customerId: original.customerId,
      createdById: params.createdById,
      valueDate: new Date(),
      description,
      entries: reversalLines,
    });
  } catch (error) {
    rethrowAsTransactionError(error);
    throw error;
  }

  const updated = await prisma.transaction.update({
    where: { id: original.id },
    data: {
      status: "VOIDED",
      description: original.description
        ? `${original.description}\n[VOIDED by ${voidReference}]`
        : `[VOIDED by ${voidReference}]`,
    },
  });

  return {
    original: {
      id: updated.id,
      reference: updated.reference,
      status: "VOIDED",
    },
    reversal,
  };
}
