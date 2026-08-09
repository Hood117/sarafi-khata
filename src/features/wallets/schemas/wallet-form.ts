import { z } from "zod";

export const walletTypeSchema = z.enum(["VAULT", "TILL", "CUSTOMER", "SYSTEM"], {
  error: "Wallet type is required.",
});

export const walletFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, { error: "Wallet name is required." })
      .max(200, { error: "Wallet name must be at most 200 characters." }),
    type: walletTypeSchema,
    customerId: z.preprocess(
      (value) => {
        if (typeof value !== "string") {
          return null;
        }
        const trimmed = value.trim();
        return trimmed === "" ? null : trimmed;
      },
      z.string().nullable(),
    ),
  })
  .superRefine((data, context) => {
    if (data.type === "CUSTOMER") {
      if (!data.customerId) {
        context.addIssue({
          code: "custom",
          path: ["customerId"],
          message: "Customer is required for customer wallets.",
        });
      }
      return;
    }

    if (data.customerId) {
      context.addIssue({
        code: "custom",
        path: ["customerId"],
        message:
          "Vault, till, and system wallets cannot be linked to a customer.",
      });
    }
  })
  .transform((data) => ({
    name: data.name,
    type: data.type,
    customerId: data.type === "CUSTOMER" ? data.customerId : null,
  }));

export type WalletFormSchemaInput = z.input<typeof walletFormSchema>;
export type WalletFormSchemaOutput = z.output<typeof walletFormSchema>;

export type WalletFormFieldErrors = Partial<
  Record<"name" | "type" | "customerId", string>
>;

export function toWalletFormFieldErrors(
  error: z.ZodError,
): WalletFormFieldErrors {
  const fieldErrors: WalletFormFieldErrors = {};

  for (const issue of error.issues) {
    const key = issue.path[0];
    if (
      typeof key === "string" &&
      (key === "name" || key === "type" || key === "customerId") &&
      !fieldErrors[key]
    ) {
      fieldErrors[key] = issue.message;
    }
  }

  return fieldErrors;
}
