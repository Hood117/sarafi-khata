import type { Role } from "@/generated/prisma/client";

import type {
  Permission,
  RolePermissionMap,
} from "@/features/auth/permissions/types";

/**
 * Role → permission mapping for Admin, Manager, and Cashier.
 */
export const rolePermissions = {
  "dashboard.view": ["ADMIN", "MANAGER", "CASHIER"],
  "customers.manage": ["ADMIN", "MANAGER", "CASHIER"],
  // Wallet admin UI lives under Settings — not a cashier desk workflow.
  "wallets.manage": ["ADMIN", "MANAGER"],
  "transactions.manage": ["ADMIN", "MANAGER", "CASHIER"],
  "hawala.manage": ["ADMIN", "MANAGER", "CASHIER"],
  "reports.view": ["ADMIN", "MANAGER"],
  "audit.view": ["ADMIN", "MANAGER"],
  "backup.manage": ["ADMIN"],
  "users.manage": ["ADMIN"],
  "settings.manage": ["ADMIN", "MANAGER"],
} as const satisfies RolePermissionMap;

export function hasPermission(
  role: Role,
  permission: Permission,
): boolean {
  const allowed: readonly Role[] = rolePermissions[permission];
  return allowed.includes(role);
}
