import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { HAWALA_DIRECTION_LABELS } from "@/features/hawala/domain/labels";
import { PartnerSarafiError } from "@/features/partner-sarafi/domain/errors";
import { formatPartnerCommissionRateLabel } from "@/features/partner-sarafi/domain/commission";
import type { PartnerCommissionSummary } from "@/features/partner-sarafi/domain/types";
import { listPartnerCommissionSettlements } from "@/features/partner-sarafi/repositories/partner-commission-repository";
import { findPartnerSarafiById } from "@/features/partner-sarafi/repositories/partner-sarafi-repository";
import { formatPrismaAmount } from "@/features/transactions/services/ledger-amount-display";
import { prisma } from "@/server/db";

function decimalToRaw(
  value: Prisma.Decimal,
  decimalPlaces: number,
): string {
  return value.toFixed(decimalPlaces);
}

function decimalToDisplay(
  value: Prisma.Decimal | null | undefined,
  currency: {
    code: string;
    name: string;
    decimalPlaces: number;
    symbol: string | null;
  },
): string {
  if (!value) {
    return formatPrismaAmount(new Prisma.Decimal(0), currency) ?? "0";
  }
  return formatPrismaAmount(value, currency) ?? value.toString();
}

function maxZero(value: Prisma.Decimal): Prisma.Decimal {
  return value.lessThan(0) ? new Prisma.Decimal(0) : value;
}

/**
 * Commission open balances + settlement/hawala history for one partner.
 */
export async function getPartnerCommissionSummary(
  partnerId: string,
): Promise<PartnerCommissionSummary> {
  const partner = await findPartnerSarafiById(partnerId);
  if (!partner) {
    throw new PartnerSarafiError("NOT_FOUND", "Partner sarafi was not found.");
  }

  const [hawalas, settlements, rateCurrency] = await Promise.all([
    prisma.hawalaTransfer.findMany({
      where: {
        partnerSarafiId: partnerId,
        deletedAt: null,
        status: "COMPLETED",
        commissionAmount: { not: null },
      },
      orderBy: [{ valueDate: "desc" }, { createdAt: "desc" }],
      take: 200,
    }),
    listPartnerCommissionSettlements(partnerId),
    partner.commissionCurrencyId
      ? prisma.currency.findUnique({
          where: { id: partner.commissionCurrencyId },
        })
      : Promise.resolve(null),
  ]);

  const currencyIds = [
    ...new Set([
      ...hawalas
        .map((h) => h.commissionCurrencyId ?? h.currencyId)
        .filter(Boolean),
      ...settlements.map((s) => s.currencyId),
    ]),
  ];

  const currencies =
    currencyIds.length === 0
      ? []
      : await prisma.currency.findMany({
          where: { id: { in: currencyIds } },
        });
  const currencyById = new Map(currencies.map((c) => [c.id, c] as const));

  const operatorIds = [
    ...new Set(settlements.map((s) => s.createdById)),
  ];
  const users =
    operatorIds.length === 0
      ? []
      : await prisma.user.findMany({
          where: { id: { in: operatorIds } },
          select: { id: true, fullName: true, username: true },
        });
  const operatorName = new Map(
    users.map((u) => [u.id, u.fullName.trim() || u.username] as const),
  );

  type Acc = {
    currencyId: string;
    payable: Prisma.Decimal;
    receivable: Prisma.Decimal;
    paid: Prisma.Decimal;
    collected: Prisma.Decimal;
  };
  const byCurrency = new Map<string, Acc>();

  function ensure(currencyId: string): Acc {
    let row = byCurrency.get(currencyId);
    if (!row) {
      row = {
        currencyId,
        payable: new Prisma.Decimal(0),
        receivable: new Prisma.Decimal(0),
        paid: new Prisma.Decimal(0),
        collected: new Prisma.Decimal(0),
      };
      byCurrency.set(currencyId, row);
    }
    return row;
  }

  for (const hawala of hawalas) {
    if (!hawala.commissionAmount || !hawala.commissionSide) {
      continue;
    }
    const currencyId = hawala.commissionCurrencyId ?? hawala.currencyId;
    const row = ensure(currencyId);
    if (hawala.commissionSide === "PAYABLE") {
      row.payable = row.payable.add(hawala.commissionAmount);
    } else {
      row.receivable = row.receivable.add(hawala.commissionAmount);
    }
  }

  for (const settlement of settlements) {
    const row = ensure(settlement.currencyId);
    if (settlement.kind === "PAY_PARTNER") {
      row.paid = row.paid.add(settlement.amount);
    } else {
      row.collected = row.collected.add(settlement.amount);
    }
  }

  const balances = [...byCurrency.values()]
    .map((row) => {
      const currency = currencyById.get(row.currencyId);
      if (!currency) {
        return null;
      }
      const youOwe = maxZero(row.payable.sub(row.paid));
      const theyOweYou = maxZero(row.receivable.sub(row.collected));
      return {
        currencyCode: currency.code,
        currencyId: currency.id,
        payableAccrued: decimalToDisplay(row.payable, currency),
        receivableAccrued: decimalToDisplay(row.receivable, currency),
        paid: decimalToDisplay(row.paid, currency),
        collected: decimalToDisplay(row.collected, currency),
        youOwe: decimalToDisplay(youOwe, currency),
        theyOweYou: decimalToDisplay(theyOweYou, currency),
        youOweRaw: decimalToRaw(youOwe, currency.decimalPlaces),
        theyOweYouRaw: decimalToRaw(theyOweYou, currency.decimalPlaces),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null)
    .sort((a, b) => a.currencyCode.localeCompare(b.currencyCode));

  const hawalaCommissionRows = hawalas.map((hawala) => {
    const currency =
      currencyById.get(hawala.commissionCurrencyId ?? hawala.currencyId) ??
      currencyById.get(hawala.currencyId);
    const commissionSide = hawala.commissionSide;
    return {
      id: hawala.id,
      reference: hawala.reference,
      direction: hawala.direction,
      directionLabel: HAWALA_DIRECTION_LABELS[hawala.direction],
      hawalaAmountDisplay: currency
        ? (formatPrismaAmount(hawala.amount, currency) ??
          hawala.amount.toString())
        : hawala.amount.toString(),
      commissionAmountDisplay:
        hawala.commissionAmount && currency
          ? (formatPrismaAmount(hawala.commissionAmount, currency) ??
            hawala.commissionAmount.toString())
          : "—",
      commissionSide,
      commissionSideLabel:
        commissionSide === "PAYABLE"
          ? "You owe partner"
          : commissionSide === "RECEIVABLE"
            ? "Partner owes you"
            : null,
      currencyCode: currency?.code ?? "—",
      valueDate: hawala.valueDate.toISOString(),
    };
  });

  const settlementItems = settlements.map((settlement) => {
    const currency = currencyById.get(settlement.currencyId);
    return {
      id: settlement.id,
      kind: settlement.kind,
      kindLabel:
        settlement.kind === "PAY_PARTNER"
          ? "Paid to partner"
          : "Collected from partner",
      amountDisplay: currency
        ? (formatPrismaAmount(settlement.amount, currency) ??
          settlement.amount.toString())
        : settlement.amount.toString(),
      currencyCode: currency?.code ?? "—",
      notes: settlement.notes,
      valueDate: settlement.valueDate.toISOString(),
      transactionId: settlement.transactionId,
      operatorName: operatorName.get(settlement.createdById) ?? null,
    };
  });

  const per = partner.commissionPerAmount?.toString() ?? null;
  const fee = partner.commissionFeeAmount?.toString() ?? null;

  return {
    partnerId: partner.id,
    partnerName: partner.name,
    rateLabel: formatPartnerCommissionRateLabel({
      enabled: partner.commissionEnabled,
      perAmount: per,
      feeAmount: fee,
      currencyCode: rateCurrency?.code ?? null,
    }),
    balances,
    settlements: settlementItems,
    hawalaCommissionRows,
  };
}
