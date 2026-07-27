import type {
  AuditAction,
  AuditEntityType,
  AuditModule,
} from "@/features/audit/domain/constants";
import type {
  AuditFilterOptions,
  AuditFilters,
} from "@/features/audit/domain/audit-filters";

/**
 * JSON-serializable snapshot for before/after audit values.
 * Never include secrets (passwords, hashes, session tokens).
 */
export type AuditValues = Record<string, unknown>;

/**
 * Input for recording a single audit event.
 * All modules should use this shape via {@link recordAuditEvent}.
 */
export type RecordAuditEventInput = {
  /** Actor user id. Null/omitted for unauthenticated events (e.g. failed login). */
  userId?: string | null;
  /** Stable action verb (prefer AUDIT_ACTIONS). */
  action: AuditAction | (string & {});
  /** Owning feature module (prefer AUDIT_MODULES). */
  module: AuditModule | (string & {});
  /** Domain entity kind when applicable (prefer AUDIT_ENTITY_TYPES). */
  entityType?: AuditEntityType | (string & {}) | null;
  /** Primary subject id when applicable. */
  entityId?: string | null;
  /** Client IP when available. */
  ipAddress?: string | null;
  /** Relevant field snapshot before the change. */
  beforeValues?: AuditValues | null;
  /** Relevant field snapshot after the change. */
  afterValues?: AuditValues | null;
};

export type AuditLogRecord = {
  id: string;
  userId: string | null;
  action: string;
  module: string;
  entityType: string | null;
  entityId: string | null;
  ipAddress: string | null;
  beforeValues: AuditValues | null;
  afterValues: AuditValues | null;
  createdAt: Date;
};

/** Row model for the Audit Log list page. */
export type AuditLogListItem = {
  id: string;
  createdAt: string;
  userName: string | null;
  module: string;
  moduleLabel: string;
  action: string;
  actionLabel: string;
  entityLabel: string | null;
  summary: string;
};

export type AuditLogListResult = {
  items: AuditLogListItem[];
  total: number;
  page: number;
  pageSize: number;
  filters: AuditFilters;
  filterOptions: AuditFilterOptions;
};

export type GetAuditLogListOptions = {
  search?: string;
  dateFrom?: string | null;
  dateTo?: string | null;
  userId?: string | null;
  module?: string | null;
  action?: string | null;
  page?: number;
  pageSize?: number;
};

/** Detail model for a single audit event (read-only). */
export type AuditLogDetail = {
  id: string;
  createdAt: string;
  userId: string | null;
  userName: string | null;
  module: string;
  moduleLabel: string;
  action: string;
  actionLabel: string;
  entityType: string | null;
  entityId: string | null;
  entityLabel: string | null;
  ipAddress: string | null;
  summary: string;
  beforeValues: AuditValues | null;
  afterValues: AuditValues | null;
};
