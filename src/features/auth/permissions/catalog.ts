import type { RolePermissionMap } from "@/features/auth/permissions/types";

/**
 * Planned role → permission mapping.
 * Not consulted by guards yet — reserved for future enforcement.
 */
export const rolePermissions = {
  "dashboard.view": ["ADMIN", "MANAGER", "CASHIER"],
  "customers.manage": ["ADMIN", "MANAGER", "CASHIER"],
  "wallets.manage": ["ADMIN", "MANAGER", "CASHIER"],
  "transactions.manage": ["ADMIN", "MANAGER", "CASHIER"],
  "hawala.manage": ["ADMIN", "MANAGER", "CASHIER"],
  "reports.view": ["ADMIN", "MANAGER"],
  "audit.view": ["ADMIN", "MANAGER"],
  "backup.manage": ["ADMIN"],
  "users.manage": ["ADMIN"],
  "settings.manage": ["ADMIN", "MANAGER"],
} as const satisfies RolePermissionMap;
