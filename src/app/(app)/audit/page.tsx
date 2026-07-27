import { getAuditLogList, AuditView } from "@/features/audit";
import {
  parseAuditFiltersFromSearchParams,
  parseAuditPageFromSearchParams,
} from "@/features/audit/domain/audit-filters";

type AuditPageProps = {
  searchParams: Promise<{
    q?: string | string[];
    from?: string | string[];
    to?: string | string[];
    user?: string | string[];
    module?: string | string[];
    action?: string | string[];
    page?: string | string[];
  }>;
};

export default async function AuditLogsPage({ searchParams }: AuditPageProps) {
  const params = await searchParams;
  const filters = parseAuditFiltersFromSearchParams(params);
  const page = parseAuditPageFromSearchParams(params);

  const result = await getAuditLogList({
    search: filters.search,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    userId: filters.userId,
    module: filters.module,
    action: filters.action,
    page,
  });

  return <AuditView result={result} />;
}
