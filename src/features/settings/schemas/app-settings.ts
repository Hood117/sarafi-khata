import { z } from "zod";

const currencyCodeSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(
    z
      .string()
      .min(3, { error: "Base currency is required." })
      .max(8, { error: "Base currency code is invalid." })
      .regex(/^[A-Z]{3,8}$/, {
        error: "Base currency code is invalid.",
      }),
  );

export const updateAppSettingsSchema = z.object({
  businessName: z
    .string()
    .trim()
    .min(1, { error: "Business name is required." })
    .max(100, { error: "Business name must be at most 100 characters." }),
  baseCurrencyCode: currencyCodeSchema,
  // Only English is wired today; other locales are UI placeholders.
  locale: z.enum(["en"], {
    error: "Selected language is not available yet.",
  }),
});

export type UpdateAppSettingsInput = z.infer<typeof updateAppSettingsSchema>;

export type AppSettingsFieldErrors = Partial<
  Record<"businessName" | "baseCurrencyCode" | "locale", string>
>;

export function toAppSettingsFieldErrors(
  error: z.ZodError,
): AppSettingsFieldErrors {
  const fieldErrors: AppSettingsFieldErrors = {};

  for (const issue of error.issues) {
    const key = issue.path[0];
    if (
      typeof key === "string" &&
      (key === "businessName" ||
        key === "baseCurrencyCode" ||
        key === "locale") &&
      !fieldErrors[key]
    ) {
      fieldErrors[key] = issue.message;
    }
  }

  return fieldErrors;
}
