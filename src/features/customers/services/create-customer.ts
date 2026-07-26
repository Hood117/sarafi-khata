import "server-only";

import type { Customer } from "@/generated/prisma/client";
import { CustomerError } from "@/features/customers/domain/errors";
import {
  createCustomerSchema,
  toCreateCustomerFieldErrors,
  type CreateCustomerInput,
} from "@/features/customers/schemas/create-customer";
import {
  createCustomer,
  findCustomerByPhone,
} from "@/features/customers/repositories/customer-repository";

export type CreateCustomerResult = Customer;

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
  const existing = await findCustomerByPhone(data.phone);

  if (existing) {
    throw new CustomerError(
      "DUPLICATE_PHONE",
      "A customer with this phone number already exists.",
      { phone: "A customer with this phone number already exists." },
    );
  }

  try {
    return await createCustomer({
      fullName: data.fullName,
      phone: data.phone,
      address: data.address,
      nationalId: data.nationalId,
      notes: data.notes,
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      throw new CustomerError(
        "DUPLICATE_PHONE",
        "A customer with this phone number already exists.",
        { phone: "A customer with this phone number already exists." },
      );
    }

    throw error;
  }
}
