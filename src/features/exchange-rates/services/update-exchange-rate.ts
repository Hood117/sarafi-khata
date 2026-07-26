import "server-only";

import { Prisma, type ExchangeRate } from "@/generated/prisma/client";
import { findCurrencyById } from "@/features/currencies/repositories/currency-repository";
import { ExchangeRateError } from "@/features/exchange-rates/domain/errors";
import { parseEffectiveDate } from "@/features/exchange-rates/domain/rate";
import {
  toExchangeRateFormFieldErrors,
  updateExchangeRateSchema,
} from "@/features/exchange-rates/schemas/exchange-rate-form";
import {
  findExchangeRateById,
  updateExchangeRateRecord,
} from "@/features/exchange-rates/repositories/exchange-rate-repository";

export type UpdateExchangeRateResult = ExchangeRate;

async function requireExistingCurrency(
  id: string,
  field: "baseCurrencyId" | "quoteCurrencyId",
  label: string,
) {
  const currency = await findCurrencyById(id);

  if (!currency) {
    throw new ExchangeRateError(
      "CURRENCY_NOT_FOUND",
      `${label} currency was not found.`,
      { [field]: `${label} currency was not found.` },
    );
  }

  return currency;
}

export async function updateExchangeRateEntry(
  id: string,
  input: unknown,
): Promise<UpdateExchangeRateResult> {
  const existing = await findExchangeRateById(id, { includeInactive: true });

  if (!existing) {
    throw new ExchangeRateError("NOT_FOUND", "Exchange rate not found.");
  }

  const parsed = updateExchangeRateSchema.safeParse(input);

  if (!parsed.success) {
    throw new ExchangeRateError(
      "VALIDATION",
      "Please correct the highlighted fields.",
      toExchangeRateFormFieldErrors(parsed.error),
    );
  }

  const data = parsed.data;

  if (data.baseCurrencyId === data.quoteCurrencyId) {
    throw new ExchangeRateError(
      "SAME_CURRENCY",
      "Base and quote currencies must be different.",
      {
        quoteCurrencyId: "Quote currency must be different from base currency.",
      },
    );
  }

  await Promise.all([
    requireExistingCurrency(data.baseCurrencyId, "baseCurrencyId", "Base"),
    requireExistingCurrency(data.quoteCurrencyId, "quoteCurrencyId", "Quote"),
  ]);

  let effectiveAt: Date;
  try {
    effectiveAt = parseEffectiveDate(data.effectiveDate);
  } catch {
    throw new ExchangeRateError(
      "VALIDATION",
      "Please correct the highlighted fields.",
      { effectiveDate: "Effective date must be a valid calendar date." },
    );
  }

  return updateExchangeRateRecord(id, {
    baseCurrencyId: data.baseCurrencyId,
    quoteCurrencyId: data.quoteCurrencyId,
    rate: new Prisma.Decimal(data.rate),
    effectiveAt,
    isActive: data.isActive,
  });
}
