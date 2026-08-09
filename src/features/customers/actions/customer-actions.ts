"use server";

import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  AUDIT_MODULES,
  auditAction,
  toCustomerAuditValues,
} from "@/features/audit";
import { requirePermission } from "@/features/auth/permissions/authorize";
import { isCustomerError } from "@/features/customers/domain/errors";
import type { CreateCustomerFieldErrors } from "@/features/customers/schemas/create-customer";
import { addCustomerWalletMoney } from "@/features/customers/services/add-customer-wallet-money";
import { archiveCustomerRecord } from "@/features/customers/services/archive-customer";
import { createCustomerRecord } from "@/features/customers/services/create-customer";
import {
  getCustomerForForm,
  type CustomerFormData,
} from "@/features/customers/services/get-customer";
import { updateCustomerRecord } from "@/features/customers/services/update-customer";
import { parseEntityId } from "@/lib/action-schemas";

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
  fatherName?: string;
  phone: string;
  address?: string;
  nationalId?: string;
  notes?: string;
  openingBalanceAmount?: string;
  openingBalanceCurrencyCode?: string;
};

export type CreateCustomerActionInput = CustomerFormActionInput;

export type UpdateCustomerActionInput = CustomerFormActionInput & {
  id: string;
};

export type GetCustomerForEditActionResult =
  | { ok: true; customer: CustomerFormData }
  | {
      ok: false;
      code: "NOT_FOUND" | "VALIDATION" | "UNKNOWN";
      message: string;
    };

export type AddCustomerWalletMoneyActionInput = {
  customerId: string;
  amount: string;
  currencyCode: string;
};

export type AddCustomerWalletMoneyActionResult =
  | {
      ok: true;
      message: string;
      customerId: string;
      transactionId: string;
    }
  | {
      ok: false;
      code: "VALIDATION" | "NOT_FOUND" | "UNKNOWN";
      message: string;
      fieldErrors?: {
        amount?: string;
        currencyCode?: string;
      };
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
  const user = await requirePermission("customers.manage");

  try {
    const customer = await createCustomerRecord(
      {
        fullName: input.fullName,
        fatherName: input.fatherName ?? "",
        phone: input.phone,
        address: input.address ?? "",
        nationalId: input.nationalId ?? "",
        notes: input.notes ?? "",
        openingBalanceAmount: input.openingBalanceAmount ?? "",
        openingBalanceCurrencyCode: input.openingBalanceCurrencyCode ?? "",
      },
      { actorUserId: user.id },
    );

    await auditAction({
      userId: user.id,
      action: AUDIT_ACTIONS.CUSTOMER_CREATE,
      module: AUDIT_MODULES.CUSTOMERS,
      entityType: AUDIT_ENTITY_TYPES.CUSTOMER,
      entityId: customer.id,
      afterValues: toCustomerAuditValues(customer),
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
  const user = await requirePermission("customers.manage");

  try {
    const before = await getCustomerForForm(input.id);
    const customer = await updateCustomerRecord(input.id, {
      fullName: input.fullName,
      fatherName: input.fatherName ?? "",
      phone: input.phone,
      address: input.address ?? "",
      nationalId: input.nationalId ?? "",
      notes: input.notes ?? "",
    });

    await auditAction({
      userId: user.id,
      action: AUDIT_ACTIONS.CUSTOMER_UPDATE,
      module: AUDIT_MODULES.CUSTOMERS,
      entityType: AUDIT_ENTITY_TYPES.CUSTOMER,
      entityId: customer.id,
      beforeValues: toCustomerAuditValues(before),
      afterValues: toCustomerAuditValues(customer),
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
  id: unknown,
): Promise<GetCustomerForEditActionResult> {
  await requirePermission("customers.manage");

  const customerId = parseEntityId(id);
  if (!customerId) {
    return {
      ok: false,
      code: "VALIDATION",
      message: "Customer id is required.",
    };
  }

  try {
    const customer = await getCustomerForForm(customerId);
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
      code: "NOT_FOUND" | "VALIDATION" | "UNKNOWN";
      message: string;
    };

export async function archiveCustomerAction(
  id: unknown,
): Promise<ArchiveCustomerActionResult> {
  const user = await requirePermission("customers.manage");

  const customerId = parseEntityId(id);
  if (!customerId) {
    return {
      ok: false,
      code: "VALIDATION",
      message: "Customer id is required.",
    };
  }

  try {
    const customer = await archiveCustomerRecord(customerId);

    await auditAction({
      userId: user.id,
      action: AUDIT_ACTIONS.CUSTOMER_ARCHIVE,
      module: AUDIT_MODULES.CUSTOMERS,
      entityType: AUDIT_ENTITY_TYPES.CUSTOMER,
      entityId: customer.id,
      beforeValues: toCustomerAuditValues({
        ...customer,
        isActive: true,
        deletedAt: null,
      }),
      afterValues: toCustomerAuditValues(customer),
    });

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

export async function addCustomerWalletMoneyAction(
  input: AddCustomerWalletMoneyActionInput,
): Promise<AddCustomerWalletMoneyActionResult> {
  const user = await requirePermission("customers.manage");

  try {
    const result = await addCustomerWalletMoney({
      customerId: input.customerId,
      amount: input.amount,
      currencyCode: input.currencyCode,
      actorUserId: user.id,
    });

    await auditAction({
      userId: user.id,
      action: AUDIT_ACTIONS.TRANSACTION_EXTERNAL_MONEY,
      module: AUDIT_MODULES.CUSTOMERS,
      entityType: AUDIT_ENTITY_TYPES.CUSTOMER,
      entityId: input.customerId,
      afterValues: {
        amount: input.amount,
        currencyCode: input.currencyCode,
        transactionId: result.transaction.id,
      },
    });

    return {
      ok: true,
      message: "Wallet money was added successfully.",
      customerId: input.customerId,
      transactionId: result.transaction.id,
    };
  } catch (error) {
    if (isCustomerError(error)) {
      return {
        ok: false,
        code: error.code === "NOT_FOUND" ? "NOT_FOUND" : "VALIDATION",
        message: error.message,
        fieldErrors: {
          amount: error.fieldErrors?.openingBalanceAmount,
          currencyCode: error.fieldErrors?.openingBalanceCurrencyCode,
        },
      };
    }

    return {
      ok: false,
      code: "UNKNOWN",
      message: "Unable to add wallet money. Please try again.",
    };
  }
}
