import { AUDIT_ACTIONS } from "@/features/audit/domain/constants";
import type { AuditValues } from "@/features/audit/domain/types";

function asRecord(value: unknown): AuditValues | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as AuditValues;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function moneySnippet(values: AuditValues | null): string | null {
  if (!values) {
    return null;
  }

  const amount = asString(values.amount);
  const currency =
    asString(values.currencyCode) ??
    asString(values.fromCurrencyCode) ??
    null;

  if (amount && currency) {
    return `${amount} ${currency}`;
  }

  if (amount) {
    return amount;
  }

  return null;
}

/**
 * Human-readable one-line summary for the Audit Log table.
 */
export function buildAuditSummary(input: {
  action: string;
  beforeValues?: unknown;
  afterValues?: unknown;
}): string {
  const after = asRecord(input.afterValues);
  const before = asRecord(input.beforeValues);
  const reference = asString(after?.reference);
  const fullName = asString(after?.fullName) ?? asString(before?.fullName);
  const username = asString(after?.username);
  const money = moneySnippet(after);

  switch (input.action) {
    case AUDIT_ACTIONS.LOGIN_SUCCESS:
      return username ? `Signed in as ${username}` : "Signed in";
    case AUDIT_ACTIONS.LOGIN_FAILURE:
      return username
        ? `Failed sign-in for ${username}`
        : "Failed sign-in attempt";
    case AUDIT_ACTIONS.LOGOUT:
      return username ? `Signed out ${username}` : "Signed out";
    case AUDIT_ACTIONS.CUSTOMER_CREATE:
      return fullName ? `Created customer ${fullName}` : "Created customer";
    case AUDIT_ACTIONS.CUSTOMER_UPDATE:
      return fullName ? `Updated customer ${fullName}` : "Updated customer";
    case AUDIT_ACTIONS.CUSTOMER_ARCHIVE:
      return fullName ? `Archived customer ${fullName}` : "Archived customer";
    case AUDIT_ACTIONS.TRANSACTION_DEPOSIT:
      return reference
        ? `Posted deposit ${reference}${money ? ` (${money})` : ""}`
        : "Posted deposit";
    case AUDIT_ACTIONS.TRANSACTION_WITHDRAWAL:
      return reference
        ? `Posted withdrawal ${reference}${money ? ` (${money})` : ""}`
        : "Posted withdrawal";
    case AUDIT_ACTIONS.TRANSACTION_ADJUSTMENT:
      return reference
        ? `Posted adjustment ${reference}${money ? ` (${money})` : ""}`
        : "Posted adjustment";
    case AUDIT_ACTIONS.TRANSACTION_EXTERNAL_MONEY:
      return reference
        ? `Added external money ${reference}${money ? ` (${money})` : ""}`
        : "Added external money";
    case AUDIT_ACTIONS.TRANSACTION_EXTERNAL_MONEY_UPDATE:
      return reference
        ? `Updated external money ${reference}`
        : "Updated external money";
    case AUDIT_ACTIONS.TRANSACTION_EXTERNAL_MONEY_ARCHIVE:
      return reference
        ? `Archived external money ${reference}`
        : "Archived external money";
    case AUDIT_ACTIONS.TRANSACTION_EXCHANGE: {
      const from = asString(after?.fromCurrencyCode);
      const to = asString(after?.toCurrencyCode);
      const pair = from && to ? `${from}→${to}` : null;
      return reference
        ? `Posted exchange ${reference}${pair ? ` (${pair})` : ""}`
        : "Posted currency exchange";
    }
    case AUDIT_ACTIONS.TRANSACTION_TRANSFER:
      return reference
        ? `Posted transfer ${reference}${money ? ` (${money})` : ""}`
        : "Posted customer transfer";
    case AUDIT_ACTIONS.TRANSACTION_POST:
      return reference ? `Posted transaction ${reference}` : "Posted transaction";
    case AUDIT_ACTIONS.HAWALA_SEND:
      return reference
        ? `Sent hawala ${reference}${money ? ` (${money})` : ""}`
        : "Sent hawala";
    case AUDIT_ACTIONS.HAWALA_RECEIVE:
      return reference
        ? `Received hawala ${reference}${money ? ` (${money})` : ""}`
        : "Received hawala";
    case AUDIT_ACTIONS.HAWALA_CANCEL:
      return reference ? `Cancelled hawala ${reference}` : "Cancelled hawala";
    case AUDIT_ACTIONS.HAWALA_COMPLETE:
      return reference ? `Completed hawala ${reference}` : "Completed hawala";
    case AUDIT_ACTIONS.HAWALA_UPDATE:
      return reference ? `Updated hawala ${reference}` : "Updated hawala";
    case AUDIT_ACTIONS.HAWALA_ARCHIVE:
      return reference ? `Archived hawala ${reference}` : "Archived hawala";
    case AUDIT_ACTIONS.SETTINGS_UPDATE: {
      const businessName = asString(after?.businessName);
      return businessName
        ? `Updated app settings (${businessName})`
        : "Updated app settings";
    }
    case AUDIT_ACTIONS.USER_CREATE:
      return fullName
        ? `Created user ${fullName}`
        : username
          ? `Created user ${username}`
          : "Created user";
    case AUDIT_ACTIONS.USER_UPDATE:
      return fullName
        ? `Updated user ${fullName}`
        : username
          ? `Updated user ${username}`
          : "Updated user";
    case AUDIT_ACTIONS.USER_SET_ACTIVE: {
      const isActive = after?.isActive;
      const name = fullName ?? username;
      if (isActive === true) {
        return name ? `Activated user ${name}` : "Activated user";
      }
      if (isActive === false) {
        return name ? `Deactivated user ${name}` : "Deactivated user";
      }
      return name ? `Changed user status ${name}` : "Changed user status";
    }
    case AUDIT_ACTIONS.USER_RESET_PASSWORD:
      return username
        ? `Reset password for ${username}`
        : "Reset user password";
    default:
      return input.action;
  }
}

export function formatAuditEntityLabel(
  entityType: string | null | undefined,
  entityId: string | null | undefined,
): string | null {
  const type = entityType?.trim() || null;
  const id = entityId?.trim() || null;

  if (!type && !id) {
    return null;
  }

  if (type && id) {
    const shortId = id.length > 12 ? `${id.slice(0, 8)}…` : id;
    return `${type} · ${shortId}`;
  }

  return type ?? id;
}
