import "server-only";

import {
  createCurrency,
  isLedgerDomainError,
  moneyFromMajorUnits,
} from "@/features/ledger/domain";
import { findCurrencyById } from "@/features/ledger/repositories/currency-repository";
import { HawalaError } from "@/features/hawala/domain/errors";
import type { HawalaTransferRecord } from "@/features/hawala/domain/types";
import { findHawalaTransferById } from "@/features/hawala/repositories/hawala-repository";
import { postHawalaMovement } from "@/features/hawala/services/post-hawala-movement";
import { prisma } from "@/server/db";

/**
 * Completes a PENDING hawala transfer by posting through postTransaction.
 * Used to retry after a failed post, or if a transfer was left PENDING.
 */
export async function completeHawala(
  hawalaId: string,
  options: { completedById?: string } = {},
): Promise<HawalaTransferRecord> {
  const hawala = await findHawalaTransferById(hawalaId);
  if (!hawala) {
    throw new HawalaError("NOT_FOUND", "Hawala transfer was not found.");
  }

  if (hawala.status === "COMPLETED" || hawala.transactionId) {
    throw new HawalaError(
      "INVALID_STATUS",
      "Hawala transfer is already completed.",
    );
  }

  if (hawala.status === "CANCELLED") {
    throw new HawalaError(
      "INVALID_STATUS",
      "Cancelled hawala transfers cannot be completed.",
    );
  }

  if (hawala.status !== "PENDING") {
    throw new HawalaError(
      "INVALID_STATUS",
      "Only pending hawala transfers can be completed.",
    );
  }

  const createdById = options.completedById ?? hawala.createdById;
  const operator = await prisma.user.findUnique({ where: { id: createdById } });
  if (!operator) {
    throw new HawalaError("NOT_FOUND", "Operator was not found.", {
      createdById: "Operator was not found.",
    });
  }
  if (!operator.isActive) {
    throw new HawalaError(
      "INACTIVE",
      "Operator is inactive and cannot complete hawala transfers.",
      { createdById: "Operator is inactive." },
    );
  }

  const currency = await findCurrencyById(hawala.currencyId);
  if (!currency) {
    throw new HawalaError("NOT_FOUND", "Currency was not found.", {
      currencyCode: "Currency was not found.",
    });
  }

  const domainCurrency = createCurrency({
    code: currency.code,
    name: currency.name,
    symbol: currency.symbol ?? undefined,
    decimalPlaces: currency.decimalPlaces,
  });

  let money;
  try {
    money = moneyFromMajorUnits(hawala.amount.toString(), domainCurrency);
  } catch (error) {
    if (isLedgerDomainError(error)) {
      throw new HawalaError("VALIDATION", error.message, {
        amount: error.message,
      });
    }
    throw error;
  }

  return postHawalaMovement({
    hawala,
    direction: hawala.direction,
    currencyCode: domainCurrency.code,
    money,
    createdById,
  });
}
