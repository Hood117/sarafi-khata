/**
 * Public API for the audit feature.
 * Import from this module only — do not reach into internal folders.
 *
 * Audit Log is append-only activity history, completely separate from the
 * financial ledger (Transaction / LedgerEntry). Never use audit rows for
 * balances or money truth.
 */

export {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  AUDIT_MODULES,
  type AuditAction,
  type AuditEntityType,
  type AuditModule,
} from "@/features/audit/domain/constants";

export {
  AuditError,
  isAuditError,
  type AuditErrorCode,
} from "@/features/audit/domain/errors";

export {
  AUDIT_ACTION_LABELS,
  AUDIT_MODULE_LABELS,
  labelForAuditAction,
  labelForAuditModule,
} from "@/features/audit/domain/labels";

export {
  buildAuditSummary,
  formatAuditEntityLabel,
} from "@/features/audit/domain/format";

export {
  buildAuditHref,
  hasActiveAuditFilters,
  normalizeAuditFilters,
  parseAuditFiltersFromSearchParams,
  parseAuditPageFromSearchParams,
  type AuditFilterHrefInput,
  type AuditFilterOption,
  type AuditFilterOptions,
  type AuditFilterSearchParams,
  type AuditFilterUserOption,
  type AuditFilters,
} from "@/features/audit/domain/audit-filters";

export {
  toCustomerAuditValues,
  toSettingsAuditValues,
  toUserAuditValues,
} from "@/features/audit/domain/snapshots";

export type {
  AuditLogDetail,
  AuditLogListItem,
  AuditLogListResult,
  AuditLogRecord,
  AuditValues,
  GetAuditLogListOptions,
  RecordAuditEventInput,
} from "@/features/audit/domain/types";

export {
  recordAuditEventSchema,
  type RecordAuditEventSchemaOutput,
} from "@/features/audit/schemas/record-audit-event";

export { auditAction } from "@/features/audit/services/audit-action";
export { recordAuditEvent } from "@/features/audit/services/record-audit-event";
export { getRequestIpAddress } from "@/features/audit/services/get-request-ip-address";
export { getAuditLogList } from "@/features/audit/services/list-audit-logs";
export { getAuditLogDetail } from "@/features/audit/services/get-audit-log-detail";

export { AuditView } from "@/features/audit/components/audit-view";
export { AuditDetailView } from "@/features/audit/components/audit-detail";
export { AuditTable } from "@/features/audit/components/audit-table";
export { AuditFiltersForm } from "@/features/audit/components/audit-filters";
export { AuditEmptyState } from "@/features/audit/components/audit-empty-state";
export { AuditTableSkeleton } from "@/features/audit/components/audit-table-skeleton";
export { AuditValuesPanel } from "@/features/audit/components/audit-values-panel";
