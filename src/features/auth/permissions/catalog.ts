import type { Role } from "@/generated/prisma/client";

import type { AuthenticatedUser } from "@/features/auth/domain/types";
import {
  APP_SCREENS,
  parseAllowedScreens,
  screenIdsForPermission,
  type AppScreenId,
} from "@/features/auth/permissions/screens";
import type {
  Permission,
  RolePermissionMap,
} from "@/features/auth/permissions/types";

/**
 * Role → permission mapping for Admin, Manager, and Cashier.
 * Used as defaults when a user has no explicit screen grants.
 */
export const rolePermissions = {
  "dashboard.view": ["ADMIN", "MANAGER", "CASHIER"],
  "customers.manage": ["ADMIN", "MANAGER", "CASHIER"],
  "wallets.manage": ["ADMIN", "MANAGER"],
  "transactions.manage": ["ADMIN", "MANAGER", "CASHIER"],
  "hawala.manage": ["ADMIN", "MANAGER", "CASHIER"],
  "reports.view": ["ADMIN", "MANAGER"],
  "audit.view": ["ADMIN", "MANAGER"],
  "backup.manage": ["ADMIN"],
  "users.manage": ["ADMIN"],
  "settings.manage": ["ADMIN", "MANAGER"],
} as const satisfies RolePermissionMap;

export function hasRolePermission(
  role: Role,
  permission: Permission,
): boolean {
  const allowed: readonly Role[] = rolePermissions[permission];
  return allowed.includes(role);
}

export function defaultScreensForRole(role: Role): AppScreenId[] {
  return APP_SCREENS.filter((screen) =>
    hasRolePermission(role, screen.permission),
  ).map((screen) => screen.id);
}

export function resolveUserScreens(user: {
  role: Role;
  allowedScreens?: unknown;
}): AppScreenId[] {
  const explicit = parseAllowedScreens(user.allowedScreens ?? null);
  if (explicit !== null) {
    return explicit;
  }
  return defaultScreensForRole(user.role);
}

export function hasScreenAccess(
  user: Pick<AuthenticatedUser, "role" | "allowedScreens">,
  screenId: AppScreenId,
): boolean {
  return resolveUserScreens(user).includes(screenId);
}

/**
 * Permission check for the authenticated user.
 * Explicit screen grants win; otherwise role defaults apply.
 */
export function hasPermission(
  user: Pick<AuthenticatedUser, "role" | "allowedScreens"> | Role,
  permission: Permission,
): boolean {
  // Legacy callers may still pass a Role alone.
  if (typeof user === "string") {
    return hasRolePermission(user, permission);
  }

  const screens = resolveUserScreens(user);
  const needed = screenIdsForPermission(permission);
  return needed.some((screenId) => screens.includes(screenId));
}
