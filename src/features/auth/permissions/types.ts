import type { Role } from "@/generated/prisma/client";

/**
 * Permission identifiers for role-based access control.
 */
export type Permission =
  | "dashboard.view"
  | "customers.manage"
  | "wallets.manage"
  | "transactions.manage"
  | "hawala.manage"
  | "reports.view"
  | "audit.view"
  | "backup.manage"
  | "users.manage"
  | "settings.manage";

export type RolePermissionMap = Record<Permission, readonly Role[]>;
