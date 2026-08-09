import "server-only";

import { randomBytes } from "node:crypto";

import { Prisma } from "@/generated/prisma/client";
import { findCurrencyByCode } from "@/features/ledger/repositories/currency-repository";
import { PartnerSarafiError } from "@/features/partner-sarafi/domain/errors";
import {
  settlePartnerCommissionSchema,
  toPartnerSarafiFormFieldErrors,
} from "@/features/partner-sarafi/schemas/partner-sarafi-form";
import {
  createPartnerCommissionSettlement,
  sumPartnerCommissionSettlements,
} from "@/features/partner-sarafi/repositories/partner-commission-repository";
import { findPartnerSarafiById } from "@/features/partner-sarafi/repositories/partner-sarafi-repository";
import { isPostingError } from "@/features/transactions/domain/errors";
import { postTransaction } from "@/features/transactions/services/post-transaction";
import { resolveMovementAmount } from "@/features/transactions/services/resolve-movement-amount";
import {
  PARTNER_COMMISSION_EXPENSE_WALLET_NAME,
  PARTNER_COMMISSION_INCOME_WALLET_NAME,
} from "@/features/wallets/domain/wallet-descriptions";
import {
  createWallet,
  findWalletById,
  findWalletByName,
} from "@/features/wallets/repositories/wallet-repository";
import { prisma } from "@/server/db";

async function ensureSystemWallet(name: string) {
  const existing = await findWalletByName(name, { type: "SYSTEM" });
  if (existing?.isActive) {
    return existing;
  }
  return createWallet({
    name,
    type: "SYSTEM",
    isActive: true,
  });
}

async function sumAccruedCommission(options: {
  partnerSarafiId: string;
  currencyId: string;
  side: "PAYABLE" | "RECEIVABLE";
}): Promise<Prisma.Decimal> {
  const result = await prisma.hawalaTransfer.aggregate({
    where: {
      partnerSarafiId: options.partnerSarafiId,
      deletedAt: null,
      status: "COMPLETED",
      commissionSide: options.side,
      OR: [
        { commissionCurrencyId: options.currencyId },
        {
          AND: [
            { commissionCurrencyId: null },
            { currencyId: options.currencyId },
          ],
        },
      ],
    },
    _sum: { commissionAmount: true },
  });
  return result._sum.commissionAmount ?? new Prisma.Decimal(0);
}

/**
 * Pay or collect partner commission through postTransaction.
 *
 * PAY_PARTNER: DEBIT expense SYSTEM, CREDIT cash
 * COLLECT_FROM_PARTNER: DEBIT cash, CREDIT income SYSTEM
 */
export async function settlePartnerCommission(input: {
  partnerSarafiId: string;
  kind: "PAY_PARTNER" | "COLLECT_FROM_PARTNER";
  currencyCode: string;
  amount: string;
  cashWalletId: string;
  notes?: string;
  valueDate?: Date;
  createdById: string;
}) {
  const parsed = settlePartnerCommissionSchema.safeParse(input);
  if (!parsed.success) {
    throw new PartnerSarafiError(
      "VALIDATION",
      "Please correct the highlighted fields.",
      toPartnerSarafiFormFieldErrors(parsed.error),
    );
  }

  const data = parsed.data;
  const partner = await findPartnerSarafiById(data.partnerSarafiId);
  if (!partner) {
    throw new PartnerSarafiError("NOT_FOUND", "Partner sarafi was not found.");
  }

  const currency = await findCurrencyByCode(data.currencyCode);
  if (!currency?.isActive) {
    throw new PartnerSarafiError(
      "VALIDATION",
      "Currency was not found or is inactive.",
      { currencyCode: "Currency was not found or is inactive." },
    );
  }

  const cashWallet = await findWalletById(data.cashWalletId);
  if (
    !cashWallet?.isActive ||
    (cashWallet.type !== "TILL" && cashWallet.type !== "VAULT")
  ) {
    throw new PartnerSarafiError(
      "VALIDATION",
      "Choose an active cash till or vault.",
      { cashWalletId: "Choose an active cash till or vault." },
    );
  }

  const isPay = data.kind === "PAY_PARTNER";
  const accrued = await sumAccruedCommission({
    partnerSarafiId: partner.id,
    currencyId: currency.id,
    side: isPay ? "PAYABLE" : "RECEIVABLE",
  });
  const settledAlready = await sumPartnerCommissionSettlements({
    partnerSarafiId: partner.id,
    currencyId: currency.id,
    kind: isPay ? "PAY_PARTNER" : "COLLECT_FROM_PARTNER",
  });
  const open = accrued.sub(settledAlready);
  const settleAmount = new Prisma.Decimal(data.amount);

  if (settleAmount.greaterThan(open)) {
    const openDisplay = open.toFixed(currency.decimalPlaces);
    throw new PartnerSarafiError(
      "INSUFFICIENT_COMMISSION",
      isPay
        ? `You only owe ${openDisplay} ${currency.code} in commission.`
        : `Partner only owes you ${openDisplay} ${currency.code} in commission.`,
      {
        amount: `Cannot settle more than ${openDisplay} ${currency.code}.`,
      },
    );
  }

  if (settleAmount.lessThanOrEqualTo(0)) {
    throw new PartnerSarafiError(
      "VALIDATION",
      "Amount must be greater than zero.",
      { amount: "Amount must be greater than zero." },
    );
  }

  const { money, currencyCode } = await resolveMovementAmount(
    currency.code,
    data.amount,
  );

  const pnlWallet = await ensureSystemWallet(
    isPay
      ? PARTNER_COMMISSION_EXPENSE_WALLET_NAME
      : PARTNER_COMMISSION_INCOME_WALLET_NAME,
  );

  const reference = `PARTNER-COMM-${isPay ? "PAY" : "COLLECT"}-${randomBytes(4).toString("hex").toUpperCase()}`;
  const valueDate = data.valueDate ?? new Date();
  const memo = isPay
    ? `Commission paid to ${partner.name}`
    : `Commission collected from ${partner.name}`;

  try {
    const posted = await postTransaction({
      reference,
      type: "ADJUSTMENT",
      valueDate,
      description: data.notes ?? memo,
      createdById: input.createdById,
      entries: isPay
        ? [
            {
              walletId: pnlWallet.id,
              currency: currencyCode,
              direction: "DEBIT",
              amount: money,
              memo,
            },
            {
              walletId: cashWallet.id,
              currency: currencyCode,
              direction: "CREDIT",
              amount: money,
              memo,
            },
          ]
        : [
            {
              walletId: cashWallet.id,
              currency: currencyCode,
              direction: "DEBIT",
              amount: money,
              memo,
            },
            {
              walletId: pnlWallet.id,
              currency: currencyCode,
              direction: "CREDIT",
              amount: money,
              memo,
            },
          ],
    });

    const settlement = await createPartnerCommissionSettlement({
      partnerSarafiId: partner.id,
      kind: data.kind,
      currencyId: currency.id,
      amount: settleAmount,
      cashWalletId: cashWallet.id,
      transactionId: posted.id,
      notes: data.notes,
      valueDate,
      createdById: input.createdById,
    });

    return { settlement, transaction: posted, partner };
  } catch (error) {
    if (isPostingError(error)) {
      throw new PartnerSarafiError("VALIDATION", error.message);
    }
    throw error;
  }
}
