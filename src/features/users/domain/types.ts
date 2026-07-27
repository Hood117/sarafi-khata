import type { Role } from "@/generated/prisma/client";

export type UserListItem = {
  id: string;
  fullName: string;
  username: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type UserFormData = {
  id: string;
  fullName: string;
  username: string;
  role: Role;
  isActive: boolean;
};

export const USER_ROLES = ["ADMIN", "MANAGER", "CASHIER"] as const satisfies readonly Role[];

export type UserRoleOption = (typeof USER_ROLES)[number];
