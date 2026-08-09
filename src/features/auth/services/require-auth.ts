import "server-only";

import { redirect } from "next/navigation";

import type { AuthenticatedUser } from "@/features/auth/domain/types";
import { getCurrentUser } from "@/features/auth/services/session";

export async function requireAuth(): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function requireGuest(): Promise<void> {
  const user = await getCurrentUser();

  if (user) {
    redirect("/");
  }
}
