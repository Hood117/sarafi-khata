import { z } from "zod";

const MAX_PASSWORD_LENGTH = 128;

export const loginSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, { error: "Username is required." })
    .max(100, { error: "Username must be at most 100 characters." }),
  password: z
    .string()
    .min(1, { error: "Password is required." })
    .max(MAX_PASSWORD_LENGTH, {
      error: "Password must be at most 128 characters.",
    }),
});

export type LoginInput = z.infer<typeof loginSchema>;

export type LoginFieldErrors = Partial<Record<keyof LoginInput, string>>;

export function toLoginFieldErrors(error: z.ZodError): LoginFieldErrors {
  const fieldErrors: LoginFieldErrors = {};

  for (const issue of error.issues) {
    const key = issue.path[0];
    if (
      (key === "username" || key === "password") &&
      !fieldErrors[key]
    ) {
      fieldErrors[key] = issue.message;
    }
  }

  return fieldErrors;
}
