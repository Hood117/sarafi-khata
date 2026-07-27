import "server-only";

import { formatCustomerLabel } from "@/features/customers/domain/format-customer-label";
import { findCustomerById } from "@/features/customers/repositories/customer-repository";
import { getCustomerList } from "@/features/customers/services/list-customers";
import { localCalendarDayBounds } from "@/features/dashboard/domain/dashboard-stats";
import { getExchangeHistory } from "@/features/exchange/services/list-exchange-history";
import { getHawalaList } from "@/features/hawala/services/list-hawala";
import {
  findCurrencyByCode,
  listCurrencies,
} from "@/features/ledger/repositories/currency-repository";
import { listLedgerEntries } from "@/features/ledger/repositories/ledger-repository";
import {
  buildExchangeReportSummary,
  buildHawalaReportSummary,
  buildTransferReportSummary,
  filterExchangeItems,
  filterHawalaItems,
  filterTransferItems,
} from "@/features/reports/domain/aggregate-reports";
import {
  isIsoInPeriod,
  localCalendarMonthBounds,
  normalizeTableLimit,
  toActivityCounts,
} from "@/features/reports/domain/report-helpers";
import {
  hasActiveReportsFilters,
  hasCustomDateRange,
  normalizeReportsFilters,
  resolveFilterDateBounds,
  type ReportsFilters,
} from "@/features/reports/domain/reports-filters";
import type {
  GetReportsPageDataOptions,
  PeriodActivityReport,
  ReportsPageData,
} from "@/features/reports/domain/types";
import { listTransactionTypes } from "@/features/transactions/repositories/transaction-repository";
import { getCustomerHistory } from "@/features/transactions/services/get-customer-history";
import { getTransactionList } from "@/features/transactions/services/list-transactions";
import type { TransactionListItem } from "@/features/transactions/domain/types";
import { getTransferHistory } from "@/features/transfers/services/list-transfer-history";
import { getBusinessCashBalances } from "@/features/wallets/services/get-business-cash-balances";
import { getCustomerCurrencyBalances } from "@/features/wallets/services/get-customer-wallets";
import { prisma } from "@/server/db";

type PostedTxnFilter = {
  status: "POSTED";
  valueDateFrom: Date;
  valueDateTo: Date;
  customerId?: string;
  type?: NonNullable<ReportsFilters["type"]>;
  createdById?: string;
};

function toPostedTxnFilter(
  start: Date,
  end: Date,
  filters: ReportsFilters,
): PostedTxnFilter {
  return {
    status: "POSTED",
    valueDateFrom: start,
    valueDateTo: end,
    ...(filters.customerId ? { customerId: filters.customerId } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.operatorId ? { createdById: filters.operatorId } : {}),
  };
}

async function filterRowsByCurrency(
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

async function buildPeriodActivityReport(input: {
  title: string;
  periodLabel: string;
  start: Date;
  end: Date;
  filters: ReportsFilters;
  tableLimit: number;
  businessCash: Awaited<ReturnType<typeof getBusinessCashBalances>>;
}): Promise<PeriodActivityReport> {
  const baseFilter = toPostedTxnFilter(input.start, input.end, input.filters);

  if (input.filters.currencyCode) {
    const allRows = await getTransactionList(baseFilter);
    const currencyFiltered = await filterRowsByCurrency(
      allRows,
      input.filters.currencyCode,
    );
    const recentTransactions = currencyFiltered.slice(0, input.tableLimit);

    return {
      title: input.title,
      periodLabel: input.periodLabel,
      periodStart: input.start.toISOString(),
      periodEndExclusive: input.end.toISOString(),
      counts: toActivityCounts(currencyFiltered.map((row) => row.type)),
      businessCash: input.businessCash,
      recentTransactions,
      isEmpty: currencyFiltered.length === 0,
    };
  }

  const [types, recentTransactions] = await Promise.all([
    listTransactionTypes(baseFilter),
    getTransactionList({ ...baseFilter, take: input.tableLimit }),
  ]);

  return {
    title: input.title,
    periodLabel: input.periodLabel,
    periodStart: input.start.toISOString(),
    periodEndExclusive: input.end.toISOString(),
    counts: toActivityCounts(types),
    businessCash: input.businessCash,
    recentTransactions,
    isEmpty: types.length === 0,
  };
}

/**
 * Central read-only reports payload with URL-driven filters.
 * Composes existing list/history/balance readers — never posts money.
 */
export async function getReportsPageData(
  options: GetReportsPageDataOptions = {},
): Promise<ReportsPageData> {
  const now = options.now ?? new Date();
  const tableLimit = normalizeTableLimit(options.tableLimit);
  const filters = normalizeReportsFilters(options.filters ?? {});
  const day = localCalendarDayBounds(now);
  const month = localCalendarMonthBounds(now);
  const customRange = resolveFilterDateBounds(filters);
  const mode = hasCustomDateRange(filters) ? "range" : "calendar";

  const [
    businessCash,
    customers,
    currencies,
    users,
    hawalaItems,
    exchangeItems,
    transferItems,
    statementCustomer,
  ] = await Promise.all([
    getBusinessCashBalances(),
    getCustomerList({ archiveFilter: "active" }),
    listCurrencies({ includeDeleted: false }),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, fullName: true, username: true },
      orderBy: { fullName: "asc" },
    }),
    getHawalaList(),
    getExchangeHistory(),
    getTransferHistory(),
    filters.customerId
      ? findCustomerById(filters.customerId, { includeDeleted: true })
      : Promise.resolve(null),
  ]);

  const filterOptions = {
    customers: customers.map((customer) => ({
      id: customer.id,
      label: formatCustomerLabel(customer.fullName, customer.code),
    })),
    currencies: currencies
      .filter((currency) => currency.isActive && currency.deletedAt === null)
      .map((currency) => currency.code)
      .sort((left, right) => left.localeCompare(right)),
    operators: users.map((user) => ({
      id: user.id,
      label: user.fullName.trim() || user.username,
    })),
  };

  const operatorLabel =
    filterOptions.operators.find((operator) => operator.id === filters.operatorId)
      ?.label ?? null;

  const customerLabel = statementCustomer
    ? formatCustomerLabel(statementCustomer.fullName, statementCustomer.code)
    : null;
  const customerFullName = statementCustomer?.fullName.trim().toLowerCase() ?? null;

  const periodScope = customRange ?? {
    start: month.start,
    end: month.end,
    label: month.label,
  };

  let daily: PeriodActivityReport | null = null;
  let monthly: PeriodActivityReport | null = null;
  let range: PeriodActivityReport | null = null;

  if (mode === "range" && customRange) {
    range = await buildPeriodActivityReport({
      title: "Filtered Activity",
      periodLabel: customRange.label,
      start: customRange.start,
      end: customRange.end,
      filters,
      tableLimit,
      businessCash,
    });
  } else {
    [daily, monthly] = await Promise.all([
      buildPeriodActivityReport({
        title: "Daily Report",
        periodLabel: day.dateOnly,
        start: day.start,
        end: day.end,
        filters,
        tableLimit,
        businessCash,
      }),
      buildPeriodActivityReport({
        title: "Monthly Report",
        periodLabel: month.label,
        start: month.start,
        end: month.end,
        filters,
        tableLimit,
        businessCash,
      }),
    ]);
  }

  const hawalaScoped = hawalaItems.filter((item) =>
    isIsoInPeriod(item.valueDate, periodScope.start, periodScope.end),
  );
  const exchangeScoped = exchangeItems.filter((item) =>
    isIsoInPeriod(item.valueDate, periodScope.start, periodScope.end),
  );
  const transferScoped = transferItems.filter((item) =>
    isIsoInPeriod(item.valueDate, periodScope.start, periodScope.end),
  );

  const hawalaForReport = filterHawalaItems(
    hawalaScoped.filter((item) => {
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

  const exchangeFiltered = filterExchangeItems(
    exchangeScoped.filter((item) => {
      if (!customerLabel) {
        return true;
      }
      return item.customerName === customerLabel;
    }),
    filters,
    operatorLabel,
  );

  const transferFiltered = filterTransferItems(
    transferScoped.filter((item) => {
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

  let customerStatement: ReportsPageData["customerStatement"] = null;

  if (filters.customerId && statementCustomer) {
    const operatorFilterActive = Boolean(operatorLabel);
    const historyOptions = {
      page: 1,
      // When filtering by operator in-memory, load the max page so totals aren't
      // computed from an already-truncated, unfiltered operator slice.
      pageSize: operatorFilterActive ? 100 : tableLimit,
      sort: "newest" as const,
      ...(filters.dateFrom ? { dateFrom: filters.dateFrom } : {}),
      ...(filters.dateTo ? { dateTo: filters.dateTo } : {}),
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.currencyCode ? { currencyCode: filters.currencyCode } : {}),
    };

    const [history, balances] = await Promise.all([
      getCustomerHistory(filters.customerId, historyOptions),
      getCustomerCurrencyBalances(filters.customerId, {
        includeArchived: true,
      }),
    ]);

    const filteredEvents = operatorLabel
      ? history.events.filter(
          (event) => (event.operatorName ?? "").trim() === operatorLabel,
        )
      : history.events;

    customerStatement = {
      customerId: statementCustomer.id,
      customerLabel: formatCustomerLabel(
        statementCustomer.fullName,
        statementCustomer.code,
      ),
      balances: filters.currencyCode
        ? balances.filter(
            (balance) => balance.currencyCode === filters.currencyCode,
          )
        : balances,
      events: filteredEvents.slice(0, tableLimit),
      eventTotal: operatorFilterActive
        ? filteredEvents.length
        : history.total,
      isEmpty: filteredEvents.length === 0,
    };
  }

  return {
    asOfDate: day.dateOnly,
    mode,
    filters,
    filterOptions,
    hasActiveFilters: hasActiveReportsFilters(filters),
    daily,
    monthly,
    range,
    customerStatement,
    hawala: buildHawalaReportSummary(
      hawalaForReport,
      periodScope.label,
      tableLimit,
    ),
    exchange: buildExchangeReportSummary(
      exchangeFiltered,
      periodScope.label,
      tableLimit,
    ),
    transfer: buildTransferReportSummary(
      transferFiltered,
      periodScope.label,
      tableLimit,
    ),
  };
}
