"use server";

import { requirePermission } from "@/features/auth/permissions/authorize";
import { isCurrencyError } from "@/features/currencies/domain/errors";
import type { CurrencyFormData } from "@/features/currencies/domain/types";
import type { CurrencyFormFieldErrors } from "@/features/currencies/schemas/currency-form";
import { createCurrencyRecord } from "@/features/currencies/services/create-currency";
import { getCurrencyForForm } from "@/features/currencies/services/get-currency";
import { setCurrencyActiveRecord } from "@/features/currencies/services/set-currency-active";
import { updateCurrencyRecord } from "@/features/currencies/services/update-currency";

export type CurrencyFieldErrors = CurrencyFormFieldErrors;

export type CurrencyMutationActionResult =
  | {
      ok: true;
      message: string;
      currencyId: string;
    }
  | {
      ok: false;
      code:
        | "VALIDATION"
        | "DUPLICATE_CODE"
        | "NOT_FOUND"
        | "BASE_CURRENCY"
        | "UNKNOWN";
      message: string;
      fieldErrors?: CurrencyFieldErrors;
    };

export type CreateCurrencyActionResult = CurrencyMutationActionResult;
export type UpdateCurrencyActionResult = CurrencyMutationActionResult;
export type SetCurrencyActiveActionResult = CurrencyMutationActionResult;

export type CreateCurrencyActionInput = {
  code: string;
  name: string;
  symbol?: string;
  isActive: boolean;
};

export type UpdateCurrencyActionInput = {
  id: string;
  name: string;
  symbol?: string;
  isActive: boolean;
};

export type GetCurrencyForEditActionResult =
  | { ok: true; currency: CurrencyFormData }
  | {
      ok: false;
      code: "NOT_FOUND" | "UNKNOWN";
      message: string;
    };

function toMutationFailure(error: unknown): CurrencyMutationActionResult {
  if (isCurrencyError(error)) {
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
    message: "Unable to save currency. Please try again.",
  };
}

export async function createCurrencyAction(
  input: CreateCurrencyActionInput,
): Promise<CreateCurrencyActionResult> {
  await requirePermission("settings.manage");

  try {
    const currency = await createCurrencyRecord({
      code: input.code,
      name: input.name,
      symbol: input.symbol ?? "",
      isActive: input.isActive,
    });

    return {
      ok: true,
      message: `${currency.code} was added successfully.`,
      currencyId: currency.id,
    };
  } catch (error) {
    const failure = toMutationFailure(error);
    if (!failure.ok && failure.code === "UNKNOWN") {
      return {
        ...failure,
        message: "Unable to add currency. Please try again.",
      };
    }
    return failure;
  }
}

export async function updateCurrencyAction(
  input: UpdateCurrencyActionInput,
): Promise<UpdateCurrencyActionResult> {
  await requirePermission("settings.manage");

  try {
    const currency = await updateCurrencyRecord(input.id, {
      name: input.name,
      symbol: input.symbol ?? "",
      isActive: input.isActive,
    });

    return {
      ok: true,
      message: `${currency.code} was updated successfully.`,
      currencyId: currency.id,
    };
  } catch (error) {
    const failure = toMutationFailure(error);
    if (!failure.ok && failure.code === "UNKNOWN") {
      return {
        ...failure,
        message: "Unable to update currency. Please try again.",
      };
    }
    return failure;
  }
}

export async function setCurrencyActiveAction(
  id: string,
  isActive: boolean,
): Promise<SetCurrencyActiveActionResult> {
  await requirePermission("settings.manage");

  try {
    const currency = await setCurrencyActiveRecord(id, isActive);

    return {
      ok: true,
      message: isActive
        ? `${currency.code} was activated.`
        : `${currency.code} was deactivated.`,
      currencyId: currency.id,
    };
  } catch (error) {
    const failure = toMutationFailure(error);
    if (!failure.ok && failure.code === "UNKNOWN") {
      return {
        ...failure,
        message: isActive
          ? "Unable to activate currency. Please try again."
          : "Unable to deactivate currency. Please try again.",
      };
    }
    return failure;
  }
}

export async function getCurrencyForEditAction(
  id: string,
): Promise<GetCurrencyForEditActionResult> {
  await requirePermission("settings.manage");

  try {
    const currency = await getCurrencyForForm(id);
    return { ok: true, currency };
  } catch (error) {
    if (isCurrencyError(error) && error.code === "NOT_FOUND") {
      return {
        ok: false,
        code: "NOT_FOUND",
        message: error.message,
      };
    }

    return {
      ok: false,
      code: "UNKNOWN",
      message: "Unable to load currency. Please try again.",
    };
  }
}
