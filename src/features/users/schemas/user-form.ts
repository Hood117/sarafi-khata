import { z } from "zod";

import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
} from "@/features/auth/domain/password-policy";
import { USER_ROLES } from "@/features/users/domain/types";

const fullNameSchema = z
  .string()
  .trim()
  .min(1, { error: "Full name is required." })
  .max(120, { error: "Full name must be at most 120 characters." });

const usernameSchema = z
  .string()
  .trim()
  .transform((value) => value.toLowerCase())
  .pipe(
    z
      .string()
      .min(3, { error: "Username must be at least 3 characters." })
      .max(50, { error: "Username must be at most 50 characters." })
      .regex(/^[a-z0-9._-]+$/, {
        error:
          "Username may only use lowercase letters, numbers, dots, hyphens, and underscores.",
      }),
  );

const roleSchema = z.enum(USER_ROLES, {
  error: "Select a valid role.",
});

const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, {
    error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
  })
  .max(MAX_PASSWORD_LENGTH, {
    error: `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`,
  });

export const createUserSchema = z
  .object({
    fullName: fullNameSchema,
    username: usernameSchema,
    role: roleSchema,
    isActive: z.boolean(),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export const updateUserSchema = z.object({
  fullName: fullNameSchema,
  role: roleSchema,
  isActive: z.boolean(),
});

export const resetUserPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export type CreateUserSchemaOutput = z.output<typeof createUserSchema>;
export type UpdateUserSchemaOutput = z.output<typeof updateUserSchema>;
export type ResetUserPasswordSchemaOutput = z.output<
  typeof resetUserPasswordSchema
>;

export type UserFormFieldErrors = Partial<
  Record<
    | "fullName"
    | "username"
    | "password"
    | "confirmPassword"
    | "role"
    | "isActive",
    string
  >
>;

export function toUserFormFieldErrors(error: z.ZodError): UserFormFieldErrors {
  const fieldErrors: UserFormFieldErrors = {};

  for (const issue of error.issues) {
    const key = issue.path[0];
    if (
      typeof key === "string" &&
      (key === "fullName" ||
        key === "username" ||
        key === "password" ||
        key === "confirmPassword" ||
        key === "role" ||
        key === "isActive") &&
      !fieldErrors[key]
    ) {
      fieldErrors[key] = issue.message;
    }
  }

  return fieldErrors;
}
