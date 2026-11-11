import "server-only";

import type { Customer } from "@/generated/prisma/client";
import { CustomerError } from "@/features/customers/domain/errors";
import {
  toUpdateCustomerFieldErrors,
  updateCustomerSchema,
  type UpdateCustomerInput,
} from "@/features/customers/schemas/create-customer";
import {
  findCustomerById,
  findCustomerByPhone,
  updateCustomer,
} from "@/features/customers/repositories/customer-repository";
import { queueAutoBackup } from "@/features/backup/services/auto-backup";

export type UpdateCustomerResult = Customer;

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

export async function updateCustomerRecord(
  id: string,
  input: unknown,
): Promise<UpdateCustomerResult> {
  const existingCustomer = await findCustomerById(id);

  if (!existingCustomer) {
    throw new CustomerError("NOT_FOUND", "Customer not found.");
  }

  const parsed = updateCustomerSchema.safeParse(input);

  if (!parsed.success) {
    throw new CustomerError(
      "VALIDATION",
      "Please correct the highlighted fields.",
      toUpdateCustomerFieldErrors(parsed.error),
    );
  }

  const data: UpdateCustomerInput = parsed.data;
  if (data.phone) {
    const phoneOwner = await findCustomerByPhone(data.phone);
    if (phoneOwner && phoneOwner.id !== id) {
      throw new CustomerError(
        "DUPLICATE_PHONE",
        "A customer with this phone number already exists.",
        { phone: "A customer with this phone number already exists." },
      );
    }
  }

  try {
    // Prisma `@updatedAt` refreshes `updatedAt`; `createdAt` and `code` are never updated.
    const updated = await updateCustomer(id, {
      fullName: data.fullName,
      fatherName: data.fatherName,
      phone: data.phone,
      address: data.address,
      nationalId: data.nationalId,
      notes: data.notes,
    });
    queueAutoBackup("customer-update");
    return updated;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new CustomerError(
        "DUPLICATE_PHONE",
        "A customer with this phone number already exists.",
        { phone: "A customer with this phone number already exists." },
      );
    }

    throw error;
  }
}
