"use server";

import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  AUDIT_MODULES,
  auditAction,
} from "@/features/audit";
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
import { parseEntityId, parseSetActiveAction } from "@/lib/action-schemas";

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
      code: "NOT_FOUND" | "VALIDATION" | "UNKNOWN";
      message: string;
    };

export type GetExchangeRateFormOptionsActionResult =
  | { ok: true; options: ExchangeRateFormOptions }
  | {
      ok: false;
      code: "UNKNOWN";
      message: string;
    };

function toExchangeRateAuditValues(rate: {
  baseCurrencyId: string;
  quoteCurrencyId: string;
  rate?: string;
  rateDisplay?: string;
  effectiveDate: string;
  isActive: boolean;
  baseCurrencyCode?: string;
  quoteCurrencyCode?: string;
}) {
  return {
    baseCurrencyId: rate.baseCurrencyId,
    quoteCurrencyId: rate.quoteCurrencyId,
    ...(rate.baseCurrencyCode !== undefined
      ? { baseCurrencyCode: rate.baseCurrencyCode }
      : {}),
    ...(rate.quoteCurrencyCode !== undefined
      ? { quoteCurrencyCode: rate.quoteCurrencyCode }
      : {}),
    rate: rate.rateDisplay ?? rate.rate ?? null,
    effectiveDate: rate.effectiveDate,
    isActive: rate.isActive,
  };
}

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

export async function createExchangeRateAction(
  input: CreateExchangeRateActionInput,
): Promise<CreateExchangeRateActionResult> {
  const user = await requirePermission("settings.manage");

  try {
    const rate = await createExchangeRateEntry({
      baseCurrencyId: input.baseCurrencyId,
      quoteCurrencyId: input.quoteCurrencyId,
      rate: input.rate,
      effectiveDate: input.effectiveDate,
      isActive: input.isActive,
    });

    const detail = await getExchangeRateById(rate.id);

    await auditAction({
      userId: user.id,
      action: AUDIT_ACTIONS.EXCHANGE_RATE_CREATE,
      module: AUDIT_MODULES.EXCHANGE_RATES,
      entityType: AUDIT_ENTITY_TYPES.EXCHANGE_RATE,
      entityId: rate.id,
      afterValues: toExchangeRateAuditValues(detail),
    });

    return {
      ok: true,
      message: `1 ${detail.baseCurrencyCode} = ${detail.rateDisplay} ${detail.quoteCurrencyCode}`,
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
  const user = await requirePermission("settings.manage");

  try {
    const before = await getExchangeRateForForm(input.id);
    const rate = await updateExchangeRateEntry(input.id, {
      baseCurrencyId: input.baseCurrencyId,
      quoteCurrencyId: input.quoteCurrencyId,
      rate: input.rate,
      effectiveDate: input.effectiveDate,
      isActive: input.isActive,
    });

    const after = await getExchangeRateById(rate.id);

    await auditAction({
      userId: user.id,
      action: AUDIT_ACTIONS.EXCHANGE_RATE_UPDATE,
      module: AUDIT_MODULES.EXCHANGE_RATES,
      entityType: AUDIT_ENTITY_TYPES.EXCHANGE_RATE,
      entityId: rate.id,
      beforeValues: toExchangeRateAuditValues(before),
      afterValues: toExchangeRateAuditValues(after),
    });

    return {
      ok: true,
      message: `1 ${after.baseCurrencyCode} = ${after.rateDisplay} ${after.quoteCurrencyCode}`,
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
  id: unknown,
  isActive: unknown,
): Promise<SetExchangeRateActiveActionResult> {
  const user = await requirePermission("settings.manage");

  const parsed = parseSetActiveAction(id, isActive);
  if (!parsed) {
    return {
      ok: false,
      code: "VALIDATION",
      message: "Invalid activate/deactivate request.",
    };
  }

  try {
    const before = await getExchangeRateForForm(parsed.id);
    const rate = await setExchangeRateActiveRecord(
      parsed.id,
      parsed.isActive,
    );
    const after = await getExchangeRateForForm(rate.id);

    await auditAction({
      userId: user.id,
      action: AUDIT_ACTIONS.EXCHANGE_RATE_SET_ACTIVE,
      module: AUDIT_MODULES.EXCHANGE_RATES,
      entityType: AUDIT_ENTITY_TYPES.EXCHANGE_RATE,
      entityId: rate.id,
      beforeValues: toExchangeRateAuditValues(before),
      afterValues: toExchangeRateAuditValues(after),
    });

    return {
      ok: true,
      message: parsed.isActive
        ? "Exchange rate was activated."
        : "Exchange rate was deactivated.",
      exchangeRateId: rate.id,
    };
  } catch (error) {
    const failure = toMutationFailure(error);
    if (!failure.ok && failure.code === "UNKNOWN") {
      return {
        ...failure,
        message: parsed.isActive
          ? "Unable to activate exchange rate. Please try again."
          : "Unable to deactivate exchange rate. Please try again.",
      };
    }
    return failure;
  }
}

export async function getExchangeRateForEditAction(
  id: unknown,
): Promise<GetExchangeRateForEditActionResult> {
  await requirePermission("settings.manage");

  const exchangeRateId = parseEntityId(id);
  if (!exchangeRateId) {
    return {
      ok: false,
      code: "VALIDATION",
      message: "Exchange rate id is required.",
    };
  }

  try {
    const exchangeRate = await getExchangeRateForForm(exchangeRateId);
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
