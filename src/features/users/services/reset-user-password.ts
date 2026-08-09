import "server-only";

import { hashPassword } from "@/features/auth/services/password";
import { revokeUserSessions } from "@/features/auth/services/session";
import type { User } from "@/generated/prisma/client";
import { UserError } from "@/features/users/domain/errors";
import {
  resetUserPasswordSchema,
  toUserFormFieldErrors,
} from "@/features/users/schemas/user-form";
import {
  findUserById,
  updateUser,
} from "@/features/users/repositories/user-repository";

export type ResetUserPasswordResult = User;

export async function resetUserPasswordRecord(
  id: string,
  input: unknown,
): Promise<ResetUserPasswordResult> {
  const existing = await findUserById(id);

  if (!existing) {
    throw new UserError("NOT_FOUND", "User not found.");
  }

  const parsed = resetUserPasswordSchema.safeParse(input);

  if (!parsed.success) {
    throw new UserError(
      "VALIDATION",
      "Please correct the highlighted fields.",
      toUserFormFieldErrors(parsed.error),
    );
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const updated = await updateUser(id, { passwordHash });
  await revokeUserSessions(id);

  return updated;
}
