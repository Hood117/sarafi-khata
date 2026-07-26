"use server";

import { requirePermission } from "@/features/auth/permissions/authorize";
import { isExchangeRateError } from "@/features/exchange-rates/domain/errors";
import type {
  ExchangeRateFormData,
  ExchangeRateFormOptions,
} from "@/features/exchange-rates/domain/types";
import type { ExchangeRateFormFieldErrors } from "@/features/exchange-rates/schemas/exchange-rate-form";
import { createExchangeRateEntry } from "@/features/exchange-rates/services/create-exchange-rate";
import {
  getExchangeRateById,
  getExchangeRateForForm,
} from "@/features/exchange-rates/services/get-exchange-rate";
import { getExchangeRateFormOptions } from "@/features/exchange-rates/services/get-exchange-rate-form-options";
import { setExchangeRateActiveRecord } from "@/features/exchange-rates/services/set-exchange-rate-active";
import { updateExchangeRateEntry } from "@/features/exchange-rates/services/update-exchange-rate";

export type ExchangeRateFieldErrors = ExchangeRateFormFieldErrors;

export type ExchangeRateMutationActionResult =
  | {
      ok: true;
      message: string;
      exchangeRateId: string;
    }
  | {
      ok: false;
      code:
        | "VALIDATION"
        | "NOT_FOUND"
        | "CURRENCY_NOT_FOUND"
        | "SAME_CURRENCY"
        | "UNKNOWN";
      message: string;
      fieldErrors?: ExchangeRateFieldErrors;
    };

export type CreateExchangeRateActionResult = ExchangeRateMutationActionResult;
export type UpdateExchangeRateActionResult = ExchangeRateMutationActionResult;
export type SetExchangeRateActiveActionResult = ExchangeRateMutationActionResult;

export type CreateExchangeRateActionInput = {
  baseCurrencyId: string;
  quoteCurrencyId: string;
  rate: string;
  effectiveDate: string;
  isActive: boolean;
};

export type UpdateExchangeRateActionInput = CreateExchangeRateActionInput & {
  id: string;
};

export type GetExchangeRateForEditActionResult =
  | { ok: true; exchangeRate: ExchangeRateFormData }
  | {
      ok: false;
      code: "NOT_FOUND" | "UNKNOWN";
      message: string;
    };

export type GetExchangeRateFormOptionsActionResult =
  | { ok: true; options: ExchangeRateFormOptions }
  | {
      ok: false;
      code: "UNKNOWN";
      message: string;
    };

function toMutationFailure(error: unknown): ExchangeRateMutationActionResult {
  if (isExchangeRateError(error)) {
    return {
      ok: false,
      code: error.code,
      message: error.message,
      fieldErrors: error.fieldErrors,
    };
  }

  return {
    ok: false,
    code: "UNKNOWN",
    message: "Unable to save exchange rate. Please try again.",
  };
}

async function successMessageForRate(id: string): Promise<string> {
  const detail = await getExchangeRateById(id);
  return `1 ${detail.baseCurrencyCode} = ${detail.rateDisplay} ${detail.quoteCurrencyCode}`;
}

export async function createExchangeRateAction(
  input: CreateExchangeRateActionInput,
): Promise<CreateExchangeRateActionResult> {
  await requirePermission("settings.manage");

  try {
    const rate = await createExchangeRateEntry({
      baseCurrencyId: input.baseCurrencyId,
      quoteCurrencyId: input.quoteCurrencyId,
      rate: input.rate,
      effectiveDate: input.effectiveDate,
      isActive: input.isActive,
    });

    return {
      ok: true,
      message: await successMessageForRate(rate.id),
      exchangeRateId: rate.id,
    };
  } catch (error) {
    const failure = toMutationFailure(error);
    if (!failure.ok && failure.code === "UNKNOWN") {
      return {
        ...failure,
        message: "Unable to add exchange rate. Please try again.",
      };
    }
    return failure;
  }
}

export async function updateExchangeRateAction(
  input: UpdateExchangeRateActionInput,
): Promise<UpdateExchangeRateActionResult> {
  await requirePermission("settings.manage");

  try {
    const rate = await updateExchangeRateEntry(input.id, {
      baseCurrencyId: input.baseCurrencyId,
      quoteCurrencyId: input.quoteCurrencyId,
      rate: input.rate,
      effectiveDate: input.effectiveDate,
      isActive: input.isActive,
    });

    return {
      ok: true,
      message: await successMessageForRate(rate.id),
      exchangeRateId: rate.id,
    };
  } catch (error) {
    const failure = toMutationFailure(error);
    if (!failure.ok && failure.code === "UNKNOWN") {
      return {
        ...failure,
        message: "Unable to update exchange rate. Please try again.",
      };
    }
    return failure;
  }
}

export async function setExchangeRateActiveAction(
  id: string,
  isActive: boolean,
): Promise<SetExchangeRateActiveActionResult> {
  await requirePermission("settings.manage");

  try {
    const rate = await setExchangeRateActiveRecord(id, isActive);

    return {
      ok: true,
      message: isActive
        ? "Exchange rate was activated."
        : "Exchange rate was deactivated.",
      exchangeRateId: rate.id,
    };
  } catch (error) {
    const failure = toMutationFailure(error);
    if (!failure.ok && failure.code === "UNKNOWN") {
      return {
        ...failure,
        message: isActive
          ? "Unable to activate exchange rate. Please try again."
          : "Unable to deactivate exchange rate. Please try again.",
      };
    }
    return failure;
  }
}

export async function getExchangeRateForEditAction(
  id: string,
): Promise<GetExchangeRateForEditActionResult> {
  await requirePermission("settings.manage");

  try {
    const exchangeRate = await getExchangeRateForForm(id);
    return { ok: true, exchangeRate };
  } catch (error) {
    if (isExchangeRateError(error) && error.code === "NOT_FOUND") {
      return {
        ok: false,
        code: "NOT_FOUND",
        message: error.message,
      };
    }

    return {
      ok: false,
      code: "UNKNOWN",
      message: "Unable to load exchange rate. Please try again.",
    };
  }
}

export async function getExchangeRateFormOptionsAction(): Promise<GetExchangeRateFormOptionsActionResult> {
  await requirePermission("settings.manage");

  try {
    const options = await getExchangeRateFormOptions();
    return { ok: true, options };
  } catch {
    return {
      ok: false,
      code: "UNKNOWN",
      message: "Unable to load currency options. Please try again.",
    };
  }
}
