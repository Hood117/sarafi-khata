import { z } from "zod";

function optionalText(maxLength = 500) {
  return z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : ""),
    z
      .string()
      .max(maxLength, { error: `Must be at most ${maxLength} characters.` })
      .transform((value) => (value === "" ? null : value)),
  );
}

export const createCustomerSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, { error: "Name is required." })
    .max(200, { error: "Name must be at most 200 characters." }),
  phone: z
    .string()
    .trim()
    .min(1, { error: "Phone is required." })
    .max(50, { error: "Phone must be at most 50 characters." }),
  address: optionalText(500),
  nationalId: optionalText(100),
  notes: optionalText(2000),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export type CreateCustomerFieldErrors = Partial<
  Record<keyof CreateCustomerInput, string>
>;

export function toCreateCustomerFieldErrors(
  error: z.ZodError,
): CreateCustomerFieldErrors {
  const fieldErrors: CreateCustomerFieldErrors = {};

  for (const issue of error.issues) {
    const key = issue.path[0];
    if (
      typeof key === "string" &&
      (key === "fullName" ||
        key === "phone" ||
        key === "address" ||
        key === "nationalId" ||
        key === "notes") &&
      !fieldErrors[key]
    ) {
      fieldErrors[key] = issue.message;
    }
  }

  return fieldErrors;
}
