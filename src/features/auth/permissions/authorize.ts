import "server-only";

import type { AuthenticatedUser } from "@/features/auth/domain/types";
import type { Permission } from "@/features/auth/permissions/types";
import { requireAuth } from "@/features/auth/services/require-auth";

/**
 * Future permission gate.
 * Authenticates the user today; role permission rules are not enforced yet.
 */
export async function requirePermission(
  permission: Permission,
): Promise<AuthenticatedUser> {
  // Permission catalog is prepared; enforcement will use `permission` later.
  void permission;
  return requireAuth();
}
