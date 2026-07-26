import { z } from "zod";

function requiredText(label: string, maxLength = 200) {
  return z
    .string()
    .trim()
    .min(1, { error: `${label} is required.` })
    .max(maxLength, {
      error: `${label} must be at most ${maxLength} characters.`,
    });
}

function optionalText(maxLength = 2000) {
  return z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : ""),
    z
      .string()
      .max(maxLength, { error: `Must be at most ${maxLength} characters.` })
      .transform((value) => (value === "" ? null : value)),
  );
}

function optionalPhone() {
  return z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : ""),
    z
      .string()
      .max(40, { error: "Phone must be at most 40 characters." })
      .transform((value) => (value === "" ? null : value)),
  );
}

const referenceSchema = z
  .string()
  .trim()
  .min(1, { error: "Reference is required." })
  .max(100, { error: "Reference must be at most 100 characters." });

const walletIdSchema = z
  .string()
  .trim()
  .min(1, { error: "Wallet is required." });

const currencyCodeSchema = z
  .string()
  .trim()
  .min(1, { error: "Currency is required." })
  .transform((value) => value.toUpperCase())
  .refine((value) => /^[A-Z]{3,8}$/.test(value), {
    error: "Currency code is invalid.",
  });

const amountSchema = z
  .string()
  .trim()
  .min(1, { error: "Amount is required." })
  .refine((value) => /^\d+(\.\d+)?$/.test(value), {
    error: "Amount must be a positive number.",
  })
  .refine((value) => Number(value) > 0, {
    error: "Amount must be greater than zero.",
  });

const valueDateSchema = z.preprocess((value) => {
  if (value instanceof Date) {
    return value;
  }
  if (value == null || value === "") {
    return new Date();
  }
  if (typeof value === "string" && value.trim() !== "") {
    return new Date(value);
  }
  return value;
}, z.date({ error: "A valid value date is required." }));

const optionalCustomerIdSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  },
  z.string().nullable(),
);

export const hawalaPartySchema = z.object({
  senderName: requiredText("Sender name", 200),
  senderPhone: optionalPhone(),
  receiverName: requiredText("Receiver name", 200),
  receiverPhone: optionalPhone(),
  partnerSarafi: requiredText("Partner sarafi", 200),
  originCity: requiredText("Origin city", 120),
  originCountry: requiredText("Origin country", 120),
  destinationCity: requiredText("Destination city", 120),
  destinationCountry: requiredText("Destination country", 120),
  reference: referenceSchema,
  currencyCode: currencyCodeSchema,
  amount: amountSchema,
  notes: optionalText(2000),
  customerId: optionalCustomerIdSchema.optional(),
  cashWalletId: walletIdSchema,
  clearingWalletId: walletIdSchema,
  valueDate: valueDateSchema.optional(),
});

export const sendHawalaSchema = hawalaPartySchema;
export const receiveHawalaSchema = hawalaPartySchema;

export type HawalaPartySchemaInput = z.input<typeof hawalaPartySchema>;
export type HawalaPartySchemaOutput = z.output<typeof hawalaPartySchema>;

export type HawalaFieldErrors = Partial<
  Record<keyof HawalaPartySchemaOutput, string>
>;

export function toHawalaFieldErrors(
  error: z.ZodError,
): HawalaFieldErrors {
  const fieldErrors: HawalaFieldErrors = {};

  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in fieldErrors)) {
      fieldErrors[key as keyof HawalaPartySchemaOutput] = issue.message;
    }
  }

  return fieldErrors;
}
