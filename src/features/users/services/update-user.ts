import "server-only";

import { revokeUserSessions } from "@/features/auth/services/session";
import type { User } from "@/generated/prisma/client";
import { UserError } from "@/features/users/domain/errors";
import {
  toUserFormFieldErrors,
  updateUserSchema,
} from "@/features/users/schemas/user-form";
import {
  countActiveAdmins,
  findUserById,
  updateUser,
} from "@/features/users/repositories/user-repository";

export type UpdateUserResult = User;

export type UpdateUserRecordOptions = {
  /** Acting admin id — used to block self-demotion / self-deactivation. */
  actorUserId: string;
};

async function assertCanChangeAdminStatus(
  existing: User,
  nextRole: User["role"],
  nextIsActive: boolean,
): Promise<void> {
  const wasActiveAdmin = existing.role === "ADMIN" && existing.isActive;
  const willBeActiveAdmin = nextRole === "ADMIN" && nextIsActive;

  if (wasActiveAdmin && !willBeActiveAdmin) {
    const remaining = await countActiveAdmins({
      excludeUserId: existing.id,
    });

    if (remaining < 1) {
      throw new UserError(
        "LAST_ADMIN",
        "Cannot remove or deactivate the last active admin.",
        {
          role: "At least one active admin is required.",
          isActive: "At least one active admin is required.",
        },
      );
    }
  }
}

export async function updateUserRecord(
  id: string,
  input: unknown,
  options: UpdateUserRecordOptions,
): Promise<UpdateUserResult> {
  const existing = await findUserById(id);

  if (!existing) {
    throw new UserError("NOT_FOUND", "User not found.");
  }

  const parsed = updateUserSchema.safeParse(input);

  if (!parsed.success) {
    throw new UserError(
      "VALIDATION",
      "Please correct the highlighted fields.",
      toUserFormFieldErrors(parsed.error),
    );
  }

  const data = parsed.data;

  if (options.actorUserId === id) {
    if (data.role !== existing.role) {
      throw new UserError(
        "SELF_ACTION",
        "You cannot change your own role.",
        { role: "You cannot change your own role." },
      );
    }

    if (data.isActive !== existing.isActive) {
      throw new UserError(
        "SELF_ACTION",
        "You cannot activate or deactivate your own account.",
        { isActive: "You cannot change your own account status." },
      );
    }
  }

  await assertCanChangeAdminStatus(existing, data.role, data.isActive);

  // Username is immutable after create — never written here.
  const updated = await updateUser(id, {
    fullName: data.fullName,
    role: data.role,
    isActive: data.isActive,
  });

  if (existing.isActive && !updated.isActive) {
    await revokeUserSessions(id);
  }

  return updated;
}
