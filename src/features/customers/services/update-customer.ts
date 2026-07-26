import "server-only";

import type { Customer } from "@/generated/prisma/client";
import { CustomerError } from "@/features/customers/domain/errors";
import {
  createCustomerSchema,
  toCreateCustomerFieldErrors,
  type CreateCustomerInput,
} from "@/features/customers/schemas/create-customer";
import {
  findCustomerById,
  findCustomerByPhone,
  updateCustomer,
} from "@/features/customers/repositories/customer-repository";

export type UpdateCustomerResult = Customer;

export async function updateCustomerRecord(
  id: string,
  input: unknown,
): Promise<UpdateCustomerResult> {
  const existingCustomer = await findCustomerById(id);

  if (!existingCustomer) {
    throw new CustomerError("NOT_FOUND", "Customer not found.");
  }

  const parsed = createCustomerSchema.safeParse(input);

  if (!parsed.success) {
    throw new CustomerError(
      "VALIDATION",
      "Please correct the highlighted fields.",
      toCreateCustomerFieldErrors(parsed.error),
    );
  }

  const data: CreateCustomerInput = parsed.data;
  const phoneOwner = await findCustomerByPhone(data.phone);

  if (phoneOwner && phoneOwner.id !== id) {
    throw new CustomerError(
      "DUPLICATE_PHONE",
      "A customer with this phone number already exists.",
      { phone: "A customer with this phone number already exists." },
    );
  }

  try {
    // Prisma `@updatedAt` refreshes `updatedAt`; `createdAt` is intentionally omitted.
    return await updateCustomer(id, {
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
