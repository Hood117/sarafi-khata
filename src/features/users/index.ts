/**
 * Public API for the users feature.
 * Import from this module only — do not reach into internal folders.
 */

export {
  UserError,
  isUserError,
  type UserErrorCode,
  type UserField,
} from "@/features/users/domain/errors";

export { formatRole } from "@/features/users/domain/format-role";

export type {
  UserFormData,
  UserListItem,
  UserRoleOption,
} from "@/features/users/domain/types";
export { USER_ROLES } from "@/features/users/domain/types";

export {
  createUserSchema,
  updateUserSchema,
  resetUserPasswordSchema,
  toUserFormFieldErrors,
  type CreateUserSchemaOutput,
  type UpdateUserSchemaOutput,
  type ResetUserPasswordSchemaOutput,
  type UserFormFieldErrors,
} from "@/features/users/schemas/user-form";

export {
  getUserList,
  type GetUserListOptions,
} from "@/features/users/services/list-users";
export { getUserById, getUserForForm } from "@/features/users/services/get-user";
export { createUserRecord } from "@/features/users/services/create-user";
export { updateUserRecord } from "@/features/users/services/update-user";
export { setUserActiveRecord } from "@/features/users/services/set-user-active";
export { resetUserPasswordRecord } from "@/features/users/services/reset-user-password";

export {
  createUserAction,
  updateUserAction,
  setUserActiveAction,
  resetUserPasswordAction,
  getUserForEditAction,
  type CreateUserActionInput,
  type CreateUserActionResult,
  type UpdateUserActionInput,
  type UpdateUserActionResult,
  type SetUserActiveActionResult,
  type ResetUserPasswordActionInput,
  type ResetUserPasswordActionResult,
  type GetUserForEditActionResult,
  type UserMutationActionResult,
  type UserFieldErrors,
} from "@/features/users/actions/user-actions";

export { UsersView } from "@/features/users/components/users-view";
export { UsersTable } from "@/features/users/components/users-table";
export { UsersTableSkeleton } from "@/features/users/components/users-table-skeleton";
export { UsersEmptyState } from "@/features/users/components/users-empty-state";
export { UsersPageHeader } from "@/features/users/components/users-page-header";
export { AddUserDialog } from "@/features/users/components/add-user-dialog";
export { EditUserDialog } from "@/features/users/components/edit-user-dialog";
export { ResetPasswordDialog } from "@/features/users/components/reset-password-dialog";
export { SetUserActiveButton } from "@/features/users/components/set-user-active-button";
export {
  UserForm,
  emptyUserFormValues,
  type UserFormValues,
} from "@/features/users/components/user-form";
export {
  ResetPasswordForm,
  emptyResetPasswordFormValues,
  type ResetPasswordFormValues,
} from "@/features/users/components/reset-password-form";
