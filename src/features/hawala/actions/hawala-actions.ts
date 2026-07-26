"use server";

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

export async function sendHawalaAction(
  input: SendHawalaActionInput,
): Promise<SendHawalaActionResult> {
  const user = await requirePermission("hawala.manage");

  try {
    const hawala = await sendHawala({
      ...input,
      createdById: user.id,
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
  input: CancelHawalaActionInput,
): Promise<CancelHawalaActionResult> {
  await requirePermission("hawala.manage");

  const hawalaId = input.hawalaId?.trim() ?? "";
  if (!hawalaId) {
    return {
      ok: false,
      code: "VALIDATION",
      message: "Hawala transfer id is required.",
      fieldErrors: { id: "Hawala transfer id is required." },
    };
  }

  try {
    const hawala = await cancelHawala(hawalaId);

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
