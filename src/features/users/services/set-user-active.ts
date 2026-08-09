import "server-only";

import { revokeUserSessions } from "@/features/auth/services/session";
import type { User } from "@/generated/prisma/client";
import { UserError } from "@/features/users/domain/errors";
import {
  countActiveAdmins,
  findUserById,
  updateUser,
} from "@/features/users/repositories/user-repository";

export type SetUserActiveResult = User;

export type SetUserActiveOptions = {
  actorUserId: string;
};

export async function setUserActiveRecord(
  id: string,
  isActive: boolean,
  options: SetUserActiveOptions,
): Promise<SetUserActiveResult> {
  const existing = await findUserById(id);

  if (!existing) {
    throw new UserError("NOT_FOUND", "User not found.");
  }

  if (existing.isActive === isActive) {
    return existing;
  }

  if (options.actorUserId === id) {
    throw new UserError(
      "SELF_ACTION",
      "You cannot activate or deactivate your own account.",
    );
  }

  if (!isActive && existing.role === "ADMIN" && existing.isActive) {
    const remaining = await countActiveAdmins({ excludeUserId: id });
    if (remaining < 1) {
      throw new UserError(
        "LAST_ADMIN",
        "Cannot deactivate the last active admin.",
      );
    }
  }

  const updated = await updateUser(id, { isActive });

  if (!isActive) {
    await revokeUserSessions(id);
  }

  return updated;
}
