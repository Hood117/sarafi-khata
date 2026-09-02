import "server-only";

import { PartnerSarafiError } from "@/features/partner-sarafi/domain/errors";
import { formatPartnerCommissionRateLabel } from "@/features/partner-sarafi/domain/commission";
import { partnerDisplayFromCustomer } from "@/features/partner-sarafi/domain/linked-customer";
import type { PartnerSarafiListItem } from "@/features/partner-sarafi/domain/types";
import { findPartnerSarafiById } from "@/features/partner-sarafi/repositories/partner-sarafi-repository";
import { prisma } from "@/server/db";

export async function getPartnerSarafiProfile(
  id: string,
): Promise<PartnerSarafiListItem> {
  const partner = await findPartnerSarafiById(id);
  if (!partner) {
    throw new PartnerSarafiError("NOT_FOUND", "Partner sarafi was not found.");
  }

  const currency = partner.commissionCurrencyId
    ? await prisma.currency.findUnique({
        where: { id: partner.commissionCurrencyId },
        select: { code: true },
      })
    : null;

  const per = partner.commissionPerAmount?.toString() ?? null;
  const fee = partner.commissionFeeAmount?.toString() ?? null;
  const currencyCode = currency?.code ?? null;
  const linkedCustomer = partner.customerId
    ? await prisma.customer.findUnique({
        where: { id: partner.customerId },
        select: { fullName: true, phone: true },
      })
    : null;
  const display = partnerDisplayFromCustomer(partner, linkedCustomer);

  return {
    id: partner.id,
    customerId: partner.customerId,
    needsCustomerLink: !partner.customerId,
    name: display.name,
    phone: display.phone,
    city: partner.city,
    country: partner.country,
    notes: partner.notes,
    isActive: partner.isActive,
    commissionEnabled: partner.commissionEnabled,
    commissionPerAmount: per,
    commissionFeeAmount: fee,
    commissionCurrencyCode: currencyCode,
    commissionRateLabel: formatPartnerCommissionRateLabel({
      enabled: partner.commissionEnabled,
      perAmount: per,
      feeAmount: fee,
      currencyCode,
    }),
    createdAt: partner.createdAt.toISOString(),
    updatedAt: partner.updatedAt.toISOString(),
  };
}
