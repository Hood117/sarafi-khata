import "server-only";

import { Prisma } from "@/generated/prisma/client";
import {
  calculatePartnerCommission,
  resolveHawalaCommissionRate,
} from "@/features/partner-sarafi/domain/commission";
import { prisma } from "@/server/db";

/**
 * Backfill commission snapshots on completed hawalas that were posted
 * before commission was calculated (or skipped due to currency mismatch).
 * Idempotent: only updates rows where commissionAmount is still null.
 */
export async function backfillMissingHawalaCommissions(options?: {
  partnerSarafiId?: string;
}): Promise<{ updated: number }> {
  const hawalas = await prisma.hawalaTransfer.findMany({
    where: {
      deletedAt: null,
      status: "COMPLETED",
      commissionAmount: null,
      partnerSarafiId: options?.partnerSarafiId
        ? options.partnerSarafiId
        : { not: null },
    },
    select: {
      id: true,
      direction: true,
      amount: true,
      currencyId: true,
      partnerSarafiId: true,
    },
  });

  if (hawalas.length === 0) {
    return { updated: 0 };
  }

  const partnerIds = [
    ...new Set(
      hawalas
        .map((row) => row.partnerSarafiId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const currencyIds = [...new Set(hawalas.map((row) => row.currencyId))];

  const [partners, currencies] = await Promise.all([
    prisma.partnerSarafi.findMany({
      where: { id: { in: partnerIds } },
    }),
    prisma.currency.findMany({
      where: { id: { in: currencyIds } },
      select: { id: true, code: true, decimalPlaces: true },
    }),
  ]);

  const partnerById = new Map(partners.map((p) => [p.id, p] as const));
  const currencyById = new Map(currencies.map((c) => [c.id, c] as const));

  const partnerRateCurrencyIds = [
    ...new Set(
      partners
        .map((p) => p.commissionCurrencyId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const rateCurrencies =
    partnerRateCurrencyIds.length === 0
      ? []
      : await prisma.currency.findMany({
          where: { id: { in: partnerRateCurrencyIds } },
          select: { id: true, code: true },
        });
  const rateCodeById = new Map(
    rateCurrencies.map((c) => [c.id, c.code] as const),
  );

  let updated = 0;

  for (const hawala of hawalas) {
    if (!hawala.partnerSarafiId) {
      continue;
    }
    const partner = partnerById.get(hawala.partnerSarafiId);
    const currency = currencyById.get(hawala.currencyId);
    if (!partner || !currency) {
      continue;
    }

    const rateCurrencyCode = partner.commissionCurrencyId
      ? (rateCodeById.get(partner.commissionCurrencyId) ?? null)
      : null;

    const rate = resolveHawalaCommissionRate({
      hawalaCurrencyCode: currency.code,
      partner: {
        enabled: partner.commissionEnabled,
        perAmount: partner.commissionPerAmount?.toString() ?? null,
        feeAmount: partner.commissionFeeAmount?.toString() ?? null,
        currencyCode: rateCurrencyCode,
      },
    });

    const commission = calculatePartnerCommission({
      hawalaAmount: hawala.amount.toString(),
      hawalaCurrencyCode: currency.code,
      hawalaDirection: hawala.direction,
      rate,
      decimalPlaces: currency.decimalPlaces,
    });

    if (!commission.applies) {
      continue;
    }

    await prisma.hawalaTransfer.update({
      where: { id: hawala.id },
      data: {
        commissionAmount: new Prisma.Decimal(commission.amount),
        commissionCurrencyId: currency.id,
        commissionSide: commission.side,
        commissionRatePerAmount: new Prisma.Decimal(String(rate.perAmount)),
        commissionRateFeeAmount: new Prisma.Decimal(String(rate.feeAmount)),
      },
    });
    updated += 1;
  }

  return { updated };
}
