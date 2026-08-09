"use server";

import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  AUDIT_MODULES,
  auditAction,
} from "@/features/audit";
import { isAuthError } from "@/features/auth/domain/errors";
import type { AuthenticatedUser } from "@/features/auth/domain/types";
import {
  loginSchema,
  toLoginFieldErrors,
} from "@/features/auth/schemas/login";
import { loginWithSession } from "@/features/auth/services/login-with-session";
import {
  destroySession,
  getCurrentUser,
} from "@/features/auth/services/session";

export type LoginActionResult =
  | { ok: true; user: AuthenticatedUser }
  | {
      ok: false;
      code: "INVALID_CREDENTIALS" | "VALIDATION" | "UNKNOWN";
      message: string;
      fieldErrors?: Partial<Record<"username" | "password", string>>;
    };

export async function loginAction(
  input: unknown,
): Promise<LoginActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: "VALIDATION",
      message: "Please correct the highlighted fields.",
      fieldErrors: toLoginFieldErrors(parsed.error),
    };
  }

  const { username, password } = parsed.data;

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
        username: username.trim(),
        code,
      },
    });

    if (isAuthError(error)) {
      // Never reveal inactive vs invalid credentials to the client.
      return {
        ok: false,
        code: "INVALID_CREDENTIALS",
        message: "Invalid username or password.",
      };
    }

    return {
      ok: false,
      code: "UNKNOWN",
      message: "Unable to sign in. Please try again.",
    };
  }
}

export type LogoutActionResult =
  | { ok: true }
  | { ok: false; message: string };

export async function logoutAction(): Promise<LogoutActionResult> {
  let user: AuthenticatedUser | null = null;

  try {
    user = await getCurrentUser();
  } catch {
    // Session lookup can fail if the DB is unavailable — still clear the cookie.
  }

  try {
    await destroySession();
  } catch {
    return {
      ok: false,
      message: "Unable to sign out. Please try again.",
    };
  }

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

  return { ok: true };
}

export async function getCurrentUserAction(): Promise<AuthenticatedUser | null> {
  return getCurrentUser();
}
