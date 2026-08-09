import "server-only";

import {
  createCurrency,
  isLedgerDomainError,
  moneyFromMajorUnits,
  moneyToMajorUnitString,
  type CurrencyCode,
  type Money,
} from "@/features/ledger/domain";
import { findCurrencyByCode } from "@/features/ledger/repositories/currency-repository";
import { HawalaError } from "@/features/hawala/domain/errors";
import {
  assertCashWallet,
  assertClearingWallet,
  assertDistinctWallets,
} from "@/features/hawala/domain/rules";
import type { HawalaPartySchemaOutput } from "@/features/hawala/schemas/hawala";
import { findCustomerById } from "@/features/customers/repositories/customer-repository";
import { findPartnerSarafiById } from "@/features/partner-sarafi/repositories/partner-sarafi-repository";
import { findWalletById } from "@/features/wallets/repositories/wallet-repository";
import type {
  Currency,
  Customer,
  PartnerSarafi,
  Wallet,
} from "@/generated/prisma/client";

export type ResolvedHawalaContext = {
  data: HawalaPartySchemaOutput;
  currency: Currency;
  currencyCode: CurrencyCode;
  money: Money;
  amountMajor: string;
  cashWallet: Wallet;
  clearingWallet: Wallet;
  partner: PartnerSarafi;
  partnerSarafiName: string;
  senderName: string;
  senderPhone: string | null;
  receiverName: string;
  receiverPhone: string | null;
  senderCustomerId: string | null;
  receiverCustomerId: string | null;
  /** Primary local customer for the posted Transaction. */
  customerId: string | null;
  valueDate: Date;
};

async function resolvePartyCustomer(
  customerId: string | null,
  field: "senderCustomerId" | "receiverCustomerId",
): Promise<Customer | null> {
  if (!customerId) {
    return null;
  }

  const customer = await findCustomerById(customerId);
  if (!customer) {
    throw new HawalaError("NOT_FOUND", "Customer was not found.", {
      [field]: "Customer was not found.",
    });
  }
  if (!customer.isActive || customer.deletedAt) {
    throw new HawalaError(
      "INACTIVE",
      "Customer is inactive and cannot be used.",
      { [field]: "Customer is inactive." },
    );
  }

  return customer;
}

export async function resolveHawalaContext(
  data: HawalaPartySchemaOutput,
): Promise<ResolvedHawalaContext> {
  assertDistinctWallets(data.cashWalletId, data.clearingWalletId);

  const partner = await findPartnerSarafiById(data.partnerSarafiId);
  if (!partner) {
    throw new HawalaError("NOT_FOUND", "Partner sarafi was not found.", {
      partnerSarafiId: "Partner sarafi was not found.",
    });
  }
  if (!partner.isActive || partner.deletedAt) {
    throw new HawalaError(
      "INACTIVE",
      "Partner sarafi is inactive and cannot be used.",
      { partnerSarafiId: "Partner sarafi is inactive." },
    );
  }

  const cashWallet = await findWalletById(data.cashWalletId);
  if (!cashWallet) {
    throw new HawalaError("NOT_FOUND", "Cash wallet was not found.", {
      cashWalletId: "Cash wallet was not found.",
    });
  }
  if (!cashWallet.isActive) {
    throw new HawalaError(
      "INACTIVE",
      "Cash wallet is inactive and cannot be used.",
      { cashWalletId: "Cash wallet is inactive." },
    );
  }
  assertCashWallet(cashWallet);

  const clearingWallet = await findWalletById(data.clearingWalletId);
  if (!clearingWallet) {
    throw new HawalaError("NOT_FOUND", "Clearing wallet was not found.", {
      clearingWalletId: "Clearing wallet was not found.",
    });
  }
  if (!clearingWallet.isActive) {
    throw new HawalaError(
      "INACTIVE",
      "Clearing wallet is inactive and cannot be used.",
      { clearingWalletId: "Clearing wallet is inactive." },
    );
  }
  assertClearingWallet(clearingWallet);

  const currencyRecord = await findCurrencyByCode(data.currencyCode);
  if (!currencyRecord) {
    throw new HawalaError("NOT_FOUND", "Currency was not found.", {
      currencyCode: "Currency was not found.",
    });
  }
  if (!currencyRecord.isActive) {
    throw new HawalaError(
      "INACTIVE",
      "Currency is inactive and cannot be used.",
      { currencyCode: "Currency is inactive." },
    );
  }

  const domainCurrency = createCurrency({
    code: currencyRecord.code,
    name: currencyRecord.name,
    symbol: currencyRecord.symbol ?? undefined,
    decimalPlaces: currencyRecord.decimalPlaces,
  });

  let money: Money;
  try {
    money = moneyFromMajorUnits(data.amount, domainCurrency);
  } catch (error) {
    if (isLedgerDomainError(error)) {
      throw new HawalaError("VALIDATION", error.message, {
        amount: error.message,
      });
    }
    throw error;
  }

  const senderCustomerId = data.senderCustomerId ?? null;
  const receiverCustomerId = data.receiverCustomerId ?? null;

  const [senderCustomer, receiverCustomer] = await Promise.all([
    resolvePartyCustomer(senderCustomerId, "senderCustomerId"),
    resolvePartyCustomer(receiverCustomerId, "receiverCustomerId"),
  ]);

  const senderName = senderCustomer
    ? senderCustomer.fullName.trim()
    : data.senderName.trim();
  const senderPhone = senderCustomer
    ? (senderCustomer.phone?.trim() || null)
    : (data.senderPhone ?? null);

  const receiverName = receiverCustomer
    ? receiverCustomer.fullName.trim()
    : data.receiverName.trim();
  const receiverPhone = receiverCustomer
    ? (receiverCustomer.phone?.trim() || null)
    : (data.receiverPhone ?? null);

  if (!senderName) {
    throw new HawalaError(
      "VALIDATION",
      "Select a local customer or enter the sender name.",
      { senderName: "Select a local customer or enter the sender name." },
    );
  }

  if (!receiverName) {
    throw new HawalaError(
      "VALIDATION",
      "Select a local customer or enter the receiver name.",
      { receiverName: "Select a local customer or enter the receiver name." },
    );
  }

  const customerId =
    data.customerId ?? senderCustomerId ?? receiverCustomerId ?? null;

  if (
    customerId &&
    customerId !== senderCustomerId &&
    customerId !== receiverCustomerId
  ) {
    const primary = await findCustomerById(customerId);
    if (!primary) {
      throw new HawalaError("NOT_FOUND", "Customer was not found.", {
        customerId: "Customer was not found.",
      });
    }
    if (!primary.isActive || primary.deletedAt) {
      throw new HawalaError(
        "INACTIVE",
        "Customer is inactive and cannot be used.",
        { customerId: "Customer is inactive." },
      );
    }
  }

  return {
    data,
    currency: currencyRecord,
    currencyCode: domainCurrency.code,
    money,
    amountMajor: moneyToMajorUnitString(money, currencyRecord.decimalPlaces),
    cashWallet,
    clearingWallet,
    partner,
    partnerSarafiName: partner.name,
    senderName,
    senderPhone,
    receiverName,
    receiverPhone,
    senderCustomerId,
    receiverCustomerId,
    customerId,
    valueDate: data.valueDate ?? new Date(),
  };
}
