/**
 * Public API for the auth feature.
 * Import from this module only — do not reach into internal folders.
 */

export { LoginForm } from "@/features/auth/components/login-form";
export { AuthError, isAuthError } from "@/features/auth/domain/errors";
export type { AuthenticatedUser } from "@/features/auth/domain/types";
export {
  authenticateUser,
  type AuthenticateUserInput,
} from "@/features/auth/services/authenticate-user";
export {
  createSession,
  destroySession,
  getCurrentUser,
} from "@/features/auth/services/session";
export { loginWithSession } from "@/features/auth/services/login-with-session";
export {
  requireAuth,
  requireGuest,
} from "@/features/auth/services/require-auth";
export { requirePermission } from "@/features/auth/permissions/authorize";
export { rolePermissions } from "@/features/auth/permissions/catalog";
export type {
  Permission,
  RolePermissionMap,
} from "@/features/auth/permissions/types";
export {
  getCurrentUserAction,
  loginAction,
  logoutAction,
  type LoginActionResult,
} from "@/features/auth/actions/session-actions";
