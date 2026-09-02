import "server-only";

import { formatPartnerCommissionRateLabel } from "@/features/partner-sarafi/domain/commission";
import { partnerDisplayFromCustomer } from "@/features/partner-sarafi/domain/linked-customer";
import type { PartnerSarafiListItem } from "@/features/partner-sarafi/domain/types";
import { listPartnerSarafis } from "@/features/partner-sarafi/repositories/partner-sarafi-repository";
import { prisma } from "@/server/db";

export type GetPartnerSarafiListOptions = {
  isActive?: boolean;
};

export async function getPartnerSarafiList(
  options: GetPartnerSarafiListOptions = {},
): Promise<PartnerSarafiListItem[]> {
  const rows = await listPartnerSarafis(options);
  const currencyIds = [
    ...new Set(
      rows
        .map((row) => row.commissionCurrencyId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const currencies =
    currencyIds.length === 0
      ? []
      : await prisma.currency.findMany({
          where: { id: { in: currencyIds } },
          select: { id: true, code: true },
        });
  const codeById = new Map(currencies.map((c) => [c.id, c.code] as const));
  const customerIds = [
    ...new Set(rows.map((row) => row.customerId).filter((id): id is string => Boolean(id))),
  ];
  const customers =
    customerIds.length === 0
      ? []
      : await prisma.customer.findMany({
          where: { id: { in: customerIds } },
          select: { id: true, fullName: true, phone: true },
        });
  const customerById = new Map(customers.map((c) => [c.id, c] as const));

  return rows.map((row) => {
    const currencyCode = row.commissionCurrencyId
      ? (codeById.get(row.commissionCurrencyId) ?? null)
      : null;
    const per = row.commissionPerAmount?.toString() ?? null;
    const fee = row.commissionFeeAmount?.toString() ?? null;
    const display = partnerDisplayFromCustomer(
      row,
      row.customerId ? customerById.get(row.customerId) : undefined,
    );

    return {
      id: row.id,
      customerId: row.customerId,
      needsCustomerLink: !row.customerId,
      name: display.name,
      phone: display.phone,
      city: row.city,
      country: row.country,
      notes: row.notes,
      isActive: row.isActive,
      commissionEnabled: row.commissionEnabled,
      commissionPerAmount: per,
      commissionFeeAmount: fee,
      commissionCurrencyCode: currencyCode,
      commissionRateLabel: formatPartnerCommissionRateLabel({
        enabled: row.commissionEnabled,
        perAmount: per,
        feeAmount: fee,
        currencyCode,
      }),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  });
}
