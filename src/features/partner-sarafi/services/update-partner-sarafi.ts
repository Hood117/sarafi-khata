import "server-only";

import type { PartnerSarafi } from "@/generated/prisma/client";
import { findCurrencyByCode } from "@/features/ledger/repositories/currency-repository";
import { PartnerSarafiError } from "@/features/partner-sarafi/domain/errors";
import {
  updatePartnerSarafiSchema,
  toPartnerSarafiFormFieldErrors,
} from "@/features/partner-sarafi/schemas/partner-sarafi-form";
import {
  findPartnerSarafiById,
  findPartnerSarafiByName,
  updatePartnerSarafi,
} from "@/features/partner-sarafi/repositories/partner-sarafi-repository";

export async function updatePartnerSarafiRecord(
  id: string,
  input: unknown,
): Promise<PartnerSarafi> {
  const existing = await findPartnerSarafiById(id);
  if (!existing) {
    throw new PartnerSarafiError("NOT_FOUND", "Partner sarafi was not found.");
  }

  const parsed = updatePartnerSarafiSchema.safeParse(input);
  if (!parsed.success) {
    throw new PartnerSarafiError(
      "VALIDATION",
      "Please correct the highlighted fields.",
      toPartnerSarafiFormFieldErrors(parsed.error),
    );
  }

  const data = parsed.data;
  const duplicate = await findPartnerSarafiByName(data.name);
  if (duplicate && duplicate.id !== id) {
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

  return updatePartnerSarafi(id, {
    name: data.name,
    phone: data.phone,
    city: data.city,
    country: data.country,
    notes: data.notes,
    isActive: data.isActive,
    commissionEnabled: data.commissionEnabled,
    commissionPerAmount: data.commissionEnabled
      ? data.commissionPerAmount
      : null,
    commissionFeeAmount: data.commissionEnabled
      ? data.commissionFeeAmount
      : null,
    commissionCurrencyId: data.commissionEnabled ? commissionCurrencyId : null,
  });
}
