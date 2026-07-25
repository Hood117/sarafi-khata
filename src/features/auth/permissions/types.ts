import type { Role } from "@/generated/prisma/client";

/**
 * Permission identifiers for future role-based access control.
 * Rules are not enforced yet — this catalog prepares the structure only.
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
