import "server-only";

import { findCurrencyById } from "@/features/ledger/repositories/currency-repository";
import { HawalaError } from "@/features/hawala/domain/errors";
import type { HawalaPartySource } from "@/features/hawala/domain/types";
import { findHawalaTransferById } from "@/features/hawala/repositories/hawala-repository";
import {
  formatPrismaAmount,
  prismaAmountToMajorString,
} from "@/features/transactions/services/ledger-amount-display";

export type HawalaEditFormData = {
  hawalaId: string;
  direction: "SEND" | "RECEIVE";
  status: "PENDING" | "COMPLETED" | "CANCELLED";
  reference: string;
  senderSource: HawalaPartySource;
  senderCustomerId: string;
  senderName: string;
  senderPhone: string;
  receiverSource: HawalaPartySource;
  receiverCustomerId: string;
  receiverName: string;
  receiverPhone: string;
  partnerSarafiId: string;
  partnerSarafi: string;
  originCountry: string;
  originCity: string;
  destinationCountry: string;
  destinationCity: string;
  notes: string;
  valueDate: string;
  currencyCode: string;
  amountDisplay: string;
  amount: string;
  partnerCommissionAmount: string;
  ownCommissionAmount: string;
};

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function getHawalaForEdit(
  id: string,
): Promise<HawalaEditFormData> {
  const hawala = await findHawalaTransferById(id);
  if (!hawala) {
    throw new HawalaError("NOT_FOUND", "Hawala transfer was not found.");
  }

  const currency = await findCurrencyById(hawala.currencyId, {
    includeDeleted: true,
  });

  const amount = prismaAmountToMajorString(hawala.amount);
  const amountDisplay = currency
    ? (formatPrismaAmount(hawala.amount, currency) ?? amount)
    : amount;

  return {
    hawalaId: hawala.id,
    direction: hawala.direction,
    status: hawala.status,
    reference: hawala.reference,
    senderSource: hawala.senderCustomerId ? "customer" : "external",
    senderCustomerId: hawala.senderCustomerId ?? "",
    senderName: hawala.senderName,
    senderPhone: hawala.senderPhone ?? "",
    receiverSource: hawala.receiverCustomerId ? "customer" : "external",
    receiverCustomerId: hawala.receiverCustomerId ?? "",
    receiverName: hawala.receiverName,
    receiverPhone: hawala.receiverPhone ?? "",
    partnerSarafiId: hawala.partnerSarafiId ?? "",
    partnerSarafi: hawala.partnerSarafi,
    originCountry: hawala.originCountry,
    originCity: hawala.originCity,
    destinationCountry: hawala.destinationCountry,
    destinationCity: hawala.destinationCity,
    notes: hawala.notes ?? "",
    valueDate: toDateInputValue(hawala.valueDate),
    currencyCode: currency?.code ?? "—",
    amountDisplay,
    amount,
    partnerCommissionAmount: hawala.commissionAmount
      ? prismaAmountToMajorString(hawala.commissionAmount)
      : "",
    ownCommissionAmount: hawala.ownCommissionAmount
      ? prismaAmountToMajorString(hawala.ownCommissionAmount)
      : "",
  };
}
