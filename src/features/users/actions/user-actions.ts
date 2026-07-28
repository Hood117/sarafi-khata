"use server";

import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  AUDIT_MODULES,
  auditAction,
  toUserAuditValues,
} from "@/features/audit";
import { requirePermission } from "@/features/auth/permissions/authorize";
import { isUserError } from "@/features/users/domain/errors";
import type { UserFormData } from "@/features/users/domain/types";
import type { UserFormFieldErrors } from "@/features/users/schemas/user-form";
import { createUserRecord } from "@/features/users/services/create-user";
import { getUserForForm } from "@/features/users/services/get-user";
import { resetUserPasswordRecord } from "@/features/users/services/reset-user-password";
import { setUserActiveRecord } from "@/features/users/services/set-user-active";
import { updateUserRecord } from "@/features/users/services/update-user";
import { parseEntityId, parseSetActiveAction } from "@/lib/action-schemas";

export type UserFieldErrors = UserFormFieldErrors;

export type UserMutationActionResult =
  | {
      ok: true;
      message: string;
      userId: string;
    }
  | {
      ok: false;
      code:
        | "VALIDATION"
        | "DUPLICATE_USERNAME"
        | "NOT_FOUND"
        | "SELF_ACTION"
        | "LAST_ADMIN"
        | "UNKNOWN";
      message: string;
      fieldErrors?: UserFieldErrors;
    };

export type CreateUserActionResult = UserMutationActionResult;
export type UpdateUserActionResult = UserMutationActionResult;
export type SetUserActiveActionResult = UserMutationActionResult;
export type ResetUserPasswordActionResult = UserMutationActionResult;

export type CreateUserActionInput = {
  fullName: string;
  username: string;
  password: string;
  confirmPassword: string;
  role: "ADMIN" | "MANAGER" | "CASHIER";
  isActive: boolean;
};

export type UpdateUserActionInput = {
  id: string;
  fullName: string;
  role: "ADMIN" | "MANAGER" | "CASHIER";
  isActive: boolean;
};

export type ResetUserPasswordActionInput = {
  id: string;
  password: string;
  confirmPassword: string;
};

export type GetUserForEditActionResult =
  | { ok: true; user: UserFormData }
  | {
      ok: false;
      code: "NOT_FOUND" | "VALIDATION" | "UNKNOWN";
      message: string;
    };

function toMutationFailure(error: unknown): UserMutationActionResult {
  if (isUserError(error)) {
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
    message: "Unable to save user. Please try again.",
  };
}

export async function createUserAction(
  input: CreateUserActionInput,
): Promise<CreateUserActionResult> {
  const actor = await requirePermission("users.manage");

  try {
    const user = await createUserRecord({
      fullName: input.fullName,
      username: input.username,
      password: input.password,
      confirmPassword: input.confirmPassword,
      role: input.role,
      isActive: input.isActive,
    });

    await auditAction({
      userId: actor.id,
      action: AUDIT_ACTIONS.USER_CREATE,
      module: AUDIT_MODULES.USERS,
      entityType: AUDIT_ENTITY_TYPES.USER,
      entityId: user.id,
      afterValues: toUserAuditValues(user),
    });

    return {
      ok: true,
      message: `${user.fullName} was added successfully.`,
      userId: user.id,
    };
  } catch (error) {
    const failure = toMutationFailure(error);
    if (!failure.ok && failure.code === "UNKNOWN") {
      return {
        ...failure,
        message: "Unable to add user. Please try again.",
      };
    }
    return failure;
  }
}

export async function updateUserAction(
  input: UpdateUserActionInput,
): Promise<UpdateUserActionResult> {
  const actor = await requirePermission("users.manage");

  try {
    const before = await getUserForForm(input.id);
    const user = await updateUserRecord(
      input.id,
      {
        fullName: input.fullName,
        role: input.role,
        isActive: input.isActive,
      },
      { actorUserId: actor.id },
    );

    await auditAction({
      userId: actor.id,
      action: AUDIT_ACTIONS.USER_UPDATE,
      module: AUDIT_MODULES.USERS,
      entityType: AUDIT_ENTITY_TYPES.USER,
      entityId: user.id,
      beforeValues: toUserAuditValues(before),
      afterValues: toUserAuditValues(user),
    });

    return {
      ok: true,
      message: `${user.fullName} was updated successfully.`,
      userId: user.id,
    };
  } catch (error) {
    const failure = toMutationFailure(error);
    if (!failure.ok && failure.code === "UNKNOWN") {
      return {
        ...failure,
        message: "Unable to update user. Please try again.",
      };
    }
    return failure;
  }
}

export async function setUserActiveAction(
  id: unknown,
  isActive: unknown,
): Promise<SetUserActiveActionResult> {
  const actor = await requirePermission("users.manage");

  const parsed = parseSetActiveAction(id, isActive);
  if (!parsed) {
    return {
      ok: false,
      code: "VALIDATION",
      message: "Invalid activate/deactivate request.",
    };
  }

  try {
    const before = await getUserForForm(parsed.id);
    const user = await setUserActiveRecord(parsed.id, parsed.isActive, {
      actorUserId: actor.id,
    });

    await auditAction({
      userId: actor.id,
      action: AUDIT_ACTIONS.USER_SET_ACTIVE,
      module: AUDIT_MODULES.USERS,
      entityType: AUDIT_ENTITY_TYPES.USER,
      entityId: user.id,
      beforeValues: toUserAuditValues(before),
      afterValues: toUserAuditValues(user),
    });

    return {
      ok: true,
      message: parsed.isActive
        ? `${user.fullName} was activated.`
        : `${user.fullName} was deactivated.`,
      userId: user.id,
    };
  } catch (error) {
    const failure = toMutationFailure(error);
    if (!failure.ok && failure.code === "UNKNOWN") {
      return {
        ...failure,
        message: parsed.isActive
          ? "Unable to activate user. Please try again."
          : "Unable to deactivate user. Please try again.",
      };
    }
    return failure;
  }
}

export async function resetUserPasswordAction(
  input: ResetUserPasswordActionInput,
): Promise<ResetUserPasswordActionResult> {
  const actor = await requirePermission("users.manage");

  try {
    const before = await getUserForForm(input.id);
    const user = await resetUserPasswordRecord(input.id, {
      password: input.password,
      confirmPassword: input.confirmPassword,
    });

    await auditAction({
      userId: actor.id,
      action: AUDIT_ACTIONS.USER_RESET_PASSWORD,
      module: AUDIT_MODULES.USERS,
      entityType: AUDIT_ENTITY_TYPES.USER,
      entityId: user.id,
      beforeValues: { username: before.username },
      afterValues: { username: user.username, passwordReset: true },
    });

    return {
      ok: true,
      message: `Password for ${user.username} was reset.`,
      userId: user.id,
    };
  } catch (error) {
    const failure = toMutationFailure(error);
    if (!failure.ok && failure.code === "UNKNOWN") {
      return {
        ...failure,
        message: "Unable to reset password. Please try again.",
      };
    }
    return failure;
  }
}

export async function getUserForEditAction(
  id: unknown,
): Promise<GetUserForEditActionResult> {
  await requirePermission("users.manage");

  const userId = parseEntityId(id);
  if (!userId) {
    return {
      ok: false,
      code: "VALIDATION",
      message: "User id is required.",
    };
  }

  try {
    const user = await getUserForForm(userId);
    return { ok: true, user };
  } catch (error) {
    if (isUserError(error) && error.code === "NOT_FOUND") {
      return {
        ok: false,
        code: "NOT_FOUND",
        message: error.message,
      };
    }

    return {
      ok: false,
      code: "UNKNOWN",
      message: "Unable to load user. Please try again.",
    };
  }
}
