import "server-only";

import { CurrencyError } from "@/features/currencies/domain/errors";
import type {
  CurrencyFormData,
  CurrencyListItem,
} from "@/features/currencies/domain/types";
import { findCurrencyById } from "@/features/currencies/repositories/currency-repository";

function toListItem(
  currency: NonNullable<Awaited<ReturnType<typeof findCurrencyById>>>,
): CurrencyListItem {
  return {
    id: currency.id,
    code: currency.code,
    name: currency.name,
    symbol: currency.symbol,
    isActive: currency.isActive,
    createdAt: currency.createdAt.toISOString(),
    updatedAt: currency.updatedAt.toISOString(),
  };
}

export async function getCurrencyById(id: string): Promise<CurrencyListItem> {
  const currency = await findCurrencyById(id);

  if (!currency) {
    throw new CurrencyError("NOT_FOUND", "Currency not found.");
  }

  return toListItem(currency);
}

export async function getCurrencyForForm(id: string): Promise<CurrencyFormData> {
  const currency = await findCurrencyById(id);

  if (!currency) {
    throw new CurrencyError("NOT_FOUND", "Currency not found.");
  }

  return {
    id: currency.id,
    code: currency.code,
    name: currency.name,
    symbol: currency.symbol,
    isActive: currency.isActive,
  };
}
