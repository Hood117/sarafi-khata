"use server";

import { isAuthError } from "@/features/auth/domain/errors";
import type { AuthenticatedUser } from "@/features/auth/domain/types";
import { loginWithSession } from "@/features/auth/services/login-with-session";
import {
  destroySession,
  getCurrentUser,
} from "@/features/auth/services/session";

export type LoginActionResult =
  | { ok: true; user: AuthenticatedUser }
  | {
      ok: false;
      code: "INVALID_CREDENTIALS" | "INACTIVE_USER" | "UNKNOWN";
      message: string;
    };

export async function loginAction(
  username: string,
  password: string,
): Promise<LoginActionResult> {
  try {
    const user = await loginWithSession({ username, password });
    return { ok: true, user };
  } catch (error) {
    if (isAuthError(error)) {
      return {
        ok: false,
        code: error.code,
        message: error.message,
      };
    }

    return {
      ok: false,
      code: "UNKNOWN",
      message: "Unable to sign in. Please try again.",
    };
  }
}

export async function logoutAction(): Promise<void> {
  await destroySession();
}

export async function getCurrentUserAction(): Promise<AuthenticatedUser | null> {
  return getCurrentUser();
}
