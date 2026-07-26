import "server-only";

import type { Currency } from "@/generated/prisma/client";
import { CurrencyError } from "@/features/currencies/domain/errors";
import {
  toCurrencyFormFieldErrors,
  updateCurrencySchema,
} from "@/features/currencies/schemas/currency-form";
import {
  findCurrencyById,
  updateCurrency,
} from "@/features/currencies/repositories/currency-repository";
import { getSystemSetting } from "@/features/settings/repositories/system-setting-repository";

export type UpdateCurrencyResult = Currency;

async function assertCanDeactivate(
  currencyCode: string,
  nextIsActive: boolean,
): Promise<void> {
  if (nextIsActive) {
    return;
  }

  const setting = await getSystemSetting("app.baseCurrencyCode");
  const baseCode = setting?.value.trim().toUpperCase() ?? "AFN";

  if (currencyCode === baseCode) {
    throw new CurrencyError(
      "BASE_CURRENCY",
      "Cannot deactivate the application base currency.",
      {
        isActive:
          "This currency is the application base currency and cannot be deactivated.",
      },
    );
  }
}

export async function updateCurrencyRecord(
  id: string,
  input: unknown,
): Promise<UpdateCurrencyResult> {
  const existing = await findCurrencyById(id);

  if (!existing) {
    throw new CurrencyError("NOT_FOUND", "Currency not found.");
  }

  const parsed = updateCurrencySchema.safeParse(input);

  if (!parsed.success) {
    throw new CurrencyError(
      "VALIDATION",
      "Please correct the highlighted fields.",
      toCurrencyFormFieldErrors(parsed.error),
    );
  }

  const data = parsed.data;
  await assertCanDeactivate(existing.code, data.isActive);

  // Code is immutable after create — never written here.
  return updateCurrency(id, {
    name: data.name,
    symbol: data.symbol,
    isActive: data.isActive,
  });
}
