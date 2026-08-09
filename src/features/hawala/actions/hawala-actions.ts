"use server";

import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  AUDIT_MODULES,
  auditAction,
} from "@/features/audit";
import { requirePermission } from "@/features/auth/permissions/authorize";
import {
  isHawalaError,
  type HawalaErrorCode,
  type HawalaField,
} from "@/features/hawala/domain/errors";
import type { HawalaPartyInput } from "@/features/hawala/domain/types";
import { cancelHawala } from "@/features/hawala/services/cancel-hawala";
import { receiveHawala } from "@/features/hawala/services/receive-hawala";
import { sendHawala } from "@/features/hawala/services/send-hawala";
import { archiveHawalaRecord } from "@/features/hawala/services/archive-hawala";
import { getHawalaForEdit } from "@/features/hawala/services/get-hawala-for-edit";
import { updateHawalaRecord } from "@/features/hawala/services/update-hawala";
import {
  archiveHawalaSchema,
  cancelHawalaSchema,
  toHawalaFieldErrors,
  updateHawalaSchema,
} from "@/features/hawala/schemas/hawala";

export type HawalaFieldErrors = Partial<Record<HawalaField, string>>;

export type HawalaMutationActionResult =
  | {
      ok: true;
      message: string;
      hawalaId: string;
      reference: string;
      status: "PENDING" | "COMPLETED" | "CANCELLED";
      transactionId: string | null;
    }
  | {
      ok: false;
      code: HawalaErrorCode | "UNKNOWN";
      message: string;
      fieldErrors?: HawalaFieldErrors;
    };

export type SendHawalaActionInput = HawalaPartyInput;
export type ReceiveHawalaActionInput = HawalaPartyInput;

export type CancelHawalaActionInput = {
  hawalaId: string;
};

export type SendHawalaActionResult = HawalaMutationActionResult;
export type ReceiveHawalaActionResult = HawalaMutationActionResult;
export type CancelHawalaActionResult = HawalaMutationActionResult;

function toMutationFailure(
  error: unknown,
  fallbackMessage: string,
): HawalaMutationActionResult {
  if (isHawalaError(error)) {
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
    message: fallbackMessage,
  };
}

function toHawalaAuditValues(
  hawala: {
    id: string;
    reference: string;
    direction: string;
    status: string;
    transactionId: string | null;
    amount: unknown;
    currencyId: string;
    partnerSarafi: string;
    senderName: string;
    receiverName: string;
  },
  input?: Pick<
    HawalaPartyInput,
    "currencyCode" | "amount" | "customerId" | "cashWalletId"
  >,
) {
  return {
    reference: hawala.reference,
    direction: hawala.direction,
    status: hawala.status,
    transactionId: hawala.transactionId,
    amount:
      input?.amount ??
      (typeof hawala.amount === "object" &&
      hawala.amount !== null &&
      "toString" in hawala.amount
        ? String(hawala.amount)
        : String(hawala.amount)),
    currencyCode: input?.currencyCode ?? null,
    currencyId: hawala.currencyId,
    partnerSarafi: hawala.partnerSarafi,
    senderName: hawala.senderName,
    receiverName: hawala.receiverName,
    customerId: input?.customerId ?? null,
    cashWalletId: input?.cashWalletId ?? null,
  };
}

export async function sendHawalaAction(
  input: SendHawalaActionInput,
): Promise<SendHawalaActionResult> {
  const user = await requirePermission("hawala.manage");

  try {
    const hawala = await sendHawala({
      ...input,
      createdById: user.id,
    });

    await auditAction({
      userId: user.id,
      action: AUDIT_ACTIONS.HAWALA_SEND,
      module: AUDIT_MODULES.HAWALA,
      entityType: AUDIT_ENTITY_TYPES.HAWALA,
      entityId: hawala.id,
      afterValues: toHawalaAuditValues(hawala, input),
    });

    return {
      ok: true,
      message: `Hawala send ${hawala.reference} was completed successfully.`,
      hawalaId: hawala.id,
      reference: hawala.reference,
      status: hawala.status,
      transactionId: hawala.transactionId,
    };
  } catch (error) {
    return toMutationFailure(
      error,
      "Unable to send hawala. Please try again.",
    );
  }
}

export async function receiveHawalaAction(
  input: ReceiveHawalaActionInput,
): Promise<ReceiveHawalaActionResult> {
  const user = await requirePermission("hawala.manage");

  try {
    const hawala = await receiveHawala({
      ...input,
      createdById: user.id,
    });

    await auditAction({
      userId: user.id,
      action: AUDIT_ACTIONS.HAWALA_RECEIVE,
      module: AUDIT_MODULES.HAWALA,
      entityType: AUDIT_ENTITY_TYPES.HAWALA,
      entityId: hawala.id,
      afterValues: toHawalaAuditValues(hawala, input),
    });

    return {
      ok: true,
      message: `Hawala receive ${hawala.reference} was completed successfully.`,
      hawalaId: hawala.id,
      reference: hawala.reference,
      status: hawala.status,
      transactionId: hawala.transactionId,
    };
  } catch (error) {
    return toMutationFailure(
      error,
      "Unable to receive hawala. Please try again.",
    );
  }
}

export async function cancelHawalaAction(
  input: unknown,
): Promise<CancelHawalaActionResult> {
  const user = await requirePermission("hawala.manage");

  const parsed = cancelHawalaSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: "VALIDATION",
      message: "Hawala transfer id is required.",
      fieldErrors: toHawalaFieldErrors(parsed.error),
    };
  }

  try {
    const hawala = await cancelHawala(parsed.data.hawalaId);

    await auditAction({
      userId: user.id,
      action: AUDIT_ACTIONS.HAWALA_CANCEL,
      module: AUDIT_MODULES.HAWALA,
      entityType: AUDIT_ENTITY_TYPES.HAWALA,
      entityId: hawala.id,
      beforeValues: {
        status: "PENDING",
      },
      afterValues: toHawalaAuditValues(hawala),
    });

    return {
      ok: true,
      message: `Hawala ${hawala.reference} was cancelled.`,
      hawalaId: hawala.id,
      reference: hawala.reference,
      status: hawala.status,
      transactionId: hawala.transactionId,
    };
  } catch (error) {
    return toMutationFailure(
      error,
      "Unable to cancel hawala. Please try again.",
    );
  }
}

export type UpdateHawalaActionResult = HawalaMutationActionResult;

export type GetHawalaForEditActionResult =
  | {
      ok: true;
      hawala: Awaited<ReturnType<typeof getHawalaForEdit>>;
    }
  | {
      ok: false;
      code: HawalaErrorCode | "UNKNOWN";
      message: string;
    };

export async function getHawalaForEditAction(
  id: unknown,
): Promise<GetHawalaForEditActionResult> {
  await requirePermission("hawala.manage");

  const hawalaId = typeof id === "string" ? id.trim() : "";
  if (!hawalaId) {
    return {
      ok: false,
      code: "VALIDATION",
      message: "Hawala transfer id is required.",
    };
  }

  try {
    const hawala = await getHawalaForEdit(hawalaId);
    return { ok: true, hawala };
  } catch (error) {
    if (isHawalaError(error)) {
      return {
        ok: false,
        code: error.code,
        message: error.message,
      };
    }

    return {
      ok: false,
      code: "UNKNOWN",
      message: "Unable to load hawala. Please try again.",
    };
  }
}

export async function updateHawalaAction(
  input: unknown,
): Promise<UpdateHawalaActionResult> {
  const user = await requirePermission("hawala.manage");

  const parsed = updateHawalaSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: "VALIDATION",
      message: "Please correct the highlighted fields.",
      fieldErrors: toHawalaFieldErrors(parsed.error),
    };
  }

  try {
    const hawala = await updateHawalaRecord(parsed.data, {
      createdById: user.id,
    });

    await auditAction({
      userId: user.id,
      action: AUDIT_ACTIONS.HAWALA_UPDATE,
      module: AUDIT_MODULES.HAWALA,
      entityType: AUDIT_ENTITY_TYPES.HAWALA,
      entityId: hawala.id,
      afterValues: toHawalaAuditValues(hawala),
    });

    return {
      ok: true,
      message: `Hawala ${hawala.reference} was updated.`,
      hawalaId: hawala.id,
      reference: hawala.reference,
      status: hawala.status,
      transactionId: hawala.transactionId,
    };
  } catch (error) {
    return toMutationFailure(
      error,
      "Unable to update hawala. Please try again.",
    );
  }
}

export type ArchiveHawalaActionResult =
  | {
      ok: true;
      message: string;
      hawalaId: string;
      reference: string;
    }
  | {
      ok: false;
      code: HawalaErrorCode | "UNKNOWN";
      message: string;
    };

export async function archiveHawalaAction(
  input: unknown,
): Promise<ArchiveHawalaActionResult> {
  const user = await requirePermission("hawala.manage");

  const parsed = archiveHawalaSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: "VALIDATION",
      message: "Hawala transfer id is required.",
    };
  }

  try {
    const hawala = await archiveHawalaRecord(parsed.data.hawalaId);

    await auditAction({
      userId: user.id,
      action: AUDIT_ACTIONS.HAWALA_ARCHIVE,
      module: AUDIT_MODULES.HAWALA,
      entityType: AUDIT_ENTITY_TYPES.HAWALA,
      entityId: hawala.id,
      afterValues: {
        reference: hawala.reference,
        deletedAt: hawala.deletedAt?.toISOString() ?? null,
      },
    });

    return {
      ok: true,
      message: `Hawala ${hawala.reference} was archived.`,
      hawalaId: hawala.id,
      reference: hawala.reference,
    };
  } catch (error) {
    if (isHawalaError(error)) {
      return {
        ok: false,
        code: error.code,
        message: error.message,
      };
    }

    return {
      ok: false,
      code: "UNKNOWN",
      message: "Unable to archive hawala. Please try again.",
    };
  }
}
