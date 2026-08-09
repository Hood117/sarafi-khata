import type { Role } from "@/generated/prisma/client";

import type { AppScreenId } from "@/features/auth/permissions/screens";
import { defaultScreensForRole } from "@/features/auth/permissions/catalog";

export type UserListItem = {
  id: string;
  fullName: string;
  username: string;
  role: Role;
  isActive: boolean;
  allowedScreens: AppScreenId[] | null;
  createdAt: string;
  updatedAt: string;
};

export type UserFormData = {
  id: string;
  fullName: string;
  username: string;
  role: Role;
  isActive: boolean;
  allowedScreens: AppScreenId[];
};

export const USER_ROLES = ["ADMIN", "MANAGER", "CASHIER"] as const satisfies readonly Role[];

export type UserRoleOption = (typeof USER_ROLES)[number];

export function screensForRolePreset(role: Role): AppScreenId[] {
  return defaultScreensForRole(role);
}
