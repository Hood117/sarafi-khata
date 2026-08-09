import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type {
  PartnerCommissionSettlement,
  PartnerCommissionSettlementKind,
} from "@/generated/prisma/client";
import { prisma } from "@/server/db";

export type CreatePartnerCommissionSettlementData = {
  partnerSarafiId: string;
  kind: PartnerCommissionSettlementKind;
  currencyId: string;
  amount: Prisma.Decimal | string | number;
  cashWalletId: string;
  transactionId: string;
  notes?: string | null;
  valueDate: Date;
  createdById: string;
};

export async function createPartnerCommissionSettlement(
  data: CreatePartnerCommissionSettlementData,
): Promise<PartnerCommissionSettlement> {
  return prisma.partnerCommissionSettlement.create({
    data: {
      partnerSarafiId: data.partnerSarafiId,
      kind: data.kind,
      currencyId: data.currencyId,
      amount: data.amount,
      cashWalletId: data.cashWalletId,
      transactionId: data.transactionId,
      notes: data.notes ?? null,
      valueDate: data.valueDate,
      createdById: data.createdById,
    },
  });
}

export async function listPartnerCommissionSettlements(
  partnerSarafiId: string,
): Promise<PartnerCommissionSettlement[]> {
  return prisma.partnerCommissionSettlement.findMany({
    where: { partnerSarafiId },
    orderBy: [{ valueDate: "desc" }, { createdAt: "desc" }],
  });
}

export async function sumPartnerCommissionSettlements(options: {
  partnerSarafiId: string;
  currencyId: string;
  kind: PartnerCommissionSettlementKind;
}): Promise<Prisma.Decimal> {
  const result = await prisma.partnerCommissionSettlement.aggregate({
    where: {
      partnerSarafiId: options.partnerSarafiId,
      currencyId: options.currencyId,
      kind: options.kind,
    },
    _sum: { amount: true },
  });

  return result._sum.amount ?? new Prisma.Decimal(0);
}
