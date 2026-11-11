import { z } from "zod";

import {
  optionalPhoneSchema,
  positiveAmountSchema,
  requiredPhoneSchema,
} from "@/lib/validation";

function optionalText(maxLength: number, label: string) {
  return z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : ""),
    z
      .string()
      .max(maxLength, {
        error: `${label} must be at most ${maxLength} characters.`,
      })
      .transform((value) => (value === "" ? null : value)),
  );
}

const nameSchema = z
  .string()
  .trim()
  .min(1, { error: "Partner sarafi name is required." })
  .max(200, { error: "Name must be at most 200 characters." });

export const createPartnerSarafiSchema = z
  .object({
    customerId: z.string().trim().min(1, {
      error: "Select an existing customer for this partner sarafi.",
    }),
    name: z.string().trim().optional().default(""),
    phone: optionalPhoneSchema,
    city: optionalText(100, "City"),
    country: optionalText(100, "Country"),
    notes: optionalText(2000, "Notes"),
    isActive: z.boolean(),
    commissionEnabled: z.boolean(),
    commissionPerAmount: z.string().trim().optional().default(""),
    commissionFeeAmount: z.string().trim().optional().default(""),
    commissionCurrencyCode: z.string().trim().optional().default(""),
  })
  .superRefine((data, ctx) => {
    if (!data.commissionEnabled) {
      return;
    }

    if (!data.commissionCurrencyCode) {
      ctx.addIssue({
        code: "custom",
        path: ["commissionCurrencyCode"],
        message: "Choose the commission currency.",
      });
    }

    const per = positiveAmountSchema.safeParse(data.commissionPerAmount);
    if (!per.success) {
      ctx.addIssue({
        code: "custom",
        path: ["commissionPerAmount"],
        message: "Enter how much hawala amount equals one commission unit.",
      });
    }

    const fee = positiveAmountSchema.safeParse(data.commissionFeeAmount);
    if (!fee.success) {
      ctx.addIssue({
        code: "custom",
        path: ["commissionFeeAmount"],
        message: "Enter the commission for each unit.",
      });
    }
  })
  .transform((data) => {
    if (!data.commissionEnabled) {
      return {
        ...data,
        commissionPerAmount: null as string | null,
        commissionFeeAmount: null as string | null,
        commissionCurrencyCode: null as string | null,
      };
    }

    return {
      ...data,
      commissionPerAmount: data.commissionPerAmount,
      commissionFeeAmount: data.commissionFeeAmount,
      commissionCurrencyCode: data.commissionCurrencyCode.toUpperCase(),
    };
  });

export const updatePartnerSarafiSchema = z
  .object({
    customerId: z.string().trim().optional().default(""),
    name: nameSchema,
    phone: requiredPhoneSchema,
    city: optionalText(100, "City"),
    country: optionalText(100, "Country"),
    notes: optionalText(2000, "Notes"),
    isActive: z.boolean(),
    commissionEnabled: z.boolean(),
    commissionPerAmount: z.string().trim().optional().default(""),
    commissionFeeAmount: z.string().trim().optional().default(""),
    commissionCurrencyCode: z.string().trim().optional().default(""),
  })
  .superRefine((data, ctx) => {
    if (!data.commissionEnabled) {
      return;
    }

    if (!data.commissionCurrencyCode) {
      ctx.addIssue({
        code: "custom",
        path: ["commissionCurrencyCode"],
        message: "Choose the commission currency.",
      });
    }

    const per = positiveAmountSchema.safeParse(data.commissionPerAmount);
    if (!per.success) {
      ctx.addIssue({
        code: "custom",
        path: ["commissionPerAmount"],
        message: "Enter how much hawala amount equals one commission unit.",
      });
    }

    const fee = positiveAmountSchema.safeParse(data.commissionFeeAmount);
    if (!fee.success) {
      ctx.addIssue({
        code: "custom",
        path: ["commissionFeeAmount"],
        message: "Enter the commission for each unit.",
      });
    }
  })
  .transform((data) => {
    if (!data.commissionEnabled) {
      return {
        ...data,
        commissionPerAmount: null as string | null,
        commissionFeeAmount: null as string | null,
        commissionCurrencyCode: null as string | null,
      };
    }

    return {
      ...data,
      commissionPerAmount: data.commissionPerAmount,
      commissionFeeAmount: data.commissionFeeAmount,
      commissionCurrencyCode: data.commissionCurrencyCode.toUpperCase(),
    };
  });

export const settlePartnerCommissionSchema = z.object({
  partnerSarafiId: z.string().trim().min(1),
  kind: z.enum(["PAY_PARTNER", "COLLECT_FROM_PARTNER"]),
  currencyCode: z.string().trim().min(1),
  amount: positiveAmountSchema,
  cashWalletId: z.string().trim().min(1),
  notes: optionalText(2000, "Notes"),
  valueDate: z.coerce.date().optional(),
});

export type CreatePartnerSarafiSchemaInput = z.input<
  typeof createPartnerSarafiSchema
>;
export type CreatePartnerSarafiSchemaOutput = z.output<
  typeof createPartnerSarafiSchema
>;
export type UpdatePartnerSarafiSchemaOutput = z.output<
  typeof updatePartnerSarafiSchema
>;
export type SettlePartnerCommissionSchemaOutput = z.output<
  typeof settlePartnerCommissionSchema
>;

export type PartnerSarafiFormFieldErrors = Partial<
  Record<
    | "customerId"
    | "name"
    | "phone"
    | "city"
    | "country"
    | "notes"
    | "isActive"
    | "commissionEnabled"
    | "commissionPerAmount"
    | "commissionFeeAmount"
    | "commissionCurrencyCode"
    | "amount"
    | "cashWalletId"
    | "currencyCode",
    string
  >
>;

export function toPartnerSarafiFormFieldErrors(
  error: z.ZodError,
): PartnerSarafiFormFieldErrors {
  const fieldErrors: PartnerSarafiFormFieldErrors = {};

  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !fieldErrors[key as keyof PartnerSarafiFormFieldErrors]) {
      fieldErrors[key as keyof PartnerSarafiFormFieldErrors] = issue.message;
    }
  }

  return fieldErrors;
}
