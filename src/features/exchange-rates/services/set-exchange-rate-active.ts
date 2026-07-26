import "server-only";

import type { ExchangeRate } from "@/generated/prisma/client";
import { ExchangeRateError } from "@/features/exchange-rates/domain/errors";
import {
  findExchangeRateById,
  setExchangeRateActive,
} from "@/features/exchange-rates/repositories/exchange-rate-repository";

export type SetExchangeRateActiveResult = ExchangeRate;

export async function setExchangeRateActiveRecord(
  id: string,
  isActive: boolean,
): Promise<SetExchangeRateActiveResult> {
  const existing = await findExchangeRateById(id, { includeInactive: true });

  if (!existing) {
    throw new ExchangeRateError("NOT_FOUND", "Exchange rate not found.");
  }

  const currentlyActive = existing.deletedAt === null;
  if (currentlyActive === isActive) {
    return existing;
  }

  return setExchangeRateActive(id, isActive);
}
