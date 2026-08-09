import "server-only";

import { formatPartnerCommissionRateLabel } from "@/features/partner-sarafi/domain/commission";
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

  return rows.map((row) => {
    const currencyCode = row.commissionCurrencyId
      ? (codeById.get(row.commissionCurrencyId) ?? null)
      : null;
    const per = row.commissionPerAmount?.toString() ?? null;
    const fee = row.commissionFeeAmount?.toString() ?? null;

    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
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
