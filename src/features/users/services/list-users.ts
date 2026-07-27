import "server-only";

import type { UserListItem } from "@/features/users/domain/types";
import { listUsers } from "@/features/users/repositories/user-repository";

export type GetUserListOptions = {
  isActive?: boolean;
};

function toUserListItem(
  user: Awaited<ReturnType<typeof listUsers>>[number],
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

export async function getUserList(
  options: GetUserListOptions = {},
): Promise<UserListItem[]> {
  const users = await listUsers({
    isActive: options.isActive,
  });

  return users.map(toUserListItem);
}
