"use server";

import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  AUDIT_MODULES,
  auditAction,
} from "@/features/audit";
import { requirePermission } from "@/features/auth/permissions/authorize";
import { isWalletError } from "@/features/wallets/domain/errors";
import type { WalletFormData, WalletInput } from "@/features/wallets/domain/types";
import type { WalletFormFieldErrors } from "@/features/wallets/schemas/wallet-form";
import { archiveWalletRecord } from "@/features/wallets/services/archive-wallet";
import { createWalletRecord } from "@/features/wallets/services/create-wallet";
import { getWalletForForm } from "@/features/wallets/services/get-wallet";
import { updateWalletRecord } from "@/features/wallets/services/update-wallet";
import { parseEntityId } from "@/lib/action-schemas";

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
      code: "NOT_FOUND" | "VALIDATION" | "UNKNOWN";
      message: string;
    };

function toWalletAuditValues(wallet: {
  name: string;
  type: string;
  customerId?: string | null;
  isActive?: boolean;
  deletedAt?: Date | string | null;
}) {
  const values: Record<string, unknown> = {
    name: wallet.name,
    type: wallet.type,
    customerId: wallet.customerId ?? null,
  };

  if (wallet.isActive !== undefined) {
    values.isActive = wallet.isActive;
  }

  if (wallet.deletedAt !== undefined) {
    values.deletedAt =
      wallet.deletedAt instanceof Date
        ? wallet.deletedAt.toISOString()
        : wallet.deletedAt;
  }

  return values;
}

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
  const user = await requirePermission("wallets.manage");

  try {
    const wallet = await createWalletRecord({
      name: input.name,
      type: input.type,
      customerId: input.customerId,
    });

    await auditAction({
      userId: user.id,
      action: AUDIT_ACTIONS.WALLET_CREATE,
      module: AUDIT_MODULES.WALLETS,
      entityType: AUDIT_ENTITY_TYPES.WALLET,
      entityId: wallet.id,
      afterValues: toWalletAuditValues(wallet),
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
  const user = await requirePermission("wallets.manage");

  try {
    const before = await getWalletForForm(input.id);
    const wallet = await updateWalletRecord(input.id, {
      name: input.name,
      type: input.type,
      customerId: input.customerId,
    });

    await auditAction({
      userId: user.id,
      action: AUDIT_ACTIONS.WALLET_UPDATE,
      module: AUDIT_MODULES.WALLETS,
      entityType: AUDIT_ENTITY_TYPES.WALLET,
      entityId: wallet.id,
      beforeValues: toWalletAuditValues(before),
      afterValues: toWalletAuditValues(wallet),
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
  id: unknown,
): Promise<ArchiveWalletActionResult> {
  const user = await requirePermission("wallets.manage");

  const walletId = parseEntityId(id);
  if (!walletId) {
    return {
      ok: false,
      code: "VALIDATION",
      message: "Wallet id is required.",
    };
  }

  try {
    const wallet = await archiveWalletRecord(walletId);

    await auditAction({
      userId: user.id,
      action: AUDIT_ACTIONS.WALLET_ARCHIVE,
      module: AUDIT_MODULES.WALLETS,
      entityType: AUDIT_ENTITY_TYPES.WALLET,
      entityId: wallet.id,
      beforeValues: toWalletAuditValues({
        ...wallet,
        isActive: true,
        deletedAt: null,
      }),
      afterValues: toWalletAuditValues(wallet),
    });

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
      code: "NOT_FOUND" | "VALIDATION" | "UNKNOWN";
      message: string;
    };

export async function getWalletForEditAction(
  id: unknown,
): Promise<GetWalletForEditActionResult> {
  await requirePermission("wallets.manage");

  const walletId = parseEntityId(id);
  if (!walletId) {
    return {
      ok: false,
      code: "VALIDATION",
      message: "Wallet id is required.",
    };
  }

  try {
    const wallet = await getWalletForForm(walletId);
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
