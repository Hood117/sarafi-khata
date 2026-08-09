import "server-only";

import type { Customer } from "@/generated/prisma/client";
import { computeNextCustomerCode } from "@/features/customers/domain/customer-code";
import { CustomerError } from "@/features/customers/domain/errors";
import {
  createCustomerSchema,
  toCreateCustomerFieldErrors,
  type CreateCustomerInput,
} from "@/features/customers/schemas/create-customer";
import {
  createCustomer,
  findCustomerByPhone,
  listCustomerCodes,
} from "@/features/customers/repositories/customer-repository";
import { isTransactionError } from "@/features/transactions/domain/transaction-errors";
import { postOpeningWalletMoney } from "@/features/transactions/services/post-opening-wallet-money";
import {
  createWallet,
  listWallets,
} from "@/features/wallets/repositories/wallet-repository";
import { queueAutoBackup } from "@/features/backup/services/auto-backup";

export type CreateCustomerResult = Customer;

export type CreateCustomerRecordOptions = {
  actorUserId: string;
};

const MAX_CODE_ALLOCATION_ATTEMPTS = 5;

function isUniqueConstraintError(
  error: unknown,
): error is { code: string; meta?: { target?: string | string[] } } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

function uniqueTargetIncludes(
  error: { meta?: { target?: string | string[] } },
  field: string,
): boolean {
  const target = error.meta?.target;
  if (typeof target === "string") {
    return target.includes(field);
  }
  if (Array.isArray(target)) {
    return target.some((item) => String(item).includes(field));
  }
  return false;
}

async function allocateNextCustomerCode(): Promise<string> {
  const existingCodes = await listCustomerCodes();
  return computeNextCustomerCode(existingCodes);
}

export async function createCustomerRecord(
  input: unknown,
  options: CreateCustomerRecordOptions,
): Promise<CreateCustomerResult> {
  const parsed = createCustomerSchema.safeParse(input);

  if (!parsed.success) {
    throw new CustomerError(
      "VALIDATION",
      "Please correct the highlighted fields.",
      toCreateCustomerFieldErrors(parsed.error),
    );
  }

  const data: CreateCustomerInput = parsed.data;
  const existingPhone = await findCustomerByPhone(data.phone);

  if (existingPhone) {
    throw new CustomerError(
      "DUPLICATE_PHONE",
      "A customer with this phone number already exists.",
      { phone: "A customer with this phone number already exists." },
    );
  }

  const openingAmount =
    data.openingBalanceAmount != null && Number(data.openingBalanceAmount) > 0
      ? data.openingBalanceAmount
      : null;

  let lastError: unknown;
  let customer: Customer | null = null;

  for (let attempt = 0; attempt < MAX_CODE_ALLOCATION_ATTEMPTS; attempt += 1) {
    const code = await allocateNextCustomerCode();

    try {
      customer = await createCustomer({
        fullName: data.fullName,
        fatherName: data.fatherName,
        phone: data.phone,
        code,
        address: data.address,
        nationalId: data.nationalId,
        notes: data.notes,
      });
      break;
    } catch (error) {
      lastError = error;

      if (isUniqueConstraintError(error)) {
        if (uniqueTargetIncludes(error, "code")) {
          continue;
        }

        throw new CustomerError(
          "DUPLICATE_PHONE",
          "A customer with this phone number already exists.",
          { phone: "A customer with this phone number already exists." },
        );
      }

      throw error;
    }
  }

  if (!customer) {
    if (isUniqueConstraintError(lastError)) {
      throw new CustomerError(
        "DUPLICATE_CODE",
        "Unable to allocate a unique customer code. Please try again.",
      );
    }
    throw lastError;
  }

  // Every customer gets a CUSTOMER wallet so deposits/exchanges/opening money work.
  const existingWallets = await listWallets({
    customerId: customer.id,
    type: "CUSTOMER",
    isActive: true,
  });
  let wallet = existingWallets[0] ?? null;

  if (!wallet) {
    try {
      wallet = await createWallet({
        name: `${data.fullName} Wallet`,
        type: "CUSTOMER",
        isActive: true,
        customer: { connect: { id: customer.id } },
      });
    } catch {
      throw new CustomerError(
        "VALIDATION",
        "Customer was saved but their wallet could not be created. Please add a wallet from Wallets.",
      );
    }
  }

  if (openingAmount && data.openingBalanceCurrencyCode) {
    try {
      await postOpeningWalletMoney({
        customerId: customer.id,
        customerWalletId: wallet.id,
        currencyCode: data.openingBalanceCurrencyCode,
        amount: openingAmount,
        createdById: options.actorUserId,
        customerName: data.fullName,
      });
    } catch (error) {
      if (isTransactionError(error)) {
        throw new CustomerError(
          "VALIDATION",
          error.message || "Unable to post opening wallet money.",
          {
            openingBalanceAmount:
              error.fieldErrors?.amount ??
              error.message ??
              "Unable to post opening wallet money.",
          },
        );
      }
      throw error;
    }
  }

  queueAutoBackup("customer-create");
  return customer;
}
