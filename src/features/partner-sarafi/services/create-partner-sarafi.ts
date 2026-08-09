import "server-only";

import type { PartnerSarafi } from "@/generated/prisma/client";
import { findCurrencyByCode } from "@/features/ledger/repositories/currency-repository";
import { PartnerSarafiError } from "@/features/partner-sarafi/domain/errors";
import {
  createPartnerSarafiSchema,
  toPartnerSarafiFormFieldErrors,
} from "@/features/partner-sarafi/schemas/partner-sarafi-form";
import {
  createPartnerSarafi,
  findPartnerSarafiByName,
} from "@/features/partner-sarafi/repositories/partner-sarafi-repository";

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "P2002"
  );
}

export async function createPartnerSarafiRecord(
  input: unknown,
): Promise<PartnerSarafi> {
  const parsed = createPartnerSarafiSchema.safeParse(input);

  if (!parsed.success) {
    throw new PartnerSarafiError(
      "VALIDATION",
      "Please correct the highlighted fields.",
      toPartnerSarafiFormFieldErrors(parsed.error),
    );
  }

  const data = parsed.data;
  const existing = await findPartnerSarafiByName(data.name);
  if (existing) {
    throw new PartnerSarafiError(
      "DUPLICATE_NAME",
      "A partner sarafi with this name already exists.",
      { name: "A partner sarafi with this name already exists." },
    );
  }

  let commissionCurrencyId: string | null = null;
  if (data.commissionEnabled && data.commissionCurrencyCode) {
    const currency = await findCurrencyByCode(data.commissionCurrencyCode);
    if (!currency || !currency.isActive) {
      throw new PartnerSarafiError(
        "VALIDATION",
        "Commission currency was not found or is inactive.",
        {
          commissionCurrencyCode:
            "Commission currency was not found or is inactive.",
        },
      );
    }
    commissionCurrencyId = currency.id;
  }

  try {
    return await createPartnerSarafi({
      name: data.name,
      phone: data.phone,
      city: data.city,
      country: data.country,
      notes: data.notes,
      isActive: data.isActive,
      commissionEnabled: data.commissionEnabled,
      commissionPerAmount: data.commissionPerAmount,
      commissionFeeAmount: data.commissionFeeAmount,
      commissionCurrencyId,
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new PartnerSarafiError(
        "DUPLICATE_NAME",
        "A partner sarafi with this name already exists.",
        { name: "A partner sarafi with this name already exists." },
      );
    }
    throw error;
  }
}
