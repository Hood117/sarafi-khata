/**
 * Public API for the reports feature.
 * Import from this module only — do not reach into internal folders.
 *
 * Reports are read-only. They never post transactions or write ledger entries.
 */

export type {
  CustomerStatementOption,
  CustomerStatementReport,
  ExchangeReportSummary,
  GetReportsPageDataOptions,
  HawalaReportSummary,
  PeriodActivityReport,
  ReportActivityCounts,
  ReportCountRow,
  ReportCurrencyTotal,
  ReportOperatorOption,
  ReportsFilterOptions,
  ReportsPageData,
  ReportsPageMode,
  TransferReportSummary,
} from "@/features/reports/domain/types";

export type {
  ReportsFilterHrefInput,
  ReportsFilterSearchParams,
  ReportsFilters,
} from "@/features/reports/domain/reports-filters";

export type {
  ReportExportColumn,
  ReportExportRow,
} from "@/features/reports/domain/report-export";

export {
  buildReportsHref,
  hasActiveReportsFilters,
  hasCustomDateRange,
  inclusiveDateFiltersFromBounds,
  normalizeReportsFilters,
  parseReportsFiltersFromSearchParams,
  resolveFilterDateBounds,
  toLocalDateOnly,
} from "@/features/reports/domain/reports-filters";

export { matchesReportSearch } from "@/features/reports/domain/report-search";
export { REPORT_CARDS } from "@/features/reports/domain/report-catalog";

export {
  formatMajorTotal,
  isIsoInPeriod,
  localCalendarMonthBounds,
  normalizeTableLimit,
  parseMajorAmountDisplay,
  takeLatestByDate,
  toActivityCounts,
} from "@/features/reports/domain/report-helpers";

export { getReportsPageData } from "@/features/reports/services/get-reports-page-data";
export {
  getReportDrilldownContext,
  getReportExchangeDrilldown,
  getReportHawalaDrilldown,
  getReportTransactionDrilldown,
  getReportTransferDrilldown,
} from "@/features/reports/services/get-report-drilldown";

export { ReportsView } from "@/features/reports/components/reports-view";
export { ReportsSkeleton } from "@/features/reports/components/reports-skeleton";
export { ReportsFiltersForm } from "@/features/reports/components/reports-filters";
export { ReportEmptyState } from "@/features/reports/components/report-empty-state";
export { ReportDetailShell } from "@/features/reports/components/report-detail-shell";
export { ReportScreenToolbar } from "@/features/reports/components/report-screen-toolbar";
export { PeriodActivityReportSection } from "@/features/reports/components/period-activity-report-section";
export {
  OpenCustomerProfileButton,
  ReportListDetailLayout,
  ReportTransactionsDetailView,
} from "@/features/reports/components/report-drilldown-views";
export {
  ReportViewAllLink,
  buildPeriodTransactionsDrilldownHref,
} from "@/features/reports/components/report-view-all-link";
