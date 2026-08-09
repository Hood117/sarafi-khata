import "server-only";

import type { Currency } from "@/generated/prisma/client";
import { CurrencyError } from "@/features/currencies/domain/errors";
import {
  createCurrencySchema,
  toCurrencyFormFieldErrors,
} from "@/features/currencies/schemas/currency-form";
import {
  createCurrency,
  findCurrencyByCode,
} from "@/features/currencies/repositories/currency-repository";

export type CreateCurrencyResult = Currency;

function isUniqueConstraintError(
  error: unknown,
): error is { code: string; meta?: { target?: string | string[] } } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

export async function createCurrencyRecord(
  input: unknown,
): Promise<CreateCurrencyResult> {
  const parsed = createCurrencySchema.safeParse(input);

  if (!parsed.success) {
    throw new CurrencyError(
      "VALIDATION",
      "Please correct the highlighted fields.",
      toCurrencyFormFieldErrors(parsed.error),
    );
  }

  const data = parsed.data;
  const existing = await findCurrencyByCode(data.code);

  if (existing) {
    throw new CurrencyError(
      "DUPLICATE_CODE",
      "A currency with this code already exists.",
      { code: "A currency with this code already exists." },
    );
  }

  try {
    return await createCurrency({
      code: data.code,
      name: data.name,
      symbol: data.symbol,
      isActive: data.isActive,
      decimalPlaces: 2,
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new CurrencyError(
        "DUPLICATE_CODE",
        "A currency with this code already exists.",
        { code: "A currency with this code already exists." },
      );
    }

    throw error;
  }
}
