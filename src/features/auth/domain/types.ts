import type { Role } from "@/generated/prisma/client";

export type AuthenticatedUser = {
  id: string;
  fullName: string;
  username: string;
  role: Role;
  isActive: boolean;
};
