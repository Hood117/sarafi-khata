import { Typography } from "@/design-system/typography";
import { AuditFiltersForm } from "@/features/audit/components/audit-filters";
import { AuditTable } from "@/features/audit/components/audit-table";
import {
  buildAuditHref,
  hasActiveAuditFilters,
} from "@/features/audit/domain/audit-filters";
import type { AuditLogListResult } from "@/features/audit/domain/types";

type AuditViewProps = {
  result: AuditLogListResult;
  /** When true, omit the page-level title (used inside Settings tabs). */
  embedded?: boolean;
};

export function AuditView({ result, embedded = false }: AuditViewProps) {
  const filterKey = [
    result.filters.search,
    result.filters.dateFrom ?? "",
    result.filters.dateTo ?? "",
    result.filters.userId ?? "",
    result.filters.module ?? "",
    result.filters.action ?? "",
  ].join("|");

  return (
    <div className="space-y-2">
      {embedded ? null : (
        <div className="space-y-2">
          <Typography variant="h3" as="h2">
            Audit Logs
          </Typography>
          <Typography variant="muted">
            Read-only system activity history. Separate from the financial
            ledger.
          </Typography>
        </div>
      )}

      <AuditFiltersForm
        key={filterKey}
        filters={result.filters}
        options={result.filterOptions}
      />
      <AuditTable
        items={result.items}
        total={result.total}
        page={result.page}
        pageSize={result.pageSize}
        filters={result.filters}
        hasFilters={hasActiveAuditFilters(result.filters)}
        returnTo={buildAuditHref({
          ...result.filters,
          page: result.page,
        })}
      />
    </div>
  );
}
