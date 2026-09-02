import "server-only";

import type { PartnerSarafi } from "@/generated/prisma/client";
import { findCustomerById } from "@/features/customers/repositories/customer-repository";
import { findCurrencyByCode } from "@/features/ledger/repositories/currency-repository";
import { PartnerSarafiError } from "@/features/partner-sarafi/domain/errors";
import {
  createPartnerSarafiSchema,
  toPartnerSarafiFormFieldErrors,
} from "@/features/partner-sarafi/schemas/partner-sarafi-form";
import {
  createPartnerSarafi,
  findLivePartnerByCustomerId,
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
  const customer = await findCustomerById(data.customerId);
  if (!customer || !customer.isActive) {
    throw new PartnerSarafiError(
      "VALIDATION",
      "Select an existing customer for this partner sarafi.",
      { customerId: "Select an existing customer for this partner sarafi." },
    );
  }
  const phone = customer.phone?.trim() ?? "";
  if (!phone) {
    throw new PartnerSarafiError(
      "VALIDATION",
      "The selected customer needs a phone / WhatsApp number.",
      { customerId: "The selected customer needs a phone / WhatsApp number." },
    );
  }
  const taken = await findLivePartnerByCustomerId(customer.id);
  if (taken) {
    throw new PartnerSarafiError(
      "VALIDATION",
      "This customer is already linked to another partner sarafi.",
      { customerId: "This customer is already linked to another partner sarafi." },
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
      customerId: customer.id,
      name: customer.fullName,
      phone,
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
        "VALIDATION",
        "This customer is already linked to another partner sarafi.",
        { customerId: "This customer is already linked to another partner sarafi." },
      );
    }
    throw error;
  }
}
