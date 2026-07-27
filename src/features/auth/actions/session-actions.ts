"use server";

import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  AUDIT_MODULES,
  auditAction,
} from "@/features/audit";
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

    await auditAction({
      userId: user.id,
      action: AUDIT_ACTIONS.LOGIN_SUCCESS,
      module: AUDIT_MODULES.AUTH,
      entityType: AUDIT_ENTITY_TYPES.USER,
      entityId: user.id,
      afterValues: {
        username: user.username,
        role: user.role,
      },
    });

    return { ok: true, user };
  } catch (error) {
    const code = isAuthError(error) ? error.code : "UNKNOWN";

    await auditAction({
      userId: null,
      action: AUDIT_ACTIONS.LOGIN_FAILURE,
      module: AUDIT_MODULES.AUTH,
      entityType: AUDIT_ENTITY_TYPES.USER,
      afterValues: {
        username: typeof username === "string" ? username.trim() : null,
        code,
      },
    });

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
  const user = await getCurrentUser();
  await destroySession();

  await auditAction({
    userId: user?.id ?? null,
    action: AUDIT_ACTIONS.LOGOUT,
    module: AUDIT_MODULES.AUTH,
    entityType: user ? AUDIT_ENTITY_TYPES.USER : null,
    entityId: user?.id ?? null,
    afterValues: user
      ? {
          username: user.username,
          role: user.role,
        }
      : null,
  });
}

export async function getCurrentUserAction(): Promise<AuthenticatedUser | null> {
  return getCurrentUser();
}
