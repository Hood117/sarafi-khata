import "server-only";

import { UserError } from "@/features/users/domain/errors";
import type { UserFormData, UserListItem } from "@/features/users/domain/types";
import { findUserById } from "@/features/users/repositories/user-repository";

function toListItem(
  user: NonNullable<Awaited<ReturnType<typeof findUserById>>>,
): UserListItem {
  return {
    id: user.id,
    fullName: user.fullName,
    username: user.username,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export async function getUserById(id: string): Promise<UserListItem> {
  const user = await findUserById(id);

  if (!user) {
    throw new UserError("NOT_FOUND", "User not found.");
  }

  return toListItem(user);
}

export async function getUserForForm(id: string): Promise<UserFormData> {
  const user = await findUserById(id);

  if (!user) {
    throw new UserError("NOT_FOUND", "User not found.");
  }

  return {
    id: user.id,
    fullName: user.fullName,
    username: user.username,
    role: user.role,
    isActive: user.isActive,
  };
}
