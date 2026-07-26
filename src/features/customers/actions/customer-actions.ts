"use server";

import { requirePermission } from "@/features/auth/permissions/authorize";
import { isCustomerError } from "@/features/customers/domain/errors";
import type { CreateCustomerFieldErrors } from "@/features/customers/schemas/create-customer";
import { archiveCustomerRecord } from "@/features/customers/services/archive-customer";
import { createCustomerRecord } from "@/features/customers/services/create-customer";
import {
  getCustomerForForm,
  type CustomerFormData,
} from "@/features/customers/services/get-customer";
import { updateCustomerRecord } from "@/features/customers/services/update-customer";

export type CustomerMutationActionResult =
  | {
      ok: true;
      message: string;
      customerId: string;
    }
  | {
      ok: false;
      code:
        | "VALIDATION"
        | "DUPLICATE_PHONE"
        | "DUPLICATE_CODE"
        | "NOT_FOUND"
        | "UNKNOWN";
      message: string;
      fieldErrors?: CreateCustomerFieldErrors;
    };

export type CreateCustomerActionResult = CustomerMutationActionResult;
export type UpdateCustomerActionResult = CustomerMutationActionResult;

export type CustomerFormActionInput = {
  fullName: string;
  phone: string;
  address?: string;
  nationalId?: string;
  notes?: string;
};

export type CreateCustomerActionInput = CustomerFormActionInput;

export type UpdateCustomerActionInput = CustomerFormActionInput & {
  id: string;
};

export type GetCustomerForEditActionResult =
  | { ok: true; customer: CustomerFormData }
  | {
      ok: false;
      code: "NOT_FOUND" | "UNKNOWN";
      message: string;
    };

function toMutationFailure(error: unknown): CustomerMutationActionResult {
  if (isCustomerError(error)) {
    return {
      ok: false,
      code: error.code,
      message: error.message,
      fieldErrors: error.fieldErrors,
    };
  }

  return {
    ok: false,
    code: "UNKNOWN",
    message: "Unable to save customer. Please try again.",
  };
}

export async function createCustomerAction(
  input: CreateCustomerActionInput,
): Promise<CreateCustomerActionResult> {
  await requirePermission("customers.manage");

  try {
    const customer = await createCustomerRecord({
      fullName: input.fullName,
      phone: input.phone,
      address: input.address ?? "",
      nationalId: input.nationalId ?? "",
      notes: input.notes ?? "",
    });

    return {
      ok: true,
      message: `${customer.fullName} was added successfully.`,
      customerId: customer.id,
    };
  } catch (error) {
    const failure = toMutationFailure(error);
    if (!failure.ok && failure.code === "UNKNOWN") {
      return {
        ...failure,
        message: "Unable to add customer. Please try again.",
      };
    }
    return failure;
  }
}

export async function updateCustomerAction(
  input: UpdateCustomerActionInput,
): Promise<UpdateCustomerActionResult> {
  await requirePermission("customers.manage");

  try {
    const customer = await updateCustomerRecord(input.id, {
      fullName: input.fullName,
      phone: input.phone,
      address: input.address ?? "",
      nationalId: input.nationalId ?? "",
      notes: input.notes ?? "",
    });

    return {
      ok: true,
      message: `${customer.fullName} was updated successfully.`,
      customerId: customer.id,
    };
  } catch (error) {
    const failure = toMutationFailure(error);
    if (!failure.ok && failure.code === "UNKNOWN") {
      return {
        ...failure,
        message: "Unable to update customer. Please try again.",
      };
    }
    return failure;
  }
}

export async function getCustomerForEditAction(
  id: string,
): Promise<GetCustomerForEditActionResult> {
  await requirePermission("customers.manage");

  try {
    const customer = await getCustomerForForm(id);
    return { ok: true, customer };
  } catch (error) {
    if (isCustomerError(error) && error.code === "NOT_FOUND") {
      return {
        ok: false,
        code: "NOT_FOUND",
        message: error.message,
      };
    }

    return {
      ok: false,
      code: "UNKNOWN",
      message: "Unable to load customer. Please try again.",
    };
  }
}

export type ArchiveCustomerActionResult =
  | {
      ok: true;
      message: string;
      customerId: string;
    }
  | {
      ok: false;
      code: "NOT_FOUND" | "UNKNOWN";
      message: string;
    };

export async function archiveCustomerAction(
  id: string,
): Promise<ArchiveCustomerActionResult> {
  await requirePermission("customers.manage");

  try {
    const customer = await archiveCustomerRecord(id);

    return {
      ok: true,
      message: `${customer.fullName} was archived.`,
      customerId: customer.id,
    };
  } catch (error) {
    if (isCustomerError(error) && error.code === "NOT_FOUND") {
      return {
        ok: false,
        code: "NOT_FOUND",
        message: error.message,
      };
    }

    return {
      ok: false,
      code: "UNKNOWN",
      message: "Unable to archive customer. Please try again.",
    };
  }
}
