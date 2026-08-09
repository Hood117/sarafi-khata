import "server-only";

import { PartnerSarafiError } from "@/features/partner-sarafi/domain/errors";
import { formatPartnerCommissionRateLabel } from "@/features/partner-sarafi/domain/commission";
import type {
  PartnerSarafiFormData,
  PartnerSarafiOption,
} from "@/features/partner-sarafi/domain/types";
import {
  findPartnerSarafiById,
  listPartnerSarafis,
} from "@/features/partner-sarafi/repositories/partner-sarafi-repository";
import { prisma } from "@/server/db";

function formatPartnerLabel(partner: {
  name: string;
  city: string | null;
  country: string | null;
}): string {
  const location = [partner.city, partner.country].filter(Boolean).join(", ");
  return location ? `${partner.name} — ${location}` : partner.name;
}

async function currencyCodeById(
  currencyId: string | null,
): Promise<string | null> {
  if (!currencyId) {
    return null;
  }
  const currency = await prisma.currency.findUnique({
    where: { id: currencyId },
    select: { code: true },
  });
  return currency?.code ?? null;
}

export async function getPartnerSarafiForForm(
  id: string,
): Promise<PartnerSarafiFormData> {
  const partner = await findPartnerSarafiById(id);
  if (!partner) {
    throw new PartnerSarafiError("NOT_FOUND", "Partner sarafi was not found.");
  }

  const currencyCode = await currencyCodeById(partner.commissionCurrencyId);

  return {
    id: partner.id,
    name: partner.name,
    phone: partner.phone,
    city: partner.city,
    country: partner.country,
    notes: partner.notes,
    isActive: partner.isActive,
    commissionEnabled: partner.commissionEnabled,
    commissionPerAmount: partner.commissionPerAmount?.toString() ?? "",
    commissionFeeAmount: partner.commissionFeeAmount?.toString() ?? "",
    commissionCurrencyCode: currencyCode ?? "",
  };
}

export async function listActivePartnerSarafiOptions(): Promise<
  PartnerSarafiOption[]
> {
  const rows = await listPartnerSarafis({ isActive: true });
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
          select: { id: true, code: true, decimalPlaces: true },
        });

  const byId = new Map(currencies.map((c) => [c.id, c] as const));

  return rows.map((row) => {
    const currency = row.commissionCurrencyId
      ? byId.get(row.commissionCurrencyId)
      : undefined;

    return {
      id: row.id,
      name: row.name,
      label: formatPartnerLabel(row),
      phone: row.phone,
      city: row.city,
      country: row.country,
      commissionEnabled: row.commissionEnabled,
      commissionPerAmount: row.commissionPerAmount?.toString() ?? null,
      commissionFeeAmount: row.commissionFeeAmount?.toString() ?? null,
      commissionCurrencyCode: currency?.code ?? null,
      commissionDecimalPlaces: currency?.decimalPlaces ?? 2,
    };
  });
}

export { formatPartnerCommissionRateLabel };
