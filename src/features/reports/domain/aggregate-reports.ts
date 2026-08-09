import { HAWALA_DIRECTION_LABELS, HAWALA_STATUS_LABELS } from "@/features/hawala/domain/labels";
import type { HawalaListItem } from "@/features/hawala/domain/types";
import type { ExchangeHistoryListItem } from "@/features/exchange/domain/types";
import type { TransferHistoryListItem } from "@/features/transfers/domain/types";
import {
  formatMajorTotal,
  parseMajorAmountDisplay,
  takeLatestByDate,
} from "@/features/reports/domain/report-helpers";
import type { ReportsFilters } from "@/features/reports/domain/reports-filters";
import type {
  ExchangeReportSummary,
  HawalaReportSummary,
  ReportCountRow,
  ReportCurrencyTotal,
  TransferReportSummary,
} from "@/features/reports/domain/types";

function sumByCurrency(
  rows: readonly { currencyCode: string; amountDisplay: string }[],
): ReportCurrencyTotal[] {
  const totals = new Map<string, { total: number; count: number }>();

  for (const row of rows) {
    const code = row.currencyCode.trim() || "—";
    const amount = parseMajorAmountDisplay(row.amountDisplay);
    const current = totals.get(code) ?? { total: 0, count: 0 };
    current.count += 1;
    if (amount != null) {
      current.total += amount;
    }
    totals.set(code, current);
  }

  return [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currencyCode, value]) => ({
      currencyCode,
      count: value.count,
      totalDisplay: formatMajorTotal(value.total),
    }));
}

function countRowsFromMap(map: Map<string, number>): ReportCountRow[] {
  return [...map.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([label, count]) => ({ label, count }));
}

function matchesOperatorName(
  operatorName: string | null | undefined,
  operatorLabel: string | null,
): boolean {
  if (!operatorLabel) {
    return true;
  }
  return (operatorName ?? "").trim() === operatorLabel;
}

function matchesCurrencyCode(
  code: string | null | undefined,
  currencyCode: string | null,
): boolean {
  if (!currencyCode) {
    return true;
  }
  return (code ?? "").trim().toUpperCase() === currencyCode;
}

export function filterHawalaItems(
  items: readonly HawalaListItem[],
  filters: ReportsFilters,
  operatorLabel: string | null,
): HawalaListItem[] {
  return items.filter((item) => {
    if (filters.type && filters.type !== "HAWALA") {
      return false;
    }
    if (!matchesCurrencyCode(item.currencyCode, filters.currencyCode)) {
      return false;
    }
    if (!matchesOperatorName(item.operatorName, operatorLabel)) {
      return false;
    }
    return true;
  });
}

export function filterExchangeItems(
  items: readonly ExchangeHistoryListItem[],
  filters: ReportsFilters,
  operatorLabel: string | null,
): ExchangeHistoryListItem[] {
  return items.filter((item) => {
    if (filters.type && filters.type !== "EXCHANGE") {
      return false;
    }
    if (
      filters.currencyCode &&
      item.fromCurrencyCode !== filters.currencyCode &&
      item.toCurrencyCode !== filters.currencyCode
    ) {
      return false;
    }
    if (!matchesOperatorName(item.operatorName, operatorLabel)) {
      return false;
    }
    return true;
  });
}

export function filterTransferItems(
  items: readonly TransferHistoryListItem[],
  filters: ReportsFilters,
  operatorLabel: string | null,
): TransferHistoryListItem[] {
  return items.filter((item) => {
    if (filters.type && filters.type !== "TRANSFER") {
      return false;
    }
    if (!matchesCurrencyCode(item.currencyCode, filters.currencyCode)) {
      return false;
    }
    if (!matchesOperatorName(item.operatorName, operatorLabel)) {
      return false;
    }
    return true;
  });
}

export function buildHawalaReportSummary(
  items: readonly HawalaListItem[],
  periodLabel: string,
  tableLimit: number,
): HawalaReportSummary {
  const byStatus = new Map<string, number>();
  const byDirection = new Map<string, number>();

  for (const item of items) {
    const statusLabel = HAWALA_STATUS_LABELS[item.status] ?? item.statusLabel;
    byStatus.set(statusLabel, (byStatus.get(statusLabel) ?? 0) + 1);

    const directionLabel =
      HAWALA_DIRECTION_LABELS[item.direction] ?? item.direction;
    byDirection.set(
      directionLabel,
      (byDirection.get(directionLabel) ?? 0) + 1,
    );
  }

  return {
    periodLabel,
    totalCount: items.length,
    byStatus: countRowsFromMap(byStatus),
    byDirection: countRowsFromMap(byDirection),
    byCurrency: sumByCurrency(items),
    rows: takeLatestByDate(items, tableLimit),
    isEmpty: items.length === 0,
  };
}

export function buildExchangeReportSummary(
  items: readonly ExchangeHistoryListItem[],
  periodLabel: string,
  tableLimit: number,
): ExchangeReportSummary {
  const byPair = new Map<string, number>();

  for (const item of items) {
    const pair = `${item.fromCurrencyCode} → ${item.toCurrencyCode}`;
    byPair.set(pair, (byPair.get(pair) ?? 0) + 1);
  }

  return {
    periodLabel,
    totalCount: items.length,
    byPair: countRowsFromMap(byPair),
    rows: takeLatestByDate(items, tableLimit),
    isEmpty: items.length === 0,
  };
}

export function buildTransferReportSummary(
  items: readonly TransferHistoryListItem[],
  periodLabel: string,
  tableLimit: number,
): TransferReportSummary {
  return {
    periodLabel,
    totalCount: items.length,
    byCurrency: sumByCurrency(items),
    rows: takeLatestByDate(items, tableLimit),
    isEmpty: items.length === 0,
  };
}
