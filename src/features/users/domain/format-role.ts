import type { Role } from "@/generated/prisma/client";

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  CASHIER: "Cashier",
};

export function formatRole(role: Role): string {
  return ROLE_LABELS[role] ?? role;
}
