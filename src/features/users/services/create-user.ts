import "server-only";

import { hashPassword } from "@/features/auth/services/password";
import type { User } from "@/generated/prisma/client";
import { UserError } from "@/features/users/domain/errors";
import {
  createUserSchema,
  toUserFormFieldErrors,
} from "@/features/users/schemas/user-form";
import {
  createUser,
  findUserByUsername,
} from "@/features/users/repositories/user-repository";
import { queueAutoBackup } from "@/features/backup/services/auto-backup";

export type CreateUserResult = User;

function isUniqueConstraintError(
  error: unknown,
): error is { code: string; meta?: { target?: string | string[] } } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

export async function createUserRecord(
  input: unknown,
): Promise<CreateUserResult> {
  const parsed = createUserSchema.safeParse(input);

  if (!parsed.success) {
    throw new UserError(
      "VALIDATION",
      "Please correct the highlighted fields.",
      toUserFormFieldErrors(parsed.error),
    );
  }

  const data = parsed.data;
  const existing = await findUserByUsername(data.username);

  if (existing) {
    throw new UserError(
      "DUPLICATE_USERNAME",
      "A user with this username already exists.",
      { username: "A user with this username already exists." },
    );
  }

  const passwordHash = await hashPassword(data.password);

  try {
    const user = await createUser({
      fullName: data.fullName,
      username: data.username,
      passwordHash,
      role: data.role,
      isActive: data.isActive,
      allowedScreens: data.allowedScreens,
    });
    queueAutoBackup("user-create");
    return user;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new UserError(
        "DUPLICATE_USERNAME",
        "A user with this username already exists.",
        { username: "A user with this username already exists." },
      );
    }

    throw error;
  }
}
