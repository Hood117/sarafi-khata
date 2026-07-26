import "server-only";

import type { Currency } from "@/generated/prisma/client";
import { CurrencyError } from "@/features/currencies/domain/errors";
import {
  findCurrencyById,
  updateCurrency,
} from "@/features/currencies/repositories/currency-repository";
import { getSystemSetting } from "@/features/settings/repositories/system-setting-repository";

export type SetCurrencyActiveResult = Currency;

export async function setCurrencyActiveRecord(
  id: string,
  isActive: boolean,
): Promise<SetCurrencyActiveResult> {
  const existing = await findCurrencyById(id);

  if (!existing) {
    throw new CurrencyError("NOT_FOUND", "Currency not found.");
  }

  if (existing.isActive === isActive) {
    return existing;
  }

  if (!isActive) {
    const setting = await getSystemSetting("app.baseCurrencyCode");
    const baseCode = setting?.value.trim().toUpperCase() ?? "AFN";

    if (existing.code === baseCode) {
      throw new CurrencyError(
        "BASE_CURRENCY",
        "Cannot deactivate the application base currency.",
      );
    }
  }

  return updateCurrency(id, { isActive });
}
