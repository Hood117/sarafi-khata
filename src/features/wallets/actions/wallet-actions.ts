"use server";

import { requirePermission } from "@/features/auth/permissions/authorize";
import { isWalletError } from "@/features/wallets/domain/errors";
import type { WalletFormData, WalletInput } from "@/features/wallets/domain/types";
import type { WalletFormFieldErrors } from "@/features/wallets/schemas/wallet-form";
import { archiveWalletRecord } from "@/features/wallets/services/archive-wallet";
import { createWalletRecord } from "@/features/wallets/services/create-wallet";
import { getWalletForForm } from "@/features/wallets/services/get-wallet";
import { updateWalletRecord } from "@/features/wallets/services/update-wallet";

export type WalletFieldErrors = WalletFormFieldErrors;
export type WalletMutationActionResult =
  | {
      ok: true;
      message: string;
      walletId: string;
    }
  | {
      ok: false;
      code: "VALIDATION" | "NOT_FOUND" | "UNKNOWN";
      message: string;
      fieldErrors?: WalletFieldErrors;
    };

export type CreateWalletActionResult = WalletMutationActionResult;
export type UpdateWalletActionResult = WalletMutationActionResult;

export type CreateWalletActionInput = WalletInput;

export type UpdateWalletActionInput = WalletInput & {
  id: string;
};

export type ArchiveWalletActionResult =
  | {
      ok: true;
      message: string;
      walletId: string;
    }
  | {
      ok: false;
      code: "NOT_FOUND" | "UNKNOWN";
      message: string;
    };

function toMutationFailure(error: unknown): WalletMutationActionResult {
  if (isWalletError(error)) {
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
    message: "Unable to save wallet. Please try again.",
  };
}

export async function createWalletAction(
  input: CreateWalletActionInput,
): Promise<CreateWalletActionResult> {
  await requirePermission("wallets.manage");

  try {
    const wallet = await createWalletRecord({
      name: input.name,
      type: input.type,
      customerId: input.customerId,
    });

    return {
      ok: true,
      message: `${wallet.name} was added successfully.`,
      walletId: wallet.id,
    };
  } catch (error) {
    const failure = toMutationFailure(error);
    if (!failure.ok && failure.code === "UNKNOWN") {
      return {
        ...failure,
        message: "Unable to add wallet. Please try again.",
      };
    }
    return failure;
  }
}

export async function updateWalletAction(
  input: UpdateWalletActionInput,
): Promise<UpdateWalletActionResult> {
  await requirePermission("wallets.manage");

  try {
    const wallet = await updateWalletRecord(input.id, {
      name: input.name,
      type: input.type,
      customerId: input.customerId,
    });

    return {
      ok: true,
      message: `${wallet.name} was updated successfully.`,
      walletId: wallet.id,
    };
  } catch (error) {
    const failure = toMutationFailure(error);
    if (!failure.ok && failure.code === "UNKNOWN") {
      return {
        ...failure,
        message: "Unable to update wallet. Please try again.",
      };
    }
    return failure;
  }
}

export async function archiveWalletAction(
  id: string,
): Promise<ArchiveWalletActionResult> {
  await requirePermission("wallets.manage");

  try {
    const wallet = await archiveWalletRecord(id);

    return {
      ok: true,
      message: `${wallet.name} was archived.`,
      walletId: wallet.id,
    };
  } catch (error) {
    if (isWalletError(error) && error.code === "NOT_FOUND") {
      return {
        ok: false,
        code: "NOT_FOUND",
        message: error.message,
      };
    }

    return {
      ok: false,
      code: "UNKNOWN",
      message: "Unable to archive wallet. Please try again.",
    };
  }
}

export type GetWalletForEditActionResult =
  | { ok: true; wallet: WalletFormData }
  | {
      ok: false;
      code: "NOT_FOUND" | "UNKNOWN";
      message: string;
    };

export async function getWalletForEditAction(
  id: string,
): Promise<GetWalletForEditActionResult> {
  await requirePermission("wallets.manage");

  try {
    const wallet = await getWalletForForm(id);
    return { ok: true, wallet };
  } catch (error) {
    if (isWalletError(error) && error.code === "NOT_FOUND") {
      return {
        ok: false,
        code: "NOT_FOUND",
        message: error.message,
      };
    }

    return {
      ok: false,
      code: "UNKNOWN",
      message: "Unable to load wallet. Please try again.",
    };
  }
}
