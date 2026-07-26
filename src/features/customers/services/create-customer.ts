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

export type CreateCustomerResult = Customer;

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

  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_CODE_ALLOCATION_ATTEMPTS; attempt += 1) {
    const code = await allocateNextCustomerCode();

    try {
      return await createCustomer({
        fullName: data.fullName,
        phone: data.phone,
        code,
        address: data.address,
        nationalId: data.nationalId,
        notes: data.notes,
      });
    } catch (error) {
      lastError = error;

      if (isUniqueConstraintError(error)) {
        if (uniqueTargetIncludes(error, "code")) {
          // Race on auto-code — retry with a fresh sequence read.
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

  if (isUniqueConstraintError(lastError)) {
    throw new CustomerError(
      "DUPLICATE_CODE",
      "Unable to allocate a unique customer code. Please try again.",
    );
  }

  throw lastError;
}
