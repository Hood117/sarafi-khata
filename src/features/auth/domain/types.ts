import type { Role } from "@/generated/prisma/client";

import type { AppScreenId } from "@/features/auth/permissions/screens";

export type AuthenticatedUser = {
  id: string;
  fullName: string;
  username: string;
  role: Role;
  isActive: boolean;
  /** Explicit screen grants. Null means role defaults. */
  allowedScreens: AppScreenId[] | null;
};
