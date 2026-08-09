import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { queueAutoBackup } from "@/features/backup/services/auto-backup";
import { findCustomerById } from "@/features/customers/repositories/customer-repository";
import {
  createCurrency,
  isLedgerDomainError,
  moneyFromMajorUnits,
  moneyToMajorUnitString,
  toCurrencyCode,
} from "@/features/ledger/domain";
import {
  findCurrencyByCode,
  findCurrencyById,
} from "@/features/ledger/repositories/currency-repository";
import { HawalaError } from "@/features/hawala/domain/errors";
import {
  commissionsEqual,
  resolveFixedHawalaCommissions,
} from "@/features/hawala/domain/commission";
import {
  findHawalaTransferById,
  findHawalaTransferByReference,
  updateHawalaTransfer,
} from "@/features/hawala/repositories/hawala-repository";
import {
  updateHawalaSchema,
  type UpdateHawalaSchemaOutput,
} from "@/features/hawala/schemas/hawala";
import { postHawalaMovement } from "@/features/hawala/services/post-hawala-movement";
import { rethrowAsHawalaError } from "@/features/hawala/services/map-posting-error";
import { findPartnerSarafiById } from "@/features/partner-sarafi/repositories/partner-sarafi-repository";
import { isTransactionError } from "@/features/transactions/domain/transaction-errors";
import { prismaAmountToMajorString } from "@/features/transactions/services/ledger-amount-display";
import { voidPostedTransaction } from "@/features/transactions/services/void-transaction";
import { updateTransaction } from "@/features/transactions/repositories/transaction-repository";
import { isValidLocationPair } from "@/lib/locations";

async function resolvePartyName(
  customerId: string | null | undefined,
  fallbackName: string,
): Promise<{ name: string; customerId: string | null }> {
  if (!customerId) {
    return { name: fallbackName.trim(), customerId: null };
  }

  const customer = await findCustomerById(customerId);
  if (!customer || customer.deletedAt || !customer.isActive) {
    throw new HawalaError(
      "VALIDATION",
      "Linked customer was not found or is inactive.",
      { customerId: "Linked customer was not found or is inactive." },
    );
  }

  return { name: customer.fullName, customerId: customer.id };
}

function releaseVoidedTransactionReference(
  reference: string,
  transactionId: string,
): string {
  const trimmed = reference.trim() || transactionId;
  return trimmed.startsWith("voided:")
    ? `voided:${transactionId}`
    : `voided:${trimmed}`;
}

export async function updateHawalaRecord(
  input: UpdateHawalaSchemaOutput,
  options: { createdById: string },
) {
  const existing = await findHawalaTransferById(input.hawalaId);
  if (!existing || existing.deletedAt) {
    throw new HawalaError("NOT_FOUND", "Hawala transfer was not found.");
  }

  if (existing.status === "CANCELLED") {
    throw new HawalaError(
      "INVALID_STATUS",
      "Cancelled hawala transfers cannot be edited.",
    );
  }

  if (
    !isValidLocationPair(input.originCountry, input.originCity) ||
    !isValidLocationPair(input.destinationCountry, input.destinationCity)
  ) {
    throw new HawalaError(
      "VALIDATION",
      "Origin and destination cities must match their countries.",
    );
  }

  const referenceConflict = await findHawalaTransferByReference(
    input.reference,
    { includeDeleted: true },
  );
  if (referenceConflict && referenceConflict.id !== existing.id) {
    throw new HawalaError(
      "CONFLICT",
      "Another hawala already uses this reference.",
      { reference: "This reference is already in use." },
    );
  }

  const partner = await findPartnerSarafiById(input.partnerSarafiId);
  if (!partner || partner.deletedAt || !partner.isActive) {
    throw new HawalaError(
      "VALIDATION",
      "Partner sarafi was not found or is inactive.",
      { partnerSarafiId: "Partner sarafi was not found or is inactive." },
    );
  }

  const sender = await resolvePartyName(
    input.senderCustomerId,
    input.senderName,
  );
  const receiver = await resolvePartyName(
    input.receiverCustomerId,
    input.receiverName,
  );

  if (!sender.name) {
    throw new HawalaError(
      "VALIDATION",
      "Select a local customer or enter the sender name.",
      { senderName: "Select a local customer or enter the sender name." },
    );
  }

  if (!receiver.name) {
    throw new HawalaError(
      "VALIDATION",
      "Select a local customer or enter the receiver name.",
      { receiverName: "Select a local customer or enter the receiver name." },
    );
  }

  const primaryCustomerId =
    input.customerId ?? sender.customerId ?? receiver.customerId ?? null;

  const existingCurrency = await findCurrencyById(existing.currencyId, {
    includeDeleted: true,
  });
  const existingAmountMajor = prismaAmountToMajorString(existing.amount);
  const existingCurrencyCode = existingCurrency?.code ?? "";

  const currency = await findCurrencyByCode(input.currencyCode);
  if (!currency) {
    throw new HawalaError("NOT_FOUND", "Currency was not found.", {
      currencyCode: "Currency was not found.",
    });
  }
  if (!currency.isActive) {
    throw new HawalaError(
      "INACTIVE",
      "Currency is inactive and cannot be used.",
      { currencyCode: "Currency is inactive." },
    );
  }

  const domainCurrency = createCurrency({
    code: currency.code,
    name: currency.name,
    symbol: currency.symbol ?? undefined,
    decimalPlaces: currency.decimalPlaces,
  });

  let money;
  try {
    money = moneyFromMajorUnits(input.amount, domainCurrency);
  } catch (error) {
    if (isLedgerDomainError(error)) {
      throw new HawalaError("VALIDATION", error.message, {
        amount: error.message,
      });
    }
    throw error;
  }

  let amountOrCurrencyChanged =
    input.currencyCode !== existingCurrencyCode;
  if (!amountOrCurrencyChanged && existingCurrency) {
    try {
      const existingMoney = moneyFromMajorUnits(
        existingAmountMajor,
        createCurrency({
          code: existingCurrency.code,
          name: existingCurrency.name,
          symbol: existingCurrency.symbol ?? undefined,
          decimalPlaces: existingCurrency.decimalPlaces,
        }),
      );
      amountOrCurrencyChanged =
        money.amountMinor !== existingMoney.amountMinor;
    } catch {
      amountOrCurrencyChanged = true;
    }
  }

  const amountMajor = moneyToMajorUnitString(money, currency.decimalPlaces);
  const currencyCode = toCurrencyCode(currency.code);

  const commissions = resolveFixedHawalaCommissions({
    direction: existing.direction,
    partnerCommissionAmount: input.partnerCommissionAmount,
    ownCommissionAmount: input.ownCommissionAmount,
  });

  const existingOwnMajor = existing.ownCommissionAmount
    ? prismaAmountToMajorString(existing.ownCommissionAmount)
    : null;
  const ownCommissionChanged = !commissionsEqual(
    existingOwnMajor,
    commissions.ownAmount,
  );

  const commissionFields = {
    ...(commissions.partnerAmount
      ? {
          commissionAmount: new Prisma.Decimal(commissions.partnerAmount),
          commissionCurrencyId: currency.id,
          commissionSide: "PAYABLE" as const,
        }
      : {
          commissionAmount: null,
          commissionCurrencyId: null,
          commissionSide: null,
        }),
    ownCommissionAmount: commissions.ownAmount
      ? new Prisma.Decimal(commissions.ownAmount)
      : null,
    commissionRatePerAmount: null,
    commissionRateFeeAmount: null,
  };

  const partyFields = {
    reference: input.reference,
    senderName: sender.name,
    senderPhone: input.senderPhone,
    receiverName: receiver.name,
    receiverPhone: input.receiverPhone,
    partnerSarafi: partner.name,
    partnerSarafiId: partner.id,
    originCity: input.originCity,
    originCountry: input.originCountry,
    destinationCity: input.destinationCity,
    destinationCountry: input.destinationCountry,
    notes: input.notes,
    senderCustomerId: sender.customerId,
    receiverCustomerId: receiver.customerId,
    customerId: primaryCustomerId,
    valueDate: input.valueDate,
    ...commissionFields,
  };

  const needsRepost = amountOrCurrencyChanged || ownCommissionChanged;

  if (!needsRepost) {
    const updated = await updateHawalaTransfer(existing.id, partyFields);
    queueAutoBackup("hawala-update");
    return updated;
  }

  if (existing.transactionId) {
    try {
      await voidPostedTransaction({
        transactionId: existing.transactionId,
        createdById: options.createdById,
        reason: `Hawala correction for ${existing.reference}`,
      });
    } catch (error) {
      if (isTransactionError(error)) {
        throw new HawalaError(
          error.code === "INVALID_STATUS" ? "INVALID_STATUS" : "VALIDATION",
          error.message,
        );
      }
      rethrowAsHawalaError(error);
    }

    await updateTransaction(existing.transactionId, {
      reference: releaseVoidedTransactionReference(
        existing.reference,
        existing.transactionId,
      ),
    });
  }

  const pending = await updateHawalaTransfer(existing.id, {
    ...partyFields,
    amount: new Prisma.Decimal(amountMajor),
    currencyId: currency.id,
    status: "PENDING",
    transactionId: null,
    completedAt: null,
    cancelledAt: null,
  });

  try {
    const posted = await postHawalaMovement({
      hawala: pending,
      direction: existing.direction,
      currencyCode,
      money,
      createdById: options.createdById,
    });
    queueAutoBackup("hawala-update");
    return posted;
  } catch (error) {
    rethrowAsHawalaError(error);
  }
}

/** Re-export parsed shape helper for callers that validate first. */
export { updateHawalaSchema };
