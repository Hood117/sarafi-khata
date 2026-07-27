import type { CustomerHistoryEvent } from "@/features/transactions/domain/types";
import type { TransactionListItem } from "@/features/transactions/domain/types";
import type { HawalaListItem } from "@/features/hawala/domain/types";
import type { ExchangeHistoryListItem } from "@/features/exchange/domain/types";
import type { TransferHistoryListItem } from "@/features/transfers/domain/types";
import type {
  BusinessCashBalance,
  CustomerCurrencyBalance,
} from "@/features/wallets/domain/types";
import type { ReportsFilters } from "@/features/reports/domain/reports-filters";

/** Posted activity counts for a calendar period. */
export type ReportActivityCounts = {
  transactions: number;
  deposits: number;
  withdrawals: number;
  exchanges: number;
  hawala: number;
  transfers: number;
  adjustments: number;
};

export type ReportCurrencyTotal = {
  currencyCode: string;
  /** Formatted major units when summable; otherwise count-only sections omit this. */
  totalDisplay: string;
  count: number;
};

export type ReportCountRow = {
  label: string;
  count: number;
};

export type PeriodActivityReport = {
  title: string;
  periodLabel: string;
  periodStart: string;
  periodEndExclusive: string;
  counts: ReportActivityCounts;
  /** Current business cash (point-in-time; same for daily/monthly snapshots). */
  businessCash: BusinessCashBalance[];
  recentTransactions: TransactionListItem[];
  /** True when counts/rows are empty after filters. */
  isEmpty: boolean;
};

export type CustomerStatementReport = {
  customerId: string;
  customerLabel: string;
  balances: CustomerCurrencyBalance[];
  events: CustomerHistoryEvent[];
  eventTotal: number;
  isEmpty: boolean;
};

export type CustomerStatementOption = {
  id: string;
  label: string;
};

export type ReportOperatorOption = {
  id: string;
  label: string;
};

export type ReportsFilterOptions = {
  customers: CustomerStatementOption[];
  currencies: string[];
  operators: ReportOperatorOption[];
};

export type HawalaReportSummary = {
  periodLabel: string;
  totalCount: number;
  byStatus: ReportCountRow[];
  byDirection: ReportCountRow[];
  byCurrency: ReportCurrencyTotal[];
  rows: HawalaListItem[];
  isEmpty: boolean;
};

export type ExchangeReportSummary = {
  periodLabel: string;
  totalCount: number;
  byPair: ReportCountRow[];
  rows: ExchangeHistoryListItem[];
  isEmpty: boolean;
};

export type TransferReportSummary = {
  periodLabel: string;
  totalCount: number;
  byCurrency: ReportCurrencyTotal[];
  rows: TransferHistoryListItem[];
  isEmpty: boolean;
};

export type ReportsPageMode = "calendar" | "range";

/**
 * Read-only reports page payload. Never posts or writes ledger entries.
 */
export type ReportsPageData = {
  asOfDate: string;
  mode: ReportsPageMode;
  filters: ReportsFilters;
  filterOptions: ReportsFilterOptions;
  hasActiveFilters: boolean;
  daily: PeriodActivityReport | null;
  monthly: PeriodActivityReport | null;
  range: PeriodActivityReport | null;
  customerStatement: CustomerStatementReport | null;
  hawala: HawalaReportSummary;
  exchange: ExchangeReportSummary;
  transfer: TransferReportSummary;
};

export type GetReportsPageDataOptions = {
  filters?: ReportsFilters;
  now?: Date;
  /** Max rows in each summary table (default 15, max 50). */
  tableLimit?: number;
};
