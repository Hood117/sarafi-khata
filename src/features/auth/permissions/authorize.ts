import "server-only";

import { forbidden } from "next/navigation";

import type { AuthenticatedUser } from "@/features/auth/domain/types";
import { hasPermission } from "@/features/auth/permissions/catalog";
import type { Permission } from "@/features/auth/permissions/types";
import { requireAuth } from "@/features/auth/services/require-auth";

/**
 * Authenticate the current user and enforce a catalog permission.
 * Unauthenticated users redirect to login; unauthorized roles trigger 403.
 */
export async function requirePermission(
  permission: Permission,
): Promise<AuthenticatedUser> {
  const user = await requireAuth();

  if (!hasPermission(user, permission)) {
    forbidden();
  }

  return user;
}
