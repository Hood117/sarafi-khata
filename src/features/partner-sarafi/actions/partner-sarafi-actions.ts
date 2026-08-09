"use server";

import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  AUDIT_MODULES,
  auditAction,
} from "@/features/audit";
import { requirePermission } from "@/features/auth/permissions/authorize";
import { isPartnerSarafiError } from "@/features/partner-sarafi/domain/errors";
import type { PartnerSarafiFormData } from "@/features/partner-sarafi/domain/types";
import type { PartnerSarafiFormFieldErrors } from "@/features/partner-sarafi/schemas/partner-sarafi-form";
import { createPartnerSarafiRecord } from "@/features/partner-sarafi/services/create-partner-sarafi";
import { getPartnerSarafiForForm } from "@/features/partner-sarafi/services/get-partner-sarafi";
import { setPartnerSarafiActiveRecord } from "@/features/partner-sarafi/services/set-partner-sarafi-active";
import { updatePartnerSarafiRecord } from "@/features/partner-sarafi/services/update-partner-sarafi";
import { parseEntityId, parseSetActiveAction } from "@/lib/action-schemas";

export type PartnerSarafiFieldErrors = PartnerSarafiFormFieldErrors;

export type PartnerSarafiMutationActionResult =
  | {
      ok: true;
      message: string;
      partnerId: string;
    }
  | {
      ok: false;
      code:
        | "VALIDATION"
        | "DUPLICATE_NAME"
        | "NOT_FOUND"
        | "INSUFFICIENT_COMMISSION"
        | "UNKNOWN";
      message: string;
      fieldErrors?: PartnerSarafiFieldErrors;
    };

export type CreatePartnerSarafiActionInput = {
  name: string;
  phone?: string;
  city?: string;
  country?: string;
  notes?: string;
  isActive: boolean;
  commissionEnabled: boolean;
  commissionPerAmount?: string;
  commissionFeeAmount?: string;
  commissionCurrencyCode?: string;
};

export type UpdatePartnerSarafiActionInput = CreatePartnerSarafiActionInput & {
  id: string;
};

export type GetPartnerSarafiForEditActionResult =
  | { ok: true; partner: PartnerSarafiFormData }
  | {
      ok: false;
      code: "NOT_FOUND" | "VALIDATION" | "UNKNOWN";
      message: string;
    };

function toAuditValues(partner: {
  name: string;
  phone?: string | null;
  city?: string | null;
  country?: string | null;
  notes?: string | null;
  isActive: boolean;
  commissionEnabled?: boolean;
  commissionPerAmount?: { toString(): string } | string | null;
  commissionFeeAmount?: { toString(): string } | string | null;
  commissionCurrencyId?: string | null;
}) {
  return {
    name: partner.name,
    phone: partner.phone ?? null,
    city: partner.city ?? null,
    country: partner.country ?? null,
    notes: partner.notes ?? null,
    isActive: partner.isActive,
    commissionEnabled: partner.commissionEnabled ?? false,
    commissionPerAmount:
      partner.commissionPerAmount == null
        ? null
        : String(partner.commissionPerAmount),
    commissionFeeAmount:
      partner.commissionFeeAmount == null
        ? null
        : String(partner.commissionFeeAmount),
    commissionCurrencyId: partner.commissionCurrencyId ?? null,
  };
}

function toMutationFailure(error: unknown): PartnerSarafiMutationActionResult {
  if (isPartnerSarafiError(error)) {
    return {
      ok: false,
      code: error.code === "UNKNOWN" ? "UNKNOWN" : error.code,
      message: error.message,
      fieldErrors: error.fieldErrors,
    };
  }

  return {
    ok: false,
    code: "UNKNOWN",
    message: "Unable to save partner sarafi. Please try again.",
  };
}

export async function createPartnerSarafiAction(
  input: CreatePartnerSarafiActionInput,
): Promise<PartnerSarafiMutationActionResult> {
  const user = await requirePermission("hawala.manage");

  try {
    const partner = await createPartnerSarafiRecord({
      name: input.name,
      phone: input.phone ?? "",
      city: input.city ?? "",
      country: input.country ?? "",
      notes: input.notes ?? "",
      isActive: input.isActive,
      commissionEnabled: input.commissionEnabled,
      commissionPerAmount: input.commissionPerAmount ?? "",
      commissionFeeAmount: input.commissionFeeAmount ?? "",
      commissionCurrencyCode: input.commissionCurrencyCode ?? "",
    });

    await auditAction({
      userId: user.id,
      action: AUDIT_ACTIONS.PARTNER_SARAFI_CREATE,
      module: AUDIT_MODULES.PARTNER_SARAFI,
      entityType: AUDIT_ENTITY_TYPES.PARTNER_SARAFI,
      entityId: partner.id,
      afterValues: toAuditValues(partner),
    });

    return {
      ok: true,
      message: `${partner.name} was added successfully.`,
      partnerId: partner.id,
    };
  } catch (error) {
    return toMutationFailure(error);
  }
}

export async function updatePartnerSarafiAction(
  input: UpdatePartnerSarafiActionInput,
): Promise<PartnerSarafiMutationActionResult> {
  const user = await requirePermission("hawala.manage");

  try {
    const before = await getPartnerSarafiForForm(input.id);
    const partner = await updatePartnerSarafiRecord(input.id, {
      name: input.name,
      phone: input.phone ?? "",
      city: input.city ?? "",
      country: input.country ?? "",
      notes: input.notes ?? "",
      isActive: input.isActive,
      commissionEnabled: input.commissionEnabled,
      commissionPerAmount: input.commissionPerAmount ?? "",
      commissionFeeAmount: input.commissionFeeAmount ?? "",
      commissionCurrencyCode: input.commissionCurrencyCode ?? "",
    });

    await auditAction({
      userId: user.id,
      action: AUDIT_ACTIONS.PARTNER_SARAFI_UPDATE,
      module: AUDIT_MODULES.PARTNER_SARAFI,
      entityType: AUDIT_ENTITY_TYPES.PARTNER_SARAFI,
      entityId: partner.id,
      beforeValues: toAuditValues(before),
      afterValues: toAuditValues(partner),
    });

    return {
      ok: true,
      message: `${partner.name} was updated successfully.`,
      partnerId: partner.id,
    };
  } catch (error) {
    return toMutationFailure(error);
  }
}

export async function setPartnerSarafiActiveAction(
  id: unknown,
  isActive: unknown,
): Promise<PartnerSarafiMutationActionResult> {
  const user = await requirePermission("hawala.manage");

  const parsed = parseSetActiveAction(id, isActive);
  if (!parsed) {
    return {
      ok: false,
      code: "VALIDATION",
      message: "Invalid activate/deactivate request.",
    };
  }

  try {
    const before = await getPartnerSarafiForForm(parsed.id);
    const partner = await setPartnerSarafiActiveRecord(
      parsed.id,
      parsed.isActive,
    );

    await auditAction({
      userId: user.id,
      action: AUDIT_ACTIONS.PARTNER_SARAFI_SET_ACTIVE,
      module: AUDIT_MODULES.PARTNER_SARAFI,
      entityType: AUDIT_ENTITY_TYPES.PARTNER_SARAFI,
      entityId: partner.id,
      beforeValues: toAuditValues(before),
      afterValues: toAuditValues(partner),
    });

    return {
      ok: true,
      message: parsed.isActive
        ? `${partner.name} was activated.`
        : `${partner.name} was deactivated.`,
      partnerId: partner.id,
    };
  } catch (error) {
    return toMutationFailure(error);
  }
}

export async function getPartnerSarafiForEditAction(
  id: unknown,
): Promise<GetPartnerSarafiForEditActionResult> {
  await requirePermission("hawala.manage");

  const partnerId = parseEntityId(id);
  if (!partnerId) {
    return {
      ok: false,
      code: "VALIDATION",
      message: "Partner sarafi id is required.",
    };
  }

  try {
    const partner = await getPartnerSarafiForForm(partnerId);
    return { ok: true, partner };
  } catch (error) {
    if (isPartnerSarafiError(error) && error.code === "NOT_FOUND") {
      return { ok: false, code: "NOT_FOUND", message: error.message };
    }

    return {
      ok: false,
      code: "UNKNOWN",
      message: "Unable to load partner sarafi. Please try again.",
    };
  }
}

export async function settlePartnerCommissionAction(input: {
  partnerSarafiId: string;
  kind: "PAY_PARTNER" | "COLLECT_FROM_PARTNER";
  currencyCode: string;
  amount: string;
  cashWalletId: string;
  notes?: string;
}): Promise<PartnerSarafiMutationActionResult> {
  const user = await requirePermission("hawala.manage");

  try {
    const { settlePartnerCommission } = await import(
      "@/features/partner-sarafi/services/settle-partner-commission"
    );
    const result = await settlePartnerCommission({
      ...input,
      createdById: user.id,
    });

    await auditAction({
      userId: user.id,
      action:
        input.kind === "PAY_PARTNER"
          ? AUDIT_ACTIONS.PARTNER_COMMISSION_PAY
          : AUDIT_ACTIONS.PARTNER_COMMISSION_COLLECT,
      module: AUDIT_MODULES.PARTNER_SARAFI,
      entityType: AUDIT_ENTITY_TYPES.PARTNER_SARAFI,
      entityId: result.partner.id,
      afterValues: {
        kind: input.kind,
        amount: input.amount,
        currencyCode: input.currencyCode,
        settlementId: result.settlement.id,
        transactionId: result.transaction.id,
      },
    });

    return {
      ok: true,
      message:
        input.kind === "PAY_PARTNER"
          ? `Paid ${input.amount} ${input.currencyCode} commission to ${result.partner.name}.`
          : `Collected ${input.amount} ${input.currencyCode} commission from ${result.partner.name}.`,
      partnerId: result.partner.id,
    };
  } catch (error) {
    return toMutationFailure(error);
  }
}
