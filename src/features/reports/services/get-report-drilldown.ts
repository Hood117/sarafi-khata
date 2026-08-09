import "server-only";

import { requirePermission } from "@/features/auth/permissions/authorize";
import { formatCustomerLabel } from "@/features/customers/domain/format-customer-label";
import { findCustomerById } from "@/features/customers/repositories/customer-repository";
import { localCalendarDayBounds } from "@/features/dashboard/domain/dashboard-stats";
import { getExchangeHistory } from "@/features/exchange/services/list-exchange-history";
import { getHawalaListItems } from "@/features/hawala/services/list-hawala";
import {
  findCurrencyByCode,
} from "@/features/ledger/repositories/currency-repository";
import { listLedgerEntries } from "@/features/ledger/repositories/ledger-repository";
import {
  filterExchangeItems,
  filterHawalaItems,
  filterTransferItems,
} from "@/features/reports/domain/aggregate-reports";
import {
  localCalendarMonthBounds,
} from "@/features/reports/domain/report-helpers";
import {
  hasCustomDateRange,
  normalizeReportsFilters,
  resolveFilterDateBounds,
  type ReportsFilters,
} from "@/features/reports/domain/reports-filters";
import type { ExchangeHistoryListItem } from "@/features/exchange/domain/types";
import type { HawalaListItem } from "@/features/hawala/domain/types";
import type { TransactionListItem } from "@/features/transactions/domain/types";
import type { TransferHistoryListItem } from "@/features/transfers/domain/types";
import { getTransactionList } from "@/features/transactions/services/list-transactions";
import { getTransferHistory } from "@/features/transfers/services/list-transfer-history";
import { prisma } from "@/server/db";

export type ReportPeriodScope = {
  start: Date;
  end: Date;
  label: string;
};

export type ReportDrilldownContext = {
  filters: ReportsFilters;
  period: ReportPeriodScope;
  operatorLabel: string | null;
  customerLabel: string | null;
  customerFullName: string | null;
};

function resolvePeriodScope(
  filters: ReportsFilters,
  now: Date,
): ReportPeriodScope {
  const customRange = resolveFilterDateBounds(filters);
  if (customRange) {
    return customRange;
  }

  const month = localCalendarMonthBounds(now);
  return {
    start: month.start,
    end: month.end,
    label: month.label,
  };
}

async function resolveOperatorLabel(
  operatorId: string | null,
): Promise<string | null> {
  if (!operatorId) {
    return null;
  }

  const user = await prisma.user.findFirst({
    where: { id: operatorId, isActive: true },
    select: { fullName: true, username: true },
  });

  if (!user) {
    return null;
  }

  return user.fullName.trim() || user.username;
}

async function filterTransactionRowsByCurrency(
  rows: TransactionListItem[],
  currencyCode: string | null,
): Promise<TransactionListItem[]> {
  if (!currencyCode || rows.length === 0) {
    return rows;
  }

  const currency = await findCurrencyByCode(currencyCode, {
    includeDeleted: true,
  });
  if (!currency) {
    return [];
  }

  const entries = await listLedgerEntries({
    transactionIds: rows.map((row) => row.id),
  });
  const matchingIds = new Set<string>();
  for (const entry of entries) {
    if (entry.currencyId === currency.id) {
      matchingIds.add(entry.transactionId);
    }
  }

  return rows.filter((row) => matchingIds.has(row.id));
}

/**
 * Shared filter/period context for report drill-in pages.
 * Read-only — never posts money.
 */
export async function getReportDrilldownContext(
  filtersInput: ReportsFilters,
  now: Date = new Date(),
): Promise<ReportDrilldownContext> {
  await requirePermission("reports.view");

  const filters = normalizeReportsFilters(filtersInput);
  const period = resolvePeriodScope(filters, now);
  const [operatorLabel, customer] = await Promise.all([
    resolveOperatorLabel(filters.operatorId),
    filters.customerId
      ? findCustomerById(filters.customerId, { includeDeleted: true })
      : Promise.resolve(null),
  ]);

  return {
    filters,
    period,
    operatorLabel,
    customerLabel: customer
      ? formatCustomerLabel(customer.fullName, customer.code)
      : null,
    customerFullName: customer?.fullName.trim().toLowerCase() ?? null,
  };
}

export async function getReportTransactionDrilldown(
  filtersInput: ReportsFilters,
): Promise<{
  context: ReportDrilldownContext;
  transactions: TransactionListItem[];
}> {
  const context = await getReportDrilldownContext(filtersInput);
  const { filters, period } = context;

  const rows = await getTransactionList({
    status: "POSTED",
    valueDateFrom: period.start,
    valueDateTo: period.end,
    ...(filters.customerId ? { customerId: filters.customerId } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.operatorId ? { createdById: filters.operatorId } : {}),
  });

  const transactions = await filterTransactionRowsByCurrency(
    rows,
    filters.currencyCode,
  );

  return { context, transactions };
}

export async function getReportHawalaDrilldown(
  filtersInput: ReportsFilters,
): Promise<{
  context: ReportDrilldownContext;
  transfers: HawalaListItem[];
}> {
  const context = await getReportDrilldownContext(filtersInput);
  const { filters, period, operatorLabel, customerFullName } = context;
  const items = await getHawalaListItems({
    valueDateFrom: period.start,
    valueDateTo: period.end,
  });

  const transfers = filterHawalaItems(
    items.filter((item) => {
      if (!customerFullName) {
        return true;
      }
      return (
        item.senderName.trim().toLowerCase() === customerFullName ||
        item.receiverName.trim().toLowerCase() === customerFullName
      );
    }),
    filters,
    operatorLabel,
  );

  return { context, transfers };
}

export async function getReportExchangeDrilldown(
  filtersInput: ReportsFilters,
): Promise<{
  context: ReportDrilldownContext;
  exchanges: ExchangeHistoryListItem[];
}> {
  const context = await getReportDrilldownContext(filtersInput);
  const { filters, period, operatorLabel, customerLabel } = context;
  const items = await getExchangeHistory({
    valueDateFrom: period.start,
    valueDateTo: period.end,
    take: 50,
  });

  const exchanges = filterExchangeItems(
    items.filter((item) => {
      if (!customerLabel) {
        return true;
      }
      return item.customerName === customerLabel;
    }),
    filters,
    operatorLabel,
  );

  return { context, exchanges };
}

export async function getReportTransferDrilldown(
  filtersInput: ReportsFilters,
): Promise<{
  context: ReportDrilldownContext;
  transfers: TransferHistoryListItem[];
}> {
  const context = await getReportDrilldownContext(filtersInput);
  const { filters, period, operatorLabel, customerLabel } = context;
  const items = await getTransferHistory({
    valueDateFrom: period.start,
    valueDateTo: period.end,
    take: 50,
  });

  const transfers = filterTransferItems(
    items.filter((item) => {
      if (!customerLabel) {
        return true;
      }
      return (
        item.senderName === customerLabel || item.receiverName === customerLabel
      );
    }),
    filters,
    operatorLabel,
  );

  return { context, transfers };
}

export function defaultPeriodLabelForFilters(
  filters: ReportsFilters,
  now: Date = new Date(),
): string {
  if (hasCustomDateRange(filters)) {
    return resolveFilterDateBounds(filters)?.label ?? "Selected period";
  }
  if (!filters.dateFrom && !filters.dateTo) {
    // Drill-in defaults to current month when no explicit range (same as specialty reports).
    return localCalendarMonthBounds(now).label;
  }
  return localCalendarDayBounds(now).dateOnly;
}
