import type { AuditValues } from "@/features/audit/domain/types";

/** Shared customer field snapshot for create/update/archive audits. */
export function toCustomerAuditValues(customer: {
  fullName: string;
  phone?: string | null;
  address?: string | null;
  nationalId?: string | null;
  notes?: string | null;
  code?: string | null;
  isActive?: boolean;
  deletedAt?: Date | string | null;
}): AuditValues {
  const values: AuditValues = {
    fullName: customer.fullName,
    phone: customer.phone ?? null,
    address: customer.address ?? null,
    nationalId: customer.nationalId ?? null,
    notes: customer.notes ?? null,
  };

  if (customer.code !== undefined) {
    values.code = customer.code;
  }

  if (customer.isActive !== undefined) {
    values.isActive = customer.isActive;
  }

  if (customer.deletedAt !== undefined) {
    values.deletedAt =
      customer.deletedAt instanceof Date
        ? customer.deletedAt.toISOString()
        : customer.deletedAt;
  }

  return values;
}

/** Shared settings snapshot for settings.update audits. */
export function toSettingsAuditValues(settings: {
  businessName: string;
  baseCurrencyCode: string;
  locale: string;
}): AuditValues {
  return {
    businessName: settings.businessName,
    baseCurrencyCode: settings.baseCurrencyCode,
    locale: settings.locale,
  };
}

/** Shared user field snapshot — never include password or passwordHash. */
export function toUserAuditValues(user: {
  fullName: string;
  username: string;
  role: string;
  isActive: boolean;
}): AuditValues {
  return {
    fullName: user.fullName,
    username: user.username,
    role: user.role,
    isActive: user.isActive,
  };
}
