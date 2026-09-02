import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import {
  getCashFlowReport,
  getCustomerStatementReport,
  getDailyReport,
  getExchangePeriodReport,
  getHawalaStatusReport,
  getMonthlyReport,
  getMovementSumReport,
  getPartnerSarafiReport,
  getProfitLossReport,
  getReportsOverview,
  getTransactionsReport,
  listCurrenciesPage,
  listCustomersPage,
  listDebtorsCreditors,
  listEmployeeSalaryPayments,
  listPartners,
  type CashFlowReport,
  type CurrencyListItem,
  type CustomerListItem,
  type CustomerStatementReport,
  type DailyReport,
  type DayCurrencyPosition,
  type DebtorCreditorPage,
  type EmployeeSalaryMonthTotal,
  type EmployeeSalaryPaymentRow,
  type ExchangePeriodReport,
  type HawalaReportPage,
  type MonthlyReport,
  type MovementSumReport,
  type PartnerListItem,
  type PartnerSarafiReport,
  type ProfitLossReport,
  type ReportCurrencyAmount,
  type ReportsOverview,
  type TransactionsReportPage,
} from "@desktop/api";
import { TransactionDetailModal, useTransactionDetailModal } from "@desktop/components/transaction-detail-modal";
import {
  ExchangeDealDetailModal,
  useExchangeDealDetailModal,
} from "@desktop/components/exchange-deal-detail-modal";
import { TransactionLine } from "@desktop/components/transaction-line";
import { CurrencyFilter } from "@desktop/ui/currency-filter";
import { CurrencyPicker } from "@desktop/ui/currency-picker";
import {
  IconCapital,
  IconCash,
  IconCustomers,
  IconDaybook,
  IconDebtorsCreditors,
  IconEmployees,
  IconExchange,
  IconHawala,
  IconHistory,
  IconPartners,
  IconReports,
  IconTransactions,
} from "@desktop/icons";
import { useLocale, useT } from "@desktop/i18n";
import { errorMessage } from "@desktop/lib/datetime";
import { addCalendarDays, todayIso } from "@desktop/lib/datetime";
import {
  exportTable,
  printReportSheet,
  type ExportColumn,
  type ExportRow,
} from "@desktop/lib/export-table";
import { formatTransactionLine } from "@desktop/lib/format-transaction-line";
import { statusLabel } from "@desktop/lib/i18n-labels";
import { txDisplayRef } from "@desktop/lib/tx-ref";
import { pickDefaultCurrency } from "@desktop/lib/default-currency";
import { Pagination } from "@desktop/ui/pagination";
import { PageLoadError } from "@desktop/ui/page-load-error";
import { CurrencyCodeWithFlag } from "@desktop/ui/currency-flag";
import { SearchableSelect, type SearchableSelectOption } from "@desktop/ui/searchable-select";

type ReportId =
  | "hub"
  | "overview"
  | "daily"
  | "monthly"
  | "cash-flow"
  | "profit-loss"
  | "hawala"
  | "exchange"
  | "customer-statement"
  | "transactions"
  | "partners"
  | "debtors"
  | "employees"
  | "movement-sums";

type HawalaReportView = "sums" | "list";

type ProfitPeriodPreset =
  | "today"
  | "yesterday"
  | "week"
  | "month"
  | "year"
  | "custom";

type ReportIcon = (props: { className?: string; title?: string }) => ReactNode;

type ReportMeta = {
  id: Exclude<ReportId, "hub">;
  title: string;
  blurb: string;
  tone: string;
  Icon: ReportIcon;
};

type ExportPayload = {
  filename: string;
  columns: ExportColumn[];
  rows: ExportRow[];
  title: string;
  period?: string;
};

type MoneyFlow = "in" | "out" | "neutral";

function monthStart(isoDay: string): string {
  return `${isoDay.slice(0, 7)}-01`;
}

function yearStart(isoDay: string): string {
  return `${isoDay.slice(0, 4)}-01-01`;
}

/** Monday of the ISO calendar week containing `isoDay` (local). */
function weekStartMonday(isoDay: string): string {
  const [y, m, d] = isoDay.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = dt.getDay(); // 0=Sun … 6=Sat
  const delta = dow === 0 ? -6 : 1 - dow;
  dt.setDate(dt.getDate() + delta);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function profitPeriodRange(
  preset: Exclude<ProfitPeriodPreset, "custom">,
  today: string,
): { from: string; to: string } {
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const y = addCalendarDays(today, -1);
      return { from: y, to: y };
    }
    case "week": {
      const from = weekStartMonday(today);
      return { from, to: addCalendarDays(from, 6) };
    }
    case "month":
      return { from: monthStart(today), to: today };
    case "year":
      return { from: yearStart(today), to: today };
  }
}

function formatWhen(value: string): string {
  if (!value) return "—";
  return value.length >= 19 ? value.slice(0, 19) : value.slice(0, 10);
}

function formatAmountsList(rows: ReportCurrencyAmount[]): string {
  if (!rows.length) return "—";
  return rows
    .map((r) => `${r.amount} ${r.currencySymbol?.trim() || r.currencyCode}`)
    .join(" · ");
}

function MoneyText({
  amount,
  currency,
  flow = "neutral",
}: {
  amount: string;
  /** ISO 4217 code — shows flag + code after the amount when set. */
  currency?: string | null;
  flow?: MoneyFlow;
}) {
  const code = currency?.trim().toUpperCase();
  return (
    <span className={`money money-${flow} report-money-inline`}>
      <span>{amount}</span>
      {code ? (
        <>
          {" "}
          <CurrencyCodeWithFlag code={code} className="report-money-currency" />
        </>
      ) : null}
    </span>
  );
}

/** Currency column: flag + ISO code, optional symbol in muted text. */
function ReportCurrencyCell({
  code,
  symbol,
}: {
  code: string;
  symbol?: string | null;
}) {
  return (
    <span className="report-currency-cell">
      <CurrencyCodeWithFlag code={code} />
      {symbol?.trim() ? (
        <span className="muted report-currency-symbol"> ({symbol.trim()})</span>
      ) : null}
    </span>
  );
}

function AmountList({
  rows,
  flow = "neutral",
}: {
  rows: ReportCurrencyAmount[];
  flow?: MoneyFlow;
}) {
  if (!rows.length) return <span className="muted">—</span>;
  return (
    <ReportSummaryList
      items={rows.map((r) => ({
        id: r.currencyCode,
        label: <CurrencyCodeWithFlag code={r.currencyCode} />,
        value: <MoneyText amount={r.amount} flow={flow} />,
        flow,
      }))}
    />
  );
}

function amountFlow(amount: string, fallback: MoneyFlow = "neutral"): MoneyFlow {
  const n = Number(String(amount).replace(/,/g, "").trim());
  if (!Number.isFinite(n) || n === 0) return fallback === "neutral" ? "neutral" : fallback;
  if (n < 0) return "out";
  if (fallback === "out") return "out";
  return "in";
}

function ProfitLossLineAmounts({
  rows,
  flow,
}: {
  rows: ReportCurrencyAmount[];
  flow: MoneyFlow;
}) {
  if (!rows.length) {
    return <span className="muted">—</span>;
  }
  return (
    <div className="pl-line-amounts">
      {rows.map((r) => {
        const lineFlow = flow === "neutral" ? amountFlow(r.amount) : flow;
        return (
          <MoneyText
            key={r.currencyCode}
            amount={r.amount}
            currency={r.currencyCode}
            flow={lineFlow}
          />
        );
      })}
    </div>
  );
}

type ProfitLossLine = {
  key: string;
  label: string;
  rows: ReportCurrencyAmount[];
  flow: MoneyFlow;
  emphasis?: boolean;
};

function ProfitLossStatement({
  lines,
  emptyLabel,
}: {
  lines: ProfitLossLine[];
  emptyLabel: string;
}) {
  const hasAny = lines.some((l) => l.rows.length > 0);
  if (!hasAny) {
    return <p className="muted">{emptyLabel}</p>;
  }
  return (
    <div className="pl-statement" role="list">
      {lines.map((line) => (
        <div
          key={line.key}
          className={
            line.emphasis
              ? `pl-statement-row pl-statement-row-${line.flow} pl-statement-net`
              : `pl-statement-row pl-statement-row-${line.flow}`
          }
          role="listitem"
        >
          <div className="pl-statement-label">{line.label}</div>
          <ProfitLossLineAmounts rows={line.rows} flow={line.flow} />
        </div>
      ))}
    </div>
  );
}

function FlowTag({ flow, children }: { flow: MoneyFlow; children: ReactNode }) {
  return <span className={`flow-tag flow-tag-${flow}`}>{children}</span>;
}

function ReportSummaryList({
  items,
}: {
  items: Array<{ id?: string; label: ReactNode; value: ReactNode; flow?: MoneyFlow }>;
}) {
  if (!items.length) return null;
  return (
    <div className="report-summary-list" role="list">
      {items.map((item, idx) => (
        <div
          key={item.id ?? `summary-${idx}`}
          className={`report-summary-row${item.flow ? ` report-summary-${item.flow}` : ""}`}
          role="listitem"
        >
          <span className="report-summary-label">{item.label}</span>
          <span className="report-summary-value">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function ReportSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="report-section">
      <div className="report-section-head">
        <h3>{title}</h3>
        {hint ? <p className="muted">{hint}</p> : null}
      </div>
      <div className="report-section-body">{children}</div>
    </section>
  );
}

function clickableRowProps(onOpen: () => void) {
  return {
    className: "is-clickable",
    onClick: onOpen,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onOpen();
      }
    },
    tabIndex: 0,
    role: "button" as const,
  };
}

function PositionsTable({ rows }: { rows: DayCurrencyPosition[] }) {
  const t = useT();
  if (!rows.length) return <p className="muted report-empty">{t.reports.noBalances}</p>;
  return (
    <div className="report-table-wrap"><table className="report-ledger">
      <thead>
        <tr>
          <th>{t.common.currency}</th>
          <th className="col-amount">{t.desk.openingBalance}</th>
          <th className="col-amount">{t.desk.moneyComingIn}</th>
          <th className="col-amount">{t.desk.moneyGoingOut}</th>
          <th className="col-amount">{t.desk.netMovement}</th>
          <th className="col-amount">{t.desk.closingBalance}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.currencyCode}>
            <td>
              <ReportCurrencyCell code={r.currencyCode} symbol={r.currencySymbol} />
            </td>
            <td className="col-amount">
              <MoneyText amount={r.opening} flow="neutral" />
            </td>
            <td className="col-amount">
              <MoneyText amount={r.moneyIn} flow="in" />
            </td>
            <td className="col-amount">
              <MoneyText amount={r.moneyOut} flow="out" />
            </td>
            <td className="col-amount">
              <MoneyText amount={r.net} flow="neutral" />
            </td>
            <td className="col-amount">
              <MoneyText amount={r.closing} flow="neutral" />
            </td>
          </tr>
        ))}
      </tbody>
    </table></div>
  );
}

function CurrencySumBoxes({
  title,
  hint,
  rows,
  flow,
  emptyLabel,
}: {
  title: string;
  hint?: string;
  rows: ReportCurrencyAmount[];
  flow: MoneyFlow;
  emptyLabel: string;
}) {
  return (
    <ReportSection title={title} hint={hint}>
      {rows.length === 0 ? (
        <p className="muted report-empty">{emptyLabel}</p>
      ) : (
        <ReportSummaryList
          items={rows.map((r) => ({
            id: r.currencyCode,
            label: <CurrencyCodeWithFlag code={r.currencyCode} />,
            value: <span className={`money money-${flow}`}>{r.amount}</span>,
            flow,
          }))}
        />
      )}
    </ReportSection>
  );
}

function CountGrid({
  items,
}: {
  items: Array<{ id?: string; label: ReactNode; value: number | string | ReactNode }>;
}) {
  return (
    <ReportSummaryList
      items={items.map((item, idx) => ({
        id: item.id ?? `count-${idx}`,
        label: item.label,
        value: item.value,
        flow: "neutral",
      }))}
    />
  );
}

function ReportToolbar({
  onPrint,
  onCsv,
  onPdf,
}: {
  onPrint?: () => void;
  onCsv?: () => void;
  onPdf?: () => void;
}) {
  const t = useT();
  return (
    <div className="report-toolbar">
      {onPrint ? (
        <button type="button" className="btn" onClick={onPrint}>
          {t.common.print}
        </button>
      ) : null}
      {onCsv ? (
        <button type="button" className="btn" onClick={onCsv}>
          {t.desk.exportCsv}
        </button>
      ) : null}
      {onPdf ? (
        <button type="button" className="btn" onClick={onPdf}>
          PDF
        </button>
      ) : null}
    </div>
  );
}

function OverviewBody({
  data,
  page,
  onPageChange,
}: {
  data: ReportsOverview;
  page: number;
  onPageChange: (page: number) => void;
}) {
  const t = useT();
  const balances = data.balancesByCurrency;
  return (
    <div className="stack">
      <CountGrid
        items={[
          { label: t.reports.deposits, value: data.deposits },
          { label: t.reports.withdrawals, value: data.withdrawals },
          { label: t.reports.transfers, value: data.transfers },
          { label: t.reports.exchanges, value: data.exchanges },
          { label: t.reports.hawala, value: data.hawalas },
          { label: t.reports.trades, value: data.trades },
          { label: t.reports.adjustments, value: data.adjustments },
          { label: t.nav.expenses, value: data.expenses },
        ]}
      />

      <ReportSection title={t.desk.balancesByCurrency}>
        {data.balancesTotal === 0 ? (
          <p className="muted">{t.reports.noBalances}</p>
        ) : (
          <>
            <div className="report-table-wrap"><table className="report-ledger">
              <thead>
                <tr>
                  <th>{t.common.currency}</th>
                  <th className="col-amount">{t.common.balance}</th>
                  <th className="col-amount">{t.desk.vaultBalance}</th>
                  <th className="col-amount">{t.desk.cashTill}</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((r) => (
                  <tr key={r.currencyCode}>
                    <td>
                      <ReportCurrencyCell code={r.currencyCode} symbol={r.currencySymbol} />
                    </td>
                    <td className="col-amount">
                      <MoneyText amount={r.balance} />
                    </td>
                    <td className="col-amount">
                      <MoneyText amount={r.vaultBalance} />
                    </td>
                    <td className="col-amount">
                      <MoneyText amount={r.tillBalance} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            <Pagination
              page={page}
              pageSize={data.balancesPageSize}
              total={data.balancesTotal}
              onPageChange={onPageChange}
            />
          </>
        )}
      </ReportSection>
    </div>
  );
}

export function ReportsPage() {
  const t = useT();
  const { locale, dir } = useLocale();
  const navigate = useNavigate();
  const rtl = dir === "rtl";
  const [params, setParams] = useSearchParams();
  const reportParam = params.get("r") ?? "overview";
  const reportId = (
    [
      "overview",
      "daily",
      "monthly",
      "cash-flow",
      "profit-loss",
      "hawala",
      "exchange",
      "customer-statement",
      "transactions",
      "partners",
      "debtors",
      "employees",
      "movement-sums",
    ].includes(reportParam)
      ? reportParam
      : "overview"
  ) as Exclude<ReportId, "hub">;

  const today = todayIso();
  const dayParam = params.get("day");
  const monthParam = params.get("month");
  const [dateFrom, setDateFrom] = useState(monthStart(today));
  const [dateTo, setDateTo] = useState(today);
  const [profitPeriodPreset, setProfitPeriodPreset] = useState<ProfitPeriodPreset>("month");
  const [day, setDay] = useState(
    dayParam && /^\d{4}-\d{2}-\d{2}/.test(dayParam) ? dayParam.slice(0, 10) : today,
  );
  const [month, setMonth] = useState(
    monthParam && /^\d{4}-\d{2}/.test(monthParam)
      ? monthParam.slice(0, 7)
      : today.slice(0, 7),
  );

  const [overview, setOverview] = useState<ReportsOverview | null>(null);
  const [daily, setDaily] = useState<DailyReport | null>(null);
  const [monthly, setMonthly] = useState<MonthlyReport | null>(null);
  const [cashFlow, setCashFlow] = useState<CashFlowReport | null>(null);
  const [profitLoss, setProfitLoss] = useState<ProfitLossReport | null>(null);
  const [plCurrency, setPlCurrency] = useState("");
  const [hawalaPageData, setHawalaPageData] = useState<HawalaReportPage | null>(null);
  const [hawalaPage, setHawalaPage] = useState(1);
  const [hawalaView, setHawalaView] = useState<HawalaReportView>("sums");
  const [hawalaStatus, setHawalaStatus] = useState("ALL");
  const [hawalaDirection, setHawalaDirection] = useState("ALL");
  const [hawalaCurrency, setHawalaCurrency] = useState("ALL");
  const [hawalaCustomerId, setHawalaCustomerId] = useState("");
  const [hawalaReference, setHawalaReference] = useState("");
  const [movementSums, setMovementSums] = useState<MovementSumReport | null>(null);
  const [exchange, setExchange] = useState<ExchangePeriodReport | null>(null);
  const [exchangePage, setExchangePage] = useState(1);
  const [fromCurrency, setFromCurrency] = useState("ALL");
  const [toCurrency, setToCurrency] = useState("ALL");
  const [exchangeCustomerId, setExchangeCustomerId] = useState("");
  const [exchangeReference, setExchangeReference] = useState("");
  const [txPage, setTxPage] = useState<TransactionsReportPage | null>(null);
  const [txPageNum, setTxPageNum] = useState(1);
  const [txType, setTxType] = useState("ALL");
  const [txCustomerId, setTxCustomerId] = useState("");
  const [txCurrency, setTxCurrency] = useState("ALL");
  const [txStatus, setTxStatus] = useState("ALL");
  const [txAmount, setTxAmount] = useState("");
  const [txReference, setTxReference] = useState("");
  const [search, setSearch] = useState("");
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyListItem[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [statementCustomerLabel, setStatementCustomerLabel] = useState("");
  const [statementSuggestions, setStatementSuggestions] = useState<CustomerListItem[]>([]);
  const [statementSuggestBusy, setStatementSuggestBusy] = useState(false);
  const [statementShowSuggestions, setStatementShowSuggestions] = useState(false);
  const [statementHighlight, setStatementHighlight] = useState(-1);
  const statementCustomerWrapRef = useRef<HTMLLabelElement>(null);
  const [statementCurrency, setStatementCurrency] = useState("ALL");
  const [statement, setStatement] = useState<CustomerStatementReport | null>(null);
  const [partnerReport, setPartnerReport] = useState<PartnerSarafiReport | null>(null);
  const [partnerFilterId, setPartnerFilterId] = useState("");
  const [partnerList, setPartnerList] = useState<PartnerListItem[]>([]);
  const [partnerHawalaPage, setPartnerHawalaPage] = useState(1);
  const [partnerTablePage, setPartnerTablePage] = useState(1);
  const [commissionPage, setCommissionPage] = useState(1);
  const [debtorsPage, setDebtorsPage] = useState<DebtorCreditorPage | null>(null);
  const [creditorsPage, setCreditorsPage] = useState<DebtorCreditorPage | null>(null);
  const [debtorsListPage, setDebtorsListPage] = useState(1);
  const [creditorsListPage, setCreditorsListPage] = useState(1);
  const [employeePayItems, setEmployeePayItems] = useState<EmployeeSalaryPaymentRow[]>([]);
  const [employeePayTotals, setEmployeePayTotals] = useState<EmployeeSalaryMonthTotal[]>([]);
  const [employeePayTotalCount, setEmployeePayTotalCount] = useState(0);
  const [employeePayPage, setEmployeePayPage] = useState(1);
  const [listPage, setListPage] = useState(1);
  const listPageSize = 20;
  const txModal = useTransactionDetailModal();
  const dealModal = useExchangeDealDetailModal();

  function openTxOrDeal(id: string, type: string) {
    if (type.toUpperCase() === "EXCHANGE") {
      void dealModal.open(id);
    } else {
      void txModal.open(id);
    }
  }

  const customerOptions = useMemo((): SearchableSelectOption[] => {
    return [
      { value: "", label: t.common.all },
      ...customers.map((c) => ({
        value: c.id,
        label: c.fullName,
        keywords: [c.code, c.phone, c.fatherName].filter(Boolean).join(" "),
      })),
    ];
  }, [customers, t.common.all]);

  const partnerOptions = useMemo((): SearchableSelectOption[] => {
    return [
      { value: "", label: t.common.all },
      ...partnerList.map((p) => ({
        value: p.id,
        label: p.name,
        keywords: [p.phone, p.city, p.country].filter(Boolean).join(" "),
      })),
    ];
  }, [partnerList, t.common.all]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const catalog: ReportMeta[] = useMemo(
    () => [
      {
        id: "overview",
        title: t.desk.reportsOverview,
        blurb: t.dashboard.monthlyActivity,
        tone: "teal",
        Icon: IconReports,
      },
      {
        id: "daily",
        title: t.desk.dailyReport,
        blurb: t.desk.dailySummary,
        tone: "green",
        Icon: IconDaybook,
      },
      {
        id: "monthly",
        title: t.desk.monthlyReport,
        blurb: t.pages.monthlyReport,
        tone: "slate",
        Icon: IconHistory,
      },
      {
        id: "cash-flow",
        title: t.desk.cashFlowReport,
        blurb: t.desk.moneyComingIn,
        tone: "cyan",
        Icon: IconCash,
      },
      {
        id: "profit-loss",
        title: t.desk.profitAndLossReport,
        blurb: t.reports.profitAndLossHint,
        tone: "amber",
        Icon: IconCapital,
      },
      {
        id: "hawala",
        title: t.reports.hawalaReport,
        blurb: t.reports.hawala,
        tone: "rose",
        Icon: IconHawala,
      },
      {
        id: "movement-sums",
        title: t.reports.movementSumsReport,
        blurb: t.reports.movementSumsHint,
        tone: "cyan",
        Icon: IconCash,
      },
      {
        id: "exchange",
        title: t.desk.exchangeReport,
        blurb: t.reports.exchange,
        tone: "orange",
        Icon: IconExchange,
      },
      {
        id: "customer-statement",
        title: t.desk.customerStatementReport,
        blurb: t.reports.customerStatement,
        tone: "blue",
        Icon: IconCustomers,
      },
      {
        id: "transactions",
        title: t.desk.transactionsReport,
        blurb: t.reports.transactions,
        tone: "violet",
        Icon: IconTransactions,
      },
      {
        id: "partners",
        title: t.reports.partnerSarafiReport,
        blurb: t.reports.partnerSarafiHint,
        tone: "green",
        Icon: IconPartners,
      },
      {
        id: "debtors",
        title: t.nav.debtorsCreditors,
        blurb: t.debtorsCreditors.overview,
        tone: "amber",
        Icon: IconDebtorsCreditors,
      },
      {
        id: "employees",
        title: t.reports.employeeReport,
        blurb: t.reports.employeeReportHint,
        tone: "teal",
        Icon: IconEmployees,
      },
    ],
    [t],
  );

  const openReport = useCallback(
    (id: Exclude<ReportId, "hub">, extra?: { day?: string; month?: string }) => {
      const next: Record<string, string> = { r: id };
      if (extra?.day) next.day = extra.day;
      if (extra?.month) next.month = extra.month;
      if (id === "daily" && !extra?.day) next.day = day;
      if (id === "monthly" && !extra?.month) next.month = month;
      setParams(next);
    },
    [setParams, day, month],
  );

  useEffect(() => {
    if (reportParam === "hub" || !params.get("r")) {
      setParams({ r: "overview" }, { replace: true });
    }
  }, [reportParam, params, setParams]);

  useEffect(() => {
    if (reportId === "daily" && dayParam && /^\d{4}-\d{2}-\d{2}/.test(dayParam)) {
      setDay(dayParam.slice(0, 10));
    }
    if (reportId === "monthly" && monthParam && /^\d{4}-\d{2}/.test(monthParam)) {
      setMonth(monthParam.slice(0, 7));
    }
  }, [reportId, dayParam, monthParam]);

  useEffect(() => {
    setListPage(1);
    setHawalaPage(1);
    setExchangePage(1);
    setTxPageNum(1);
    setEmployeePayPage(1);
    setPartnerHawalaPage(1);
    setPartnerTablePage(1);
    setCommissionPage(1);
    setDebtorsListPage(1);
    setCreditorsListPage(1);
  }, [
    reportId,
    day,
    month,
    dateFrom,
    dateTo,
    customerId,
    statementCurrency,
    hawalaStatus,
    hawalaDirection,
    hawalaCurrency,
    hawalaCustomerId,
    hawalaReference,
    fromCurrency,
    toCurrency,
    exchangeCustomerId,
    exchangeReference,
    txType,
    txCustomerId,
    txCurrency,
    txStatus,
    txAmount,
    txReference,
    search,
    partnerFilterId,
    plCurrency,
  ]);

  const periodFilter = useMemo(() => ({ dateFrom, dateTo }), [dateFrom, dateTo]);

  const ensureCatalogs = useCallback(async () => {
    if (customers.length && currencies.length) return;
    const [custPage, curPage] = await Promise.all([
      listCustomersPage({ archiveFilter: "active", page: 1, pageSize: 200 }),
      listCurrenciesPage({ activeOnly: true, pageSize: 200 }),
    ]);
    setCustomers(custPage.items);
    setCurrencies(curPage.items);
  }, [customers.length, currencies.length]);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      if (reportId === "overview") {
        setOverview(
          await getReportsOverview({
            ...periodFilter,
            page: listPage,
            pageSize: listPageSize,
          }),
        );
      } else if (reportId === "daily") {
        setDaily(await getDailyReport(day, listPage, listPageSize));
      } else if (reportId === "monthly") {
        setMonthly(await getMonthlyReport(month, listPage, listPageSize));
      } else if (reportId === "cash-flow") {
        setCashFlow(
          await getCashFlowReport({
            ...periodFilter,
            page: listPage,
            pageSize: listPageSize,
          }),
        );
      } else if (reportId === "profit-loss") {
        const curItems = currencies.length
          ? currencies
          : (await listCurrenciesPage({ activeOnly: true, pageSize: 200 })).items;
        if (!currencies.length) setCurrencies(curItems);
        const code = plCurrency || pickDefaultCurrency(curItems);
        setProfitLoss(
          await getProfitLossReport({
            ...periodFilter,
            currencyCode: code || undefined,
          }),
        );
      } else if (reportId === "hawala") {
        await ensureCatalogs();
        setHawalaPageData(
          await getHawalaStatusReport(
            {
              ...periodFilter,
              currencyCode: hawalaCurrency === "ALL" ? undefined : hawalaCurrency,
              customerId: hawalaCustomerId || undefined,
              reference: hawalaReference.trim() || undefined,
              direction: hawalaDirection === "ALL" ? undefined : hawalaDirection,
              page: hawalaPage,
              pageSize: listPageSize,
            },
            hawalaStatus,
          ),
        );
      } else if (reportId === "movement-sums") {
        setMovementSums(await getMovementSumReport(periodFilter));
      } else if (reportId === "exchange") {
        await ensureCatalogs();
        setExchange(
          await getExchangePeriodReport({
            ...periodFilter,
            fromCurrencyCode: fromCurrency === "ALL" ? undefined : fromCurrency,
            toCurrencyCode: toCurrency === "ALL" ? undefined : toCurrency,
            customerId: exchangeCustomerId || undefined,
            reference: exchangeReference.trim() || undefined,
            page: exchangePage,
            pageSize: listPageSize,
          }),
        );
      } else if (reportId === "customer-statement") {
        await ensureCatalogs();
        if (customerId) {
          setStatement(
            await getCustomerStatementReport({
              ...periodFilter,
              customerId,
              currencyCode: statementCurrency === "ALL" ? undefined : statementCurrency,
              page: listPage,
              pageSize: listPageSize,
            }),
          );
        } else {
          setStatement(null);
        }
      } else if (reportId === "transactions") {
        await ensureCatalogs();
        setTxPage(
          await getTransactionsReport(
            {
              ...periodFilter,
              customerId: txCustomerId || undefined,
              currencyCode: txCurrency === "ALL" ? undefined : txCurrency,
              status: txStatus === "ALL" ? undefined : txStatus,
              amount: txAmount.trim() || undefined,
              reference: txReference.trim() || undefined,
              search: search || undefined,
              page: txPageNum,
              pageSize: listPageSize,
            },
            txType,
          ),
        );
      } else if (reportId === "partners") {
        const [partners, report] = await Promise.all([
          listPartners().catch(() => [] as PartnerListItem[]),
          getPartnerSarafiReport({
            ...periodFilter,
            partnerId: partnerFilterId || undefined,
            page: partnerHawalaPage,
            pageSize: listPageSize,
            partnersPage: partnerTablePage,
            commissionPage: commissionPage,
          }),
        ]);
        setPartnerList(partners);
        setPartnerReport(report);
      } else if (reportId === "debtors") {
        const [debtors, creditors] = await Promise.all([
          listDebtorsCreditors({
            side: "DEBTORS",
            page: debtorsListPage,
            pageSize: listPageSize,
          }),
          listDebtorsCreditors({
            side: "CREDITORS",
            page: creditorsListPage,
            pageSize: listPageSize,
          }),
        ]);
        setDebtorsPage(debtors);
        setCreditorsPage(creditors);
      } else if (reportId === "employees") {
        const page = await listEmployeeSalaryPayments({
          ...periodFilter,
          page: employeePayPage,
          pageSize: listPageSize,
        });
        setEmployeePayItems(page.items);
        setEmployeePayTotals(page.monthTotals);
        setEmployeePayTotalCount(page.total);
      }
    } catch (err: unknown) {
      setError(errorMessage(err, t.errors.loadReports));
    } finally {
      setBusy(false);
    }
  }, [
    reportId,
    periodFilter,
    day,
    month,
    ensureCatalogs,
    hawalaPage,
    hawalaStatus,
    hawalaDirection,
    hawalaCurrency,
    hawalaCustomerId,
    hawalaReference,
    exchangePage,
    fromCurrency,
    toCurrency,
    exchangeCustomerId,
    exchangeReference,
    employeePayPage,
    customerId,
    statementCurrency,
    listPage,
    txPageNum,
    txType,
    txCustomerId,
    txCurrency,
    txStatus,
    txAmount,
    txReference,
    search,
    partnerFilterId,
    partnerHawalaPage,
    partnerTablePage,
    commissionPage,
    debtorsListPage,
    creditorsListPage,
    plCurrency,
    currencies,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (reportId !== "customer-statement") return;
    const onDoc = (e: MouseEvent) => {
      if (!statementCustomerWrapRef.current?.contains(e.target as Node)) {
        setStatementShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [reportId]);

  useEffect(() => {
    if (reportId !== "customer-statement") return;
    const q = statementCustomerLabel.trim();
    if (customerId || q.length < 1) {
      setStatementSuggestions([]);
      setStatementHighlight(-1);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setStatementSuggestBusy(true);
      void listCustomersPage({
        search: q,
        archiveFilter: "active",
        page: 1,
        pageSize: 12,
      })
        .then((page) => {
          if (cancelled) return;
          setStatementSuggestions(page.items);
          setStatementHighlight(page.items.length > 0 ? 0 : -1);
        })
        .catch(() => {
          if (!cancelled) setStatementSuggestions([]);
        })
        .finally(() => {
          if (!cancelled) setStatementSuggestBusy(false);
        });
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [statementCustomerLabel, customerId, reportId]);

  function pickStatementCustomer(c: CustomerListItem) {
    const label = `${c.fullName}${c.code ? ` (${c.code})` : ""}`;
    setCustomerId(c.id);
    setStatementCustomerLabel(label);
    setStatementShowSuggestions(false);
    setStatementSuggestions([]);
    setStatementHighlight(-1);
  }

  function onStatementCustomerKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!statementShowSuggestions || statementSuggestions.length === 0) {
      if (e.key === "Escape") setStatementShowSuggestions(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setStatementHighlight((i) => (i + 1) % statementSuggestions.length);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setStatementHighlight((i) =>
        i <= 0 ? statementSuggestions.length - 1 : i - 1,
      );
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const pick = statementSuggestions[statementHighlight] ?? statementSuggestions[0];
      if (pick) pickStatementCustomer(pick);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setStatementShowSuggestions(false);
    }
  }

  useEffect(() => {
    setHawalaPage(1);
    setExchangePage(1);
    setTxPageNum(1);
  }, [
    dateFrom,
    dateTo,
    day,
    month,
    search,
    hawalaStatus,
    hawalaDirection,
    hawalaCurrency,
    hawalaCustomerId,
    hawalaReference,
    fromCurrency,
    toCurrency,
    exchangeCustomerId,
    exchangeReference,
    txType,
    txCustomerId,
    txCurrency,
    txStatus,
    txAmount,
    txReference,
    statementCurrency,
    customerId,
    reportId,
  ]);

  const onDayChange = (value: string) => {
    setDay(value);
    setParams({ r: "daily", day: value });
  };

  const onMonthChange = (value: string) => {
    setMonth(value);
    setParams({ r: "monthly", month: value });
  };

  const runExport = useCallback(
    async (payload: ExportPayload) => {
      const path = await exportTable(payload.filename, payload.columns, payload.rows, {
        title: payload.title,
        businessName: "ASMS",
        periodLabel: payload.period,
        generatedAt: new Date().toLocaleString(locale === "en" ? "en" : locale),
        rtl,
      });
      if (path) window.alert(`${t.desk.exportCsv}\n${path}`);
    },
    [locale, rtl, t.desk.exportCsv],
  );

  const buildExportPayload = useCallback((): ExportPayload | null => {
    const period =
      reportId === "daily"
        ? day
        : reportId === "monthly"
          ? month
          : reportId === "debtors"
            ? undefined
            : `${dateFrom} → ${dateTo}`;

    if (reportId === "overview" && overview) {
      const columns: ExportColumn[] = [
        { key: "section", header: t.common.type, kind: "description" },
        { key: "label", header: t.common.description, kind: "text" },
        { key: "value", header: t.common.amount, kind: "text" },
      ];
      const activity: ExportRow[] = [
        { section: t.desk.activityBreakdown, label: t.reports.deposits, value: overview.deposits },
        {
          section: t.desk.activityBreakdown,
          label: t.reports.withdrawals,
          value: overview.withdrawals,
        },
        { section: t.desk.activityBreakdown, label: t.reports.transfers, value: overview.transfers },
        { section: t.desk.activityBreakdown, label: t.reports.exchanges, value: overview.exchanges },
        { section: t.desk.activityBreakdown, label: t.reports.hawala, value: overview.hawalas },
        { section: t.desk.activityBreakdown, label: t.reports.trades, value: overview.trades },
        {
          section: t.desk.activityBreakdown,
          label: t.reports.adjustments,
          value: overview.adjustments,
        },
        { section: t.desk.activityBreakdown, label: t.nav.expenses, value: overview.expenses },
      ];
      const balances: ExportRow[] = overview.balancesByCurrency.map((r) => ({
        section: t.desk.balancesByCurrency,
        label: r.currencyCode,
        value: `${r.balance} · vault ${r.vaultBalance} · till ${r.tillBalance}`,
      }));
      return {
        filename: "overview-report",
        columns,
        rows: [...activity, ...balances],
        title: t.desk.reportsOverview,
        period,
      };
    }

    if (reportId === "cash-flow" && cashFlow) {
      const columns: ExportColumn[] = [
        { key: "txType", header: t.reports.transactionType, kind: "text" },
        { key: "currency", header: t.common.currency, kind: "text" },
        { key: "count", header: t.common.count, kind: "count" },
        { key: "moneyIn", header: t.desk.moneyComingIn, kind: "amount" },
        { key: "moneyOut", header: t.desk.moneyGoingOut, kind: "amount" },
        { key: "net", header: t.desk.netMovement, kind: "amount" },
      ];
      const rows: ExportRow[] = cashFlow.byType.map((r) => ({
        txType: r.txType,
        currency: r.currencyCode,
        count: r.count,
        moneyIn: r.moneyIn,
        moneyOut: r.moneyOut,
        net: r.net,
      }));
      return {
        filename: "cash-flow-report",
        columns,
        rows,
        title: t.desk.cashFlowReport,
        period,
      };
    }

    if (reportId === "partners" && partnerReport) {
      const columns: ExportColumn[] = [
        { key: "section", header: t.common.type, kind: "description" },
        { key: "partner", header: t.common.partner, kind: "text" },
        { key: "metric", header: t.reports.metric, kind: "text" },
        { key: "currency", header: t.common.currency, kind: "text" },
        { key: "amount", header: t.common.amount, kind: "amount" },
        { key: "count", header: t.common.count, kind: "count" },
      ];
      const pushBuckets = (
        section: string,
        partner: string,
        metric: string,
        buckets: typeof partnerReport.sendTotals,
      ): ExportRow[] =>
        buckets.map((b) => ({
          section,
          partner,
          metric,
          currency: b.currencyCode,
          amount: b.amount,
          count: b.count,
        }));
      const rows: ExportRow[] = [
        ...pushBuckets(t.reports.periodTotals, "", t.reports.hawalaSendTotals, partnerReport.sendTotals),
        ...pushBuckets(
          t.reports.periodTotals,
          "",
          t.reports.hawalaReceiveTotals,
          partnerReport.receiveTotals,
        ),
        ...pushBuckets(
          t.reports.periodTotals,
          "",
          t.reports.partnerPayments,
          partnerReport.paymentTotals,
        ),
        ...pushBuckets(
          t.reports.periodTotals,
          "",
          t.reports.partnerCollections,
          partnerReport.collectionTotals,
        ),
        ...partnerReport.partners.flatMap((p) => [
          ...pushBuckets(t.reports.byPartner, p.partnerName, t.reports.hawalaSendTotals, p.sendTotals),
          ...pushBuckets(
            t.reports.byPartner,
            p.partnerName,
            t.reports.hawalaReceiveTotals,
            p.receiveTotals,
          ),
          ...pushBuckets(t.reports.byPartner, p.partnerName, t.reports.partnerPayments, p.paymentTotals),
          ...pushBuckets(
            t.reports.byPartner,
            p.partnerName,
            t.reports.partnerCollections,
            p.collectionTotals,
          ),
        ]),
        ...partnerReport.openCommission.map((r) => ({
          section: t.desk.partnerBalances,
          partner: r.partnerName,
          metric: t.common.net,
          currency: r.currencyCode,
          amount: r.net,
          count: "",
        })),
        ...partnerReport.hawalas.map((h) => ({
          section: t.reports.hawalaListTab,
          partner: h.partnerName,
          metric: `${h.direction} · ${h.status}`,
          currency: h.currencyCode,
          amount: h.amount,
          count: txDisplayRef(h),
        })),
      ];
      return {
        filename: "partner-sarafi-report",
        columns,
        rows,
        title: t.reports.partnerSarafiReport,
        period,
      };
    }

    if (reportId === "debtors" && debtorsPage && creditorsPage) {
      const columns: ExportColumn[] = [
        { key: "side", header: t.common.type, kind: "text" },
        { key: "customer", header: t.common.customer, kind: "text" },
        { key: "accountCode", header: t.debtorsCreditors.accountNumber, kind: "ref" },
        { key: "currency", header: t.common.currency, kind: "text" },
        { key: "amount", header: t.common.amount, kind: "amount" },
      ];
      const rows: ExportRow[] = [
        ...debtorsPage.items.map((r) => ({
          side: t.debtorsCreditors.debtors,
          customer: r.customerName,
          accountCode: r.accountCode,
          currency: r.currencyCode,
          amount: r.amountDisplay,
        })),
        ...creditorsPage.items.map((r) => ({
          side: t.debtorsCreditors.creditors,
          customer: r.customerName,
          accountCode: r.accountCode,
          currency: r.currencyCode,
          amount: r.amountDisplay,
        })),
      ];
      return {
        filename: "debtors-creditors",
        columns,
        rows,
        title: t.nav.debtorsCreditors,
        period,
      };
    }

    if (reportId === "transactions" && txPage) {
      const columns: ExportColumn[] = [
        { key: "date", header: t.common.date, kind: "date" },
        { key: "activity", header: t.common.description, kind: "description" },
        { key: "reference", header: t.common.reference, kind: "ref" },
        { key: "status", header: t.common.status, kind: "text" },
      ];
      const rows: ExportRow[] = txPage.items.map((r) => ({
        date: r.valueDate.slice(0, 19),
        activity: formatTransactionLine(
          {
            type: r.type,
            reference: r.reference,
            status: r.status === "POSTED" ? null : r.status,
            customerName: r.customerName,
            description: r.description,
            amountSummary: r.amountSummary,
            senderName: r.senderName,
            receiverName: r.receiverName,
          },
          t.txLine,
          (s) => statusLabel(t, s),
        ),
        reference: txDisplayRef(r),
        status: statusLabel(t, r.status),
      }));
      return {
        filename: "transactions-report",
        columns,
        rows,
        title: t.desk.transactionsReport,
        period,
      };
    }
    if (reportId === "hawala" && hawalaPageData) {
      if (hawalaView === "sums") {
        const columns: ExportColumn[] = [
          { key: "side", header: t.desk.direction, kind: "text" },
          { key: "currency", header: t.common.currency, kind: "text" },
          { key: "amount", header: t.common.amount, kind: "amount" },
        ];
        const rows: ExportRow[] = [
          ...hawalaPageData.sentTotals.map((r) => ({
            side: t.reports.hawalaSendTotals,
            currency: r.currencyCode,
            amount: r.amount,
          })),
          ...hawalaPageData.receivedTotals.map((r) => ({
            side: t.reports.hawalaReceiveTotals,
            currency: r.currencyCode,
            amount: r.amount,
          })),
        ];
        return {
          filename: "hawala-sums-report",
          columns,
          rows,
          title: t.reports.hawalaReport,
          period,
        };
      }
      const columns: ExportColumn[] = [
        { key: "reference", header: t.common.reference, kind: "ref" },
        { key: "direction", header: t.common.type, kind: "text" },
        { key: "status", header: t.common.status, kind: "text" },
        { key: "amount", header: t.common.amount, kind: "amount" },
        { key: "currency", header: t.common.currency, kind: "text" },
        { key: "customer", header: t.common.customer, kind: "text" },
        { key: "sender", header: t.common.sender, kind: "text" },
        { key: "receiver", header: t.common.receiver, kind: "text" },
        { key: "date", header: t.common.date, kind: "date" },
      ];
      const rows: ExportRow[] = hawalaPageData.items.map((r) => ({
        reference: txDisplayRef(r),
        direction: r.direction,
        status: statusLabel(t, r.status),
        amount: r.amount,
        currency: r.currencyCode,
        customer: r.customerName ?? "",
        sender: r.senderName ?? "",
        receiver: r.receiverName ?? "",
        date: r.valueDate.slice(0, 19),
      }));
      return {
        filename: "hawala-report",
        columns,
        rows,
        title: t.reports.hawalaReport,
        period,
      };
    }
    if (reportId === "movement-sums" && movementSums) {
      const columns: ExportColumn[] = [
        { key: "section", header: t.common.type, kind: "description" },
        { key: "currency", header: t.common.currency, kind: "text" },
        { key: "amount", header: t.common.amount, kind: "amount" },
        { key: "count", header: t.common.count, kind: "count" },
      ];
      const push = (
        section: string,
        bucket: { count: number; totals: ReportCurrencyAmount[] },
      ): ExportRow[] =>
        bucket.totals.length === 0
          ? [{ section, currency: "—", amount: "0", count: bucket.count }]
          : bucket.totals.map((r) => ({
              section,
              currency: r.currencyCode,
              amount: r.amount,
              count: bucket.count,
            }));
      const rows: ExportRow[] = [
        ...push(t.reports.depositTotals, movementSums.deposit),
        ...push(t.reports.withdrawalTotals, movementSums.withdrawal),
        ...push(t.reports.transferTotals, movementSums.transfer),
        ...push(t.reports.exchangeGivenTotals, movementSums.exchangeGiven),
        ...push(t.reports.exchangeReceivedTotals, movementSums.exchangeReceived),
        ...push(t.dailyBook.exchangeProfit, movementSums.exchangeProfit),
      ];
      return {
        filename: "movement-sums-report",
        columns,
        rows,
        title: t.reports.movementSumsReport,
        period,
      };
    }
    if (reportId === "exchange" && exchange) {
      const columns: ExportColumn[] = [
        { key: "reference", header: t.common.reference, kind: "ref" },
        { key: "side", header: t.common.type, kind: "text" },
        { key: "given", header: t.desk.moneyGoingOut, kind: "amount" },
        { key: "received", header: t.desk.moneyComingIn, kind: "amount" },
        { key: "dealRate", header: t.desk.customerRate, kind: "amount" },
        { key: "boardRate", header: t.desk.marketCost, kind: "amount" },
        { key: "profit", header: t.dailyBook.exchangeProfit, kind: "amount" },
        { key: "customer", header: t.common.customer, kind: "text" },
        { key: "date", header: t.common.date, kind: "date" },
      ];
      const rows: ExportRow[] = exchange.items.map((r) => ({
        reference: txDisplayRef(r),
        side: r.side,
        given: `${r.fromAmount} ${r.fromCurrency}`,
        received: `${r.toAmount} ${r.toCurrency}`,
        dealRate: r.dealRate,
        boardRate: r.boardRate ?? "",
        profit: `${r.profitAmount} ${r.profitCurrency}`,
        customer: r.customerName ?? "",
        date: r.valueDate.slice(0, 19),
      }));
      return {
        filename: "exchange-report",
        columns,
        rows,
        title: t.desk.exchangeReport,
        period,
      };
    }
    if (reportId === "profit-loss" && profitLoss) {
      const columns: ExportColumn[] = [
        { key: "section", header: t.common.type, kind: "description" },
        { key: "currency", header: t.common.currency, kind: "text" },
        { key: "amount", header: t.common.amount, kind: "amount" },
      ];
      const rows: ExportRow[] = [
        ...profitLoss.exchangeProfit.map((r) => ({
          section: t.dailyBook.exchangeProfit,
          currency: r.currencyCode,
          amount: r.amount,
        })),
        ...profitLoss.tradingProfit.map((r) => ({
          section: t.dailyBook.tradingProfit,
          currency: r.currencyCode,
          amount: r.amount,
        })),
        ...profitLoss.hawalaCommission.map((r) => ({
          section: t.reports.hawalaCommission,
          currency: r.currencyCode,
          amount: r.amount,
        })),
        ...profitLoss.employeeSalary.map((r) => ({
          section: t.reports.employeeSalary,
          currency: r.currencyCode,
          amount: r.amount,
        })),
        ...profitLoss.otherExpenses.map((r) => ({
          section: t.nav.expenses,
          currency: r.currencyCode,
          amount: r.amount,
        })),
        ...profitLoss.expenses.map((r) => ({
          section: t.dailyBook.expenses,
          currency: r.currencyCode,
          amount: r.amount,
        })),
        ...profitLoss.netProfit.map((r) => ({
          section: t.dailyBook.netProfit,
          currency: r.currencyCode,
          amount: r.amount,
        })),
      ];
      return {
        filename: "profit-loss-report",
        columns,
        rows,
        title: t.desk.profitAndLossReport,
        period,
      };
    }
    if (reportId === "customer-statement" && statement) {
      const columns: ExportColumn[] = [
        { key: "date", header: t.common.date, kind: "date" },
        { key: "activity", header: t.common.description, kind: "description" },
        { key: "balance", header: t.common.balance, kind: "amount" },
        { key: "currency", header: t.common.currency, kind: "text" },
        { key: "reference", header: t.common.reference, kind: "ref" },
        { key: "status", header: t.common.status, kind: "text" },
      ];
      const rows: ExportRow[] = statement.lines.map((r) => ({
        date: r.valueDate.slice(0, 19),
        activity: formatTransactionLine(
          {
            type: r.type,
            reference: r.reference,
            status: r.status === "POSTED" ? null : r.status,
            customerName: statement.customerName,
            description: r.description,
            debit: r.debit,
            credit: r.credit,
            currencyCode: r.currencyCode,
            senderName: r.senderName,
            receiverName: r.receiverName,
          },
          t.txLine,
          (s) => statusLabel(t, s),
        ),
        balance: r.balanceAfter,
        currency: r.currencyCode,
        reference: txDisplayRef(r),
        status: statusLabel(t, r.status),
      }));
      return {
        filename: "customer-statement",
        columns,
        rows,
        title: t.desk.customerStatementReport,
        period,
      };
    }
    if (reportId === "employees") {
      const columns: ExportColumn[] = [
        { key: "valueDate", header: t.common.date, kind: "date" },
        { key: "employeeName", header: t.employees.employee, kind: "text" },
        { key: "amount", header: t.common.amount, kind: "amount" },
        { key: "currencyCode", header: t.common.currency, kind: "text" },
        { key: "reference", header: t.common.reference, kind: "ref" },
        { key: "notes", header: t.common.notes, kind: "description" },
      ];
      const rows: ExportRow[] = employeePayItems.map((r) => ({
        valueDate: String(r.valueDate).slice(0, 10),
        employeeName: r.employeeName,
        amount: r.amount,
        currencyCode: r.currencyCode,
        reference: txDisplayRef(r),
        notes: r.notes || "",
      }));
      return {
        filename: "employee-salary-report",
        columns,
        rows,
        title: t.reports.employeeReport,
        period: `${dateFrom} → ${dateTo}`,
      };
    }
    if (reportId === "monthly" && monthly) {
      const columns: ExportColumn[] = [
        { key: "date", header: t.common.date, kind: "date" },
        { key: "total", header: t.reports.totalTransactions, kind: "count" },
        { key: "deposits", header: t.reports.deposits, kind: "count" },
        { key: "withdrawals", header: t.reports.withdrawals, kind: "count" },
        { key: "transfers", header: t.reports.transfers, kind: "count" },
        { key: "exchanges", header: t.reports.exchanges, kind: "count" },
        { key: "hawala", header: t.reports.hawala, kind: "count" },
        { key: "moneyIn", header: t.desk.moneyComingIn, kind: "description" },
        { key: "moneyOut", header: t.desk.moneyGoingOut, kind: "description" },
        { key: "net", header: t.desk.netMovement, kind: "description" },
      ];
      const rows: ExportRow[] = monthly.days.map((d) => ({
        date: d.businessDate,
        total: d.totalTransactions,
        deposits: d.deposits,
        withdrawals: d.withdrawals,
        transfers: d.transfers,
        exchanges: d.exchanges,
        hawala: d.hawalas,
        moneyIn: formatAmountsList(d.moneyIn),
        moneyOut: formatAmountsList(d.moneyOut),
        net: formatAmountsList(d.netMovement),
      }));
      return {
        filename: "monthly-report",
        columns,
        rows,
        title: t.desk.monthlyReport,
        period,
      };
    }
    if (reportId === "daily" && daily) {
      const columns: ExportColumn[] = [
        { key: "date", header: t.common.date, kind: "date" },
        { key: "activity", header: t.common.description, kind: "description" },
        { key: "reference", header: t.common.reference, kind: "ref" },
        { key: "status", header: t.common.status, kind: "text" },
      ];
      const rows: ExportRow[] = daily.transactions.map((r) => ({
        date: r.valueDate.slice(0, 19),
        activity: formatTransactionLine(
          {
            type: r.type,
            reference: r.reference,
            status: r.status === "POSTED" ? null : r.status,
            customerName: r.customerName,
            description: r.description,
            amountSummary: r.amountSummary,
            senderName: r.senderName,
            receiverName: r.receiverName,
          },
          t.txLine,
          (s) => statusLabel(t, s),
        ),
        reference: txDisplayRef(r),
        status: statusLabel(t, r.status),
      }));
      return {
        filename: "daily-report",
        columns,
        rows,
        title: t.desk.dailyReport,
        period,
      };
    }
    return null;
  }, [
    reportId,
    day,
    month,
    dateFrom,
    dateTo,
    overview,
    cashFlow,
    partnerReport,
    debtorsPage,
    creditorsPage,
    txPage,
    hawalaPageData,
    hawalaView,
    movementSums,
    exchange,
    profitLoss,
    statement,
    monthly,
    daily,
    employeePayItems,
    t,
  ]);

  const exportPayload = buildExportPayload();

  const runPrintSheet = useCallback(() => {
    const payload = buildExportPayload();
    if (!payload) return;
    printReportSheet({
      columns: payload.columns,
      rows: payload.rows,
      meta: {
        title: payload.title,
        businessName: "ASMS",
        periodLabel: payload.period,
        generatedAt: new Date().toLocaleString(locale === "en" ? "en" : locale),
        rtl,
      },
      emptyLabel: t.reports.noDataPeriod,
    });
  }, [buildExportPayload, locale, rtl, t.reports.noDataPeriod]);

  return (
    <div className="stack report-page">
      <nav className="report-tabs no-print" aria-label={t.nav.reports}>
        {catalog.map((tab) => {
          const TabIcon = tab.Icon;
          return (
            <button
              key={tab.id}
              type="button"
              data-tone={tab.tone}
              className={`report-tab${reportId === tab.id ? " is-active" : ""}`}
              onClick={() => openReport(tab.id)}
            >
              <TabIcon className="report-tab-icon" />
              <span className="report-tab-label">{tab.title}</span>
            </button>
          );
        })}
      </nav>

      <div className="report-topbar no-print">
      {reportId !== "debtors" ? (
        <div className="report-period">
          {reportId === "daily" ? (
            <label className="stack">
              <span>{t.desk.businessDate}</span>
              <input type="date" value={day} onChange={(e) => onDayChange(e.target.value)} />
            </label>
          ) : reportId === "monthly" ? (
            <label className="stack">
              <span>{t.desk.selectMonth}</span>
              <input type="month" value={month} onChange={(e) => onMonthChange(e.target.value)} />
            </label>
          ) : (
            <>
              {reportId === "profit-loss" ? (
                <div className="report-period-presets" role="group" aria-label={t.reports.filters}>
                  {(
                    [
                      ["today", t.common.today],
                      ["yesterday", t.common.yesterday],
                      ["week", t.common.thisWeek],
                      ["month", t.common.thisMonth],
                      ["year", t.common.thisYear],
                      ["custom", t.common.custom],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      className={
                        profitPeriodPreset === id
                          ? "report-period-preset active"
                          : "report-period-preset"
                      }
                      onClick={() => {
                        setProfitPeriodPreset(id);
                        if (id === "custom") return;
                        const range = profitPeriodRange(id, todayIso());
                        setDateFrom(range.from);
                        setDateTo(range.to);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : null}
              <label className="stack">
                <span>{t.reports.fromDate}</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setProfitPeriodPreset("custom");
                    setDateFrom(e.target.value);
                  }}
                />
              </label>
              <label className="stack">
                <span>{t.reports.toDate}</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setProfitPeriodPreset("custom");
                    setDateTo(e.target.value);
                  }}
                />
              </label>
              {reportId === "profit-loss" ? (
                <div className="stack" style={{ minWidth: "11rem" }}>
                  <CurrencyPicker
                    label={t.common.currency}
                    currencies={currencies}
                    value={plCurrency || pickDefaultCurrency(currencies)}
                    onChange={setPlCurrency}
                    emptyLabel={t.common.noData}
                    searchPlaceholder={t.common.search}
                    allowManage={false}
                  />
                </div>
              ) : null}
              {reportId === "partners" ? (
                <div className="stack" style={{ minWidth: "12rem" }}>
                  <SearchableSelect
                    label={t.common.partner}
                    value={partnerFilterId}
                    options={partnerOptions}
                    onChange={setPartnerFilterId}
                  />
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {reportId === "hawala" ||
      reportId === "exchange" ||
      reportId === "customer-statement" ||
      reportId === "transactions" ? (
        <div className="report-filters report-filters-extra">
          {reportId === "hawala" ? (
            <>
              <div className="stack" style={{ minWidth: "10rem" }}>
                <SearchableSelect
                  label={t.desk.direction}
                  value={hawalaDirection}
                  options={[
                    { value: "ALL", label: t.common.all },
                    { value: "SEND", label: t.desk.newSend },
                    { value: "RECEIVE", label: t.desk.newReceive },
                  ]}
                  onChange={setHawalaDirection}
                />
              </div>
              <div className="stack" style={{ minWidth: "10rem" }}>
                <SearchableSelect
                  label={t.common.status}
                  value={hawalaStatus}
                  options={[
                    { value: "ALL", label: t.common.all },
                    { value: "PENDING", label: statusLabel(t, "PENDING") },
                    { value: "SENT", label: statusLabel(t, "SENT") },
                    { value: "RECEIVED", label: statusLabel(t, "RECEIVED") },
                    { value: "COMPLETED", label: statusLabel(t, "COMPLETED") },
                    { value: "CANCELLED", label: statusLabel(t, "CANCELLED") },
                    { value: "RETURNED", label: statusLabel(t, "RETURNED") },
                  ]}
                  onChange={setHawalaStatus}
                />
              </div>
              <div className="stack" style={{ minWidth: "11rem" }}>
                <CurrencyFilter
                  currencies={currencies}
                  value={hawalaCurrency === "ALL" ? "" : hawalaCurrency}
                  onChange={(code) => setHawalaCurrency(code || "ALL")}
                  allLabel={t.common.all}
                />
              </div>
              <div className="stack" style={{ minWidth: "12rem" }}>
                <SearchableSelect
                  label={t.common.customer}
                  value={hawalaCustomerId}
                  options={customerOptions}
                  onChange={setHawalaCustomerId}
                />
              </div>
              <label className="stack" style={{ minWidth: "10rem" }}>
                <span>{t.common.reference}</span>
                <input
                  value={hawalaReference}
                  onChange={(e) => setHawalaReference(e.target.value)}
                  placeholder={t.common.reference}
                />
              </label>
            </>
          ) : null}
          {reportId === "exchange" ? (
            <>
              <div className="stack" style={{ minWidth: "11rem" }}>
                <CurrencyFilter
                  label={t.common.from}
                  currencies={currencies}
                  value={fromCurrency === "ALL" ? "" : fromCurrency}
                  onChange={(code) => setFromCurrency(code || "ALL")}
                  allLabel={t.common.all}
                />
              </div>
              <div className="stack" style={{ minWidth: "11rem" }}>
                <CurrencyFilter
                  label={t.common.to}
                  currencies={currencies}
                  value={toCurrency === "ALL" ? "" : toCurrency}
                  onChange={(code) => setToCurrency(code || "ALL")}
                  allLabel={t.common.all}
                />
              </div>
              <div className="stack" style={{ minWidth: "12rem" }}>
                <SearchableSelect
                  label={t.common.customer}
                  value={exchangeCustomerId}
                  options={customerOptions}
                  onChange={setExchangeCustomerId}
                />
              </div>
              <label className="stack" style={{ minWidth: "10rem" }}>
                <span>{t.common.reference}</span>
                <input
                  value={exchangeReference}
                  onChange={(e) => setExchangeReference(e.target.value)}
                  placeholder={t.common.reference}
                />
              </label>
            </>
          ) : null}
          {reportId === "customer-statement" ? (
            <>
              <label
                ref={statementCustomerWrapRef}
                className="stack customer-search-wrap"
                style={{ minWidth: "16rem", flex: "1 1 16rem" }}
              >
                <span>{t.reports.selectCustomer}</span>
                <input
                  value={statementCustomerLabel}
                  placeholder={t.customers.searchPlaceholder}
                  autoComplete="off"
                  aria-autocomplete="list"
                  aria-expanded={statementShowSuggestions && statementSuggestions.length > 0}
                  onChange={(e) => {
                    setCustomerId("");
                    setStatementCustomerLabel(e.target.value);
                    setStatementShowSuggestions(true);
                    setStatement(null);
                  }}
                  onFocus={() => {
                    if (!customerId) setStatementShowSuggestions(true);
                  }}
                  onKeyDown={onStatementCustomerKeyDown}
                />
                {statementShowSuggestions &&
                statementCustomerLabel.trim().length > 0 &&
                !customerId ? (
                  <ul className="customer-suggest" role="listbox">
                    {statementSuggestBusy && statementSuggestions.length === 0 ? (
                      <li className="customer-suggest-empty muted">{t.common.loading}</li>
                    ) : null}
                    {!statementSuggestBusy && statementSuggestions.length === 0 ? (
                      <li className="customer-suggest-empty muted">
                        {t.customers.emptyFiltered}
                      </li>
                    ) : null}
                    {statementSuggestions.map((c, idx) => (
                      <li key={c.id} role="option" aria-selected={idx === statementHighlight}>
                        <button
                          type="button"
                          tabIndex={-1}
                          className={`customer-suggest-item${
                            idx === statementHighlight ? " is-active" : ""
                          }`}
                          onMouseEnter={() => setStatementHighlight(idx)}
                          onClick={() => pickStatementCustomer(c)}
                        >
                          <span className="customer-suggest-name">
                            {c.fullName}
                            {c.fatherName ? ` · ${c.fatherName}` : ""}
                          </span>
                          <span className="customer-suggest-meta muted">
                            {[c.code, c.phone].filter(Boolean).join(" · ") || "—"}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </label>
              <div className="stack" style={{ minWidth: "11rem" }}>
                <CurrencyFilter
                  currencies={currencies}
                  value={statementCurrency === "ALL" ? "" : statementCurrency}
                  onChange={(code) => setStatementCurrency(code || "ALL")}
                  allLabel={t.common.all}
                />
              </div>
            </>
          ) : null}
          {reportId === "transactions" ? (
            <>
              <div className="stack" style={{ minWidth: "12rem" }}>
                <SearchableSelect
                  label={t.common.customer}
                  value={txCustomerId}
                  options={customerOptions}
                  onChange={setTxCustomerId}
                />
              </div>
              <div className="stack" style={{ minWidth: "11rem" }}>
                <SearchableSelect
                  label={t.reports.transactionType}
                  value={txType}
                  options={[
                    { value: "ALL", label: t.common.all },
                    { value: "DEPOSIT", label: "DEPOSIT" },
                    { value: "WITHDRAWAL", label: "WITHDRAWAL" },
                    { value: "TRANSFER", label: "TRANSFER" },
                    { value: "EXCHANGE", label: "EXCHANGE" },
                    { value: "HAWALA", label: "HAWALA" },
                    { value: "EXPENSE", label: "EXPENSE" },
                    { value: "TRADE_BUY", label: "TRADE_BUY" },
                    { value: "TRADE_SELL", label: "TRADE_SELL" },
                    { value: "ADJUSTMENT", label: "ADJUSTMENT" },
                  ]}
                  onChange={setTxType}
                />
              </div>
              <div className="stack" style={{ minWidth: "11rem" }}>
                <CurrencyFilter
                  currencies={currencies}
                  value={txCurrency === "ALL" ? "" : txCurrency}
                  onChange={(code) => setTxCurrency(code || "ALL")}
                  allLabel={t.common.all}
                />
              </div>
              <div className="stack" style={{ minWidth: "10rem" }}>
                <SearchableSelect
                  label={t.common.status}
                  value={txStatus}
                  options={[
                    { value: "ALL", label: t.common.all },
                    { value: "POSTED", label: statusLabel(t, "POSTED") },
                    { value: "VOID", label: statusLabel(t, "VOID") },
                  ]}
                  onChange={setTxStatus}
                />
              </div>
              <label className="stack" style={{ minWidth: "8rem" }}>
                <span>{t.common.amount}</span>
                <input
                  value={txAmount}
                  onChange={(e) => setTxAmount(e.target.value)}
                  placeholder={t.common.amount}
                  inputMode="decimal"
                />
              </label>
              <label className="stack" style={{ minWidth: "10rem" }}>
                <span>{t.common.reference}</span>
                <input
                  value={txReference}
                  onChange={(e) => setTxReference(e.target.value)}
                  placeholder={t.common.reference}
                />
              </label>
              <label className="stack" style={{ minWidth: "12rem" }}>
                <span>{t.common.search}</span>
                <input
                  type="search"
                  className="desk-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t.reports.searchPlaceholder}
                />
              </label>
            </>
          ) : null}
        </div>
      ) : null}
        <ReportToolbar
          onPrint={exportPayload ? runPrintSheet : undefined}
          onCsv={exportPayload ? () => void runExport(exportPayload) : undefined}
          onPdf={exportPayload ? runPrintSheet : undefined}
        />
      </div>

      {error ? <PageLoadError message={error} onRetry={() => void load()} /> : null}
      {busy ? <p className="muted">{t.reports.loadingReports}</p> : null}

      {!busy && reportId === "overview" && overview ? (
        <OverviewBody data={overview} page={listPage} onPageChange={setListPage} />
      ) : null}

      {!busy && reportId === "daily" && daily ? (
        <div className="stack">
          <ReportSection title={t.desk.balancesByCurrency}>
            <PositionsTable rows={daily.positions} />
          </ReportSection>
          <ReportSection title={t.desk.activityBreakdown}>
            <CountGrid
              items={[
                { label: t.reports.deposits, value: daily.deposits },
                { label: t.reports.withdrawals, value: daily.withdrawals },
                { label: t.reports.transfers, value: daily.transfers },
                { label: t.reports.exchanges, value: daily.exchanges },
                { label: t.reports.hawala, value: daily.hawalas },
                { label: t.desk.otherTransactions, value: daily.otherTransactions },
              ]}
            />
          </ReportSection>
          <ReportSection title={t.reports.hawalaListTab}>
            {daily.transactions.length === 0 ? (
              <p className="muted">{t.reports.noDataPeriod}</p>
            ) : (
              <>
                <div className="report-table-wrap"><table className="report-ledger">
                  <thead>
                    <tr>
                      <th>{t.common.date}</th>
                      <th>{t.common.description}</th>
                      <th>{t.common.reference}</th>
                      <th>{t.common.status}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {daily.transactions.map((r) => (
                      <tr key={r.id} {...clickableRowProps(() => openTxOrDeal(r.id, r.type))}>
                        <td className="col-when">{formatWhen(r.valueDate)}</td>
                        <td>
                          <TransactionLine
                            strong
                            input={{
                              type: r.type,
                              reference: r.reference,
                              status: r.status === "POSTED" ? null : r.status,
                              customerName: r.customerName,
                              description: r.description,
                              amountSummary: r.amountSummary,
                              senderName: r.senderName,
                              receiverName: r.receiverName,
                            }}
                          />
                        </td>
                        <td className="col-ref">{txDisplayRef(r)}</td>
                        <td>{statusLabel(t, r.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
                <Pagination
                  page={daily.page}
                  pageSize={daily.pageSize}
                  total={daily.transactionsTotal}
                  onPageChange={setListPage}
                />
              </>
            )}
          </ReportSection>
        </div>
      ) : null}

      {!busy && reportId === "monthly" && monthly ? (
        <div className="stack">
          <ReportSection title={t.desk.balancesByCurrency}>
            <PositionsTable rows={monthly.positions} />
            <Pagination
              page={monthly.page}
              pageSize={monthly.pageSize}
              total={monthly.positionsTotal}
              onPageChange={setListPage}
            />
          </ReportSection>

          <ReportSection title={t.desk.activityBreakdown}>
            <CountGrid
              items={[
                { label: t.reports.totalTransactions, value: monthly.totalTransactions },
                { label: t.reports.deposits, value: monthly.deposits },
                { label: t.reports.withdrawals, value: monthly.withdrawals },
                { label: t.reports.transfers, value: monthly.transfers },
                { label: t.reports.exchanges, value: monthly.exchanges },
                { label: t.reports.hawala, value: monthly.hawalas },
              ]}
            />
          </ReportSection>

          {(monthly.hawalaSent.length > 0 ||
            monthly.hawalaReceived.length > 0 ||
            monthly.exchangeProfit.length > 0) && (
            <div className="monthly-extra-grid">
              {monthly.hawalaSent.length > 0 || monthly.hawalaReceived.length > 0 ? (
                <ReportSection title={t.reports.hawala}>
                  <div className="monthly-day-money">
                    <div className="monthly-day-money-col">
                      <div className="muted monthly-day-money-label">{t.status.sent}</div>
                      <AmountList rows={monthly.hawalaSent} flow="out" />
                    </div>
                    <div className="monthly-day-money-col">
                      <div className="muted monthly-day-money-label">{t.status.received}</div>
                      <AmountList rows={monthly.hawalaReceived} flow="in" />
                    </div>
                  </div>
                </ReportSection>
              ) : null}
              {monthly.exchangeProfit.length > 0 ? (
                <ReportSection title={t.dailyBook.exchangeProfit}>
                  <AmountList rows={monthly.exchangeProfit} flow="in" />
                </ReportSection>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {!busy && reportId === "cash-flow" && cashFlow ? (
        <div className="stack">
          <ReportSection title={t.desk.cashFlowByType}>
            {cashFlow.byType.length === 0 ? (
              <p className="muted">{t.reports.noDataPeriod}</p>
            ) : (
              <>
                <div className="report-table-wrap"><table className="report-ledger">
                  <thead>
                    <tr>
                      <th>{t.reports.transactionType}</th>
                      <th>{t.common.currency}</th>
                      <th>{t.common.count}</th>
                      <th className="col-amount">{t.desk.moneyComingIn}</th>
                      <th className="col-amount">{t.desk.moneyGoingOut}</th>
                      <th className="col-amount">{t.desk.netMovement}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cashFlow.byType.map((r) => (
                      <tr key={`${r.txType}-${r.currencyCode}`}>
                        <td>{r.txType}</td>
                        <td><CurrencyCodeWithFlag code={r.currencyCode} /></td>
                        <td>{r.count}</td>
                        <td className="col-amount">
                          <MoneyText amount={r.moneyIn} flow="in" />
                        </td>
                        <td className="col-amount">
                          <MoneyText amount={r.moneyOut} flow="out" />
                        </td>
                        <td className="col-amount">
                          <MoneyText amount={r.net} flow="neutral" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
                <Pagination
                  page={cashFlow.page}
                  pageSize={cashFlow.pageSize}
                  total={cashFlow.byTypeTotal}
                  onPageChange={setListPage}
                />
              </>
            )}
          </ReportSection>
        </div>
      ) : null}

      {!busy && reportId === "profit-loss" && profitLoss ? (
        <div className="stack">
          <ReportSection title={t.desk.activityBreakdown}>
            <CountGrid
              items={[
                { label: t.reports.exchanges, value: profitLoss.exchangeCount },
                { label: t.reports.sells, value: profitLoss.tradingSellCount },
                { label: t.reports.hawalaCommission, value: profitLoss.hawalaCount },
                { label: t.reports.employeeSalary, value: profitLoss.employeeSalaryCount },
                { label: t.nav.expenses, value: profitLoss.expenseCount },
              ]}
            />
          </ReportSection>
          <ReportSection title={t.reports.profitAndLoss}>
            <ProfitLossStatement
              emptyLabel={t.reports.noDataPeriod}
              lines={[
                {
                  key: "exchange",
                  label: t.dailyBook.exchangeProfit,
                  rows: profitLoss.exchangeProfit,
                  flow: "in",
                },
                {
                  key: "trading",
                  label: t.dailyBook.tradingProfit,
                  rows: profitLoss.tradingProfit,
                  flow: "in",
                },
                {
                  key: "hawala",
                  label: t.reports.hawalaCommission,
                  rows: profitLoss.hawalaCommission,
                  flow: "in",
                },
                {
                  key: "income",
                  label: t.reports.incomeTotal,
                  rows: profitLoss.incomeTotal,
                  flow: "in",
                },
                {
                  key: "salary",
                  label: t.reports.employeeSalary,
                  rows: profitLoss.employeeSalary,
                  flow: "out",
                },
                {
                  key: "other",
                  label: t.reports.otherExpenses,
                  rows: profitLoss.otherExpenses,
                  flow: "out",
                },
                {
                  key: "expenses",
                  label: t.dailyBook.expenses,
                  rows: profitLoss.expenses,
                  flow: "out",
                },
                {
                  key: "net",
                  label: t.dailyBook.netProfit,
                  rows: profitLoss.netProfit,
                  flow: "neutral",
                  emphasis: true,
                },
              ]}
            />
          </ReportSection>
        </div>
      ) : null}

      {!busy && reportId === "hawala" && hawalaPageData ? (
        <div className="stack">
          <div className="hawala-mode-toggle no-print" role="tablist" aria-label={t.reports.hawalaReport}>
            <button
              type="button"
              role="tab"
              aria-selected={hawalaView === "sums"}
              className={hawalaView === "sums" ? "hawala-mode active" : "hawala-mode"}
              onClick={() => setHawalaView("sums")}
            >
              {t.reports.hawalaSummaryTab}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={hawalaView === "list"}
              className={hawalaView === "list" ? "hawala-mode active" : "hawala-mode"}
              onClick={() => setHawalaView("list")}
            >
              {t.reports.hawalaListTab}
            </button>
          </div>

          {hawalaView === "sums" ? (
            <div className="monthly-extra-grid">
              <CurrencySumBoxes
                title={t.reports.hawalaSendTotals}
                rows={hawalaPageData.sentTotals}
                flow="out"
                emptyLabel={t.reports.noSumsPeriod}
              />
              <CurrencySumBoxes
                title={t.reports.hawalaReceiveTotals}
                rows={hawalaPageData.receivedTotals}
                flow="in"
                emptyLabel={t.reports.noSumsPeriod}
              />
            </div>
          ) : (
            <>
              <ReportSection title={t.reports.hawalaListTab}>
                {hawalaPageData.items.length === 0 ? (
                  <p className="muted">{t.reports.noDataPeriod}</p>
                ) : (
                  <div className="report-table-wrap"><table className="report-ledger">
                    <thead>
                      <tr>
                        <th>{t.common.date}</th>
                        <th>{t.common.reference}</th>
                        <th>{t.desk.direction}</th>
                        <th>{t.common.customer}</th>
                        <th>{t.common.currency}</th>
                        <th className="col-amount">{t.common.amount}</th>
                        <th>{t.common.status}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hawalaPageData.items.map((r) => {
                        const flow =
                          r.direction === "RECEIVE"
                            ? "in"
                            : r.direction === "SEND"
                              ? "out"
                              : "neutral";
                        return (
                          <tr
                            key={r.id}
                            {...clickableRowProps(() => navigate(`/hawala/${r.id}`))}
                          >
                            <td className="col-when">{formatWhen(r.valueDate)}</td>
                            <td className="col-ref">{txDisplayRef(r)}</td>
                            <td>
                              <FlowTag flow={flow}>{r.direction}</FlowTag>
                            </td>
                            <td>
                              {r.customerName ??
                                ([r.senderName, r.receiverName].filter(Boolean).join(" → ") ||
                                  "—")}
                            </td>
                            <td><CurrencyCodeWithFlag code={r.currencyCode} /></td>
                            <td className="col-amount">
                              <MoneyText amount={r.amount} flow={flow} />
                            </td>
                            <td>{statusLabel(t, r.status)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table></div>
                )}
              </ReportSection>
              <Pagination
                page={hawalaPageData.page}
                pageSize={hawalaPageData.pageSize}
                total={hawalaPageData.total}
                onPageChange={setHawalaPage}
              />
            </>
          )}
        </div>
      ) : null}

      {!busy && reportId === "movement-sums" && movementSums ? (
        <div className="stack">
          <div className="monthly-extra-grid">
            <CurrencySumBoxes
              title={t.reports.depositTotals}
              rows={movementSums.deposit.totals}
              flow="in"
              emptyLabel={t.reports.noSumsPeriod}
            />
            <CurrencySumBoxes
              title={t.reports.withdrawalTotals}
              rows={movementSums.withdrawal.totals}
              flow="out"
              emptyLabel={t.reports.noSumsPeriod}
            />
            <CurrencySumBoxes
              title={t.reports.transferTotals}
              rows={movementSums.transfer.totals}
              flow="neutral"
              emptyLabel={t.reports.noSumsPeriod}
            />
            <CurrencySumBoxes
              title={t.reports.exchangeGivenTotals}
              rows={movementSums.exchangeGiven.totals}
              flow="out"
              emptyLabel={t.reports.noSumsPeriod}
            />
            <CurrencySumBoxes
              title={t.reports.exchangeReceivedTotals}
              rows={movementSums.exchangeReceived.totals}
              flow="in"
              emptyLabel={t.reports.noSumsPeriod}
            />
            <CurrencySumBoxes
              title={t.dailyBook.exchangeProfit}
              rows={movementSums.exchangeProfit.totals}
              flow="in"
              emptyLabel={t.reports.noSumsPeriod}
            />
          </div>
        </div>
      ) : null}

      {!busy && reportId === "exchange" && exchange ? (
        <div className="stack">
          <ReportSection title={t.reports.hawalaListTab}>
            {exchange.items.length === 0 ? (
              <p className="muted">{t.reports.noDataPeriod}</p>
            ) : (
              <div className="report-table-wrap"><table className="report-ledger">
                <thead>
                  <tr>
                    <th>{t.common.date}</th>
                    <th>{t.common.reference}</th>
                    <th>{t.common.customer}</th>
                    <th className="col-amount">{t.common.from}</th>
                    <th>{t.desk.rate}</th>
                    <th className="col-amount">{t.common.to}</th>
                    <th className="col-amount">{t.desk.profit}</th>
                  </tr>
                </thead>
                <tbody>
                  {exchange.items.map((r) => (
                    <tr
                      key={r.id}
                      {...clickableRowProps(() => void dealModal.open(r.id))}
                    >
                      <td className="col-when">{formatWhen(r.valueDate)}</td>
                      <td className="col-ref">{txDisplayRef(r)}</td>
                      <td>{r.customerName ?? "—"}</td>
                      <td className="col-amount">
                        <MoneyText amount={r.fromAmount} currency={r.fromCurrency} flow="out" />
                      </td>
                      <td>
                        <span className="money money-neutral">{r.dealRate}</span>
                        {r.boardRate ? (
                          <div className="muted" style={{ fontSize: "0.78rem" }}>
                            board {r.boardRate}
                          </div>
                        ) : null}
                      </td>
                      <td className="col-amount">
                        <MoneyText amount={r.toAmount} currency={r.toCurrency} flow="in" />
                      </td>
                      <td className="col-amount">
                        <MoneyText
                          amount={r.profitAmount}
                          currency={r.profitCurrency}
                          flow="neutral"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </ReportSection>
          <Pagination
            page={exchange.page}
            pageSize={exchange.pageSize}
            total={exchange.total}
            onPageChange={setExchangePage}
          />
        </div>
      ) : null}

      {!busy && reportId === "customer-statement" ? (
        <div className="stack">
          {!customerId ? (
            <p className="muted">{t.reports.selectCustomerHint}</p>
          ) : statement ? (
            <>
              <p style={{ margin: 0 }}>
                <strong>{statement.customerName}</strong>
                {statement.customerCode ? ` · ${statement.customerCode}` : ""}
              </p>
              <ReportSection title={t.customers.balances}>
                {statement.balances.length === 0 ? (
                  <p className="muted">{t.reports.noBalances}</p>
                ) : (
                  <div className="report-table-wrap"><table className="report-ledger">
                    <thead>
                      <tr>
                        <th>{t.common.currency}</th>
                        <th className="col-amount">{t.desk.openingBalance}</th>
                        <th className="col-amount">{t.desk.moneyComingIn}</th>
                        <th className="col-amount">{t.desk.moneyGoingOut}</th>
                        <th className="col-amount">{t.desk.closingBalance}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statement.balances.map((b) => (
                        <tr key={b.currencyCode}>
                          <td>
                            <ReportCurrencyCell code={b.currencyCode} symbol={b.currencySymbol} />
                          </td>
                          <td className="col-amount">
                            <MoneyText amount={b.opening} />
                          </td>
                          <td className="col-amount">
                            <MoneyText amount={b.moneyIn} flow="in" />
                          </td>
                          <td className="col-amount">
                            <MoneyText amount={b.moneyOut} flow="out" />
                          </td>
                          <td className="col-amount">
                            <MoneyText amount={b.closing} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                )}
              </ReportSection>
              <ReportSection title={t.reports.hawalaListTab}>
                {statement.lines.length === 0 ? (
                  <p className="muted">{t.reports.noDataPeriod}</p>
                ) : (
                  <>
                    <div className="report-table-wrap"><table className="report-ledger">
                      <thead>
                        <tr>
                          <th>{t.common.date}</th>
                          <th>{t.common.description}</th>
                          <th className="col-amount">{t.common.balance}</th>
                          <th>{t.common.reference}</th>
                          <th>{t.common.status}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {statement.lines.map((line) => (
                          <tr
                            key={`${line.id}-${line.currencyCode}`}
                            {...clickableRowProps(() => openTxOrDeal(line.id, line.type))}
                          >
                            <td className="col-when">{formatWhen(line.valueDate)}</td>
                            <td>
                              <TransactionLine
                                strong
                                input={{
                                  type: line.type,
                                  reference: line.reference,
                                  status: line.status === "POSTED" ? null : line.status,
                                  customerName: statement.customerName,
                                  description: line.description,
                                  debit: line.debit,
                                  credit: line.credit,
                                  currencyCode: line.currencyCode,
                                  senderName: line.senderName,
                                  receiverName: line.receiverName,
                                }}
                              />
                            </td>
                            <td className="col-amount">
                              <MoneyText amount={line.balanceAfter} />
                              <div className="muted" style={{ fontSize: "var(--text-xs)" }}>
                                <CurrencyCodeWithFlag code={line.currencyCode} />
                              </div>
                            </td>
                            <td className="col-ref">{txDisplayRef(line)}</td>
                            <td>{statusLabel(t, line.status)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table></div>
                    <Pagination
                      page={statement.page}
                      pageSize={statement.pageSize}
                      total={statement.linesTotal}
                      onPageChange={setListPage}
                    />
                  </>
                )}
              </ReportSection>
            </>
          ) : null}
        </div>
      ) : null}

      {!busy && reportId === "transactions" && txPage ? (
        <div className="stack">
          <ReportSection title={t.reports.hawalaListTab}>
            {txPage.items.length === 0 ? (
              <p className="muted">{t.reports.noDataPeriod}</p>
            ) : (
              <div className="report-table-wrap"><table className="report-ledger">
                <thead>
                  <tr>
                    <th>{t.common.date}</th>
                    <th>{t.common.description}</th>
                    <th>{t.common.reference}</th>
                    <th>{t.common.status}</th>
                  </tr>
                </thead>
                <tbody>
                  {txPage.items.map((r) => (
                    <tr key={r.id} {...clickableRowProps(() => openTxOrDeal(r.id, r.type))}>
                      <td className="col-when">{formatWhen(r.valueDate)}</td>
                      <td>
                        <TransactionLine
                          strong
                          input={{
                            type: r.type,
                            reference: r.reference,
                            status: r.status === "POSTED" ? null : r.status,
                            customerName: r.customerName,
                            description: r.description,
                            amountSummary: r.amountSummary,
                            senderName: r.senderName,
                            receiverName: r.receiverName,
                          }}
                        />
                      </td>
                      <td className="col-ref">{txDisplayRef(r)}</td>
                      <td>{statusLabel(t, r.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </ReportSection>
          <Pagination
            page={txPage.page}
            pageSize={txPage.pageSize}
            total={txPage.total}
            onPageChange={setTxPageNum}
          />
        </div>
      ) : null}

      {!busy && reportId === "partners" && partnerReport ? (
        <div className="stack">
          <CountGrid
            items={[
              { label: t.common.partner, value: partnerReport.partnerCount },
              { label: t.status.sent, value: partnerReport.sendCount },
              { label: t.status.received, value: partnerReport.receiveCount },
              { label: t.reports.totalHawala, value: partnerReport.totalHawalas },
            ]}
          />
          <div className="monthly-extra-grid">
            <CurrencySumBoxes
              title={t.reports.hawalaSendTotals}
              rows={partnerReport.sendTotals}
              flow="out"
              emptyLabel={t.reports.noSumsPeriod}
            />
            <CurrencySumBoxes
              title={t.reports.hawalaReceiveTotals}
              rows={partnerReport.receiveTotals}
              flow="in"
              emptyLabel={t.reports.noSumsPeriod}
            />
            <CurrencySumBoxes
              title={t.reports.partnerPayments}
              rows={partnerReport.paymentTotals}
              flow="out"
              emptyLabel={t.reports.noSumsPeriod}
            />
            <CurrencySumBoxes
              title={t.reports.partnerCollections}
              rows={partnerReport.collectionTotals}
              flow="in"
              emptyLabel={t.reports.noSumsPeriod}
            />
          </div>

          <ReportSection title={t.reports.byPartner}>
            {partnerReport.partners.length === 0 ? (
              <p className="muted">{t.reports.noDataPeriod}</p>
            ) : (
              <>
                <div className="report-table-wrap"><table className="report-ledger">
                  <thead>
                    <tr>
                      <th>{t.common.partner}</th>
                      <th>{t.status.sent}</th>
                      <th>{t.status.received}</th>
                      <th>{t.reports.hawalaSendTotals}</th>
                      <th>{t.reports.hawalaReceiveTotals}</th>
                      <th>{t.reports.partnerPayments}</th>
                      <th>{t.reports.partnerCollections}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {partnerReport.partners.map((p) => (
                      <tr key={p.partnerId}>
                        <td>
                          <strong>{p.partnerName}</strong>
                        </td>
                        <td>{p.sendCount}</td>
                        <td>{p.receiveCount}</td>
                        <td>{formatAmountsList(p.sendTotals)}</td>
                        <td>{formatAmountsList(p.receiveTotals)}</td>
                        <td>{formatAmountsList(p.paymentTotals)}</td>
                        <td>{formatAmountsList(p.collectionTotals)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
                <Pagination
                  page={partnerReport.partnersPage}
                  pageSize={partnerReport.pageSize}
                  total={partnerReport.partnersTotal}
                  onPageChange={setPartnerTablePage}
                />
              </>
            )}
          </ReportSection>

          <ReportSection title={t.desk.partnerBalances}>
            {partnerReport.openCommission.length === 0 ? (
              <p className="muted">{t.reports.noDataPeriod}</p>
            ) : (
              <>
                <div className="report-table-wrap"><table className="report-ledger">
                  <thead>
                    <tr>
                      <th>{t.common.partner}</th>
                      <th>{t.common.currency}</th>
                      <th className="col-amount">{t.status.payable}</th>
                      <th className="col-amount">{t.status.receivable}</th>
                      <th className="col-amount">{t.common.net}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {partnerReport.openCommission.map((r) => (
                      <tr key={`${r.partnerId}-${r.currencyCode}`}>
                        <td>
                          <strong>{r.partnerName}</strong>
                        </td>
                        <td><CurrencyCodeWithFlag code={r.currencyCode} /></td>
                        <td className="col-amount">
                          <MoneyText amount={r.payable} flow="out" />
                        </td>
                        <td className="col-amount">
                          <MoneyText amount={r.receivable} flow="in" />
                        </td>
                        <td className="col-amount">
                          <MoneyText amount={r.net} flow="neutral" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
                <Pagination
                  page={partnerReport.openCommissionPage}
                  pageSize={partnerReport.pageSize}
                  total={partnerReport.openCommissionTotal}
                  onPageChange={setCommissionPage}
                />
              </>
            )}
          </ReportSection>

          <ReportSection title={t.reports.hawalaListTab}>
            {partnerReport.hawalas.length === 0 ? (
              <p className="muted">{t.reports.noDataPeriod}</p>
            ) : (
              <div className="report-table-wrap"><table className="report-ledger">
                <thead>
                  <tr>
                    <th>{t.common.date}</th>
                    <th>{t.common.partner}</th>
                    <th>{t.common.reference}</th>
                    <th>{t.desk.direction}</th>
                    <th>{t.common.currency}</th>
                    <th className="col-amount">{t.common.amount}</th>
                    <th className="col-amount">{t.reports.hawalaCommission}</th>
                    <th>{t.common.status}</th>
                  </tr>
                </thead>
                <tbody>
                  {partnerReport.hawalas.map((r) => (
                    <tr
                      key={r.id}
                      {...clickableRowProps(() => navigate(`/hawala/${r.id}`))}
                    >
                      <td className="col-when">{formatWhen(r.valueDate)}</td>
                      <td>{r.partnerName}</td>
                      <td className="col-ref">{txDisplayRef(r)}</td>
                      <td>
                        {r.direction === "RECEIVE"
                          ? t.desk.newReceive
                          : r.direction === "SEND"
                            ? t.desk.newSend
                            : r.direction}
                      </td>
                      <td><CurrencyCodeWithFlag code={r.currencyCode} /></td>
                      <td className="col-amount">
                        <MoneyText
                          amount={r.amount}
                          flow={r.direction === "RECEIVE" ? "in" : "out"}
                        />
                      </td>
                      <td className="col-amount">
                        {r.commissionAmount ? (
                          <MoneyText amount={r.commissionAmount} flow="neutral" />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{statusLabel(t, r.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </ReportSection>
          {partnerReport.totalHawalas > listPageSize ? (
            <Pagination
              page={partnerReport.page}
              pageSize={partnerReport.pageSize}
              total={partnerReport.totalHawalas}
              onPageChange={setPartnerHawalaPage}
            />
          ) : null}
        </div>
      ) : null}

      {!busy && reportId === "debtors" && debtorsPage && creditorsPage ? (
        <div className="stack">
          <ReportSection title={t.debtorsCreditors.debtors}>
            {debtorsPage.items.length === 0 ? (
              <p className="muted">{t.debtorsCreditors.emptyDebtors}</p>
            ) : (
              <>
                <div className="report-table-wrap"><table className="report-ledger">
                  <thead>
                    <tr>
                      <th>{t.common.customer}</th>
                      <th>{t.debtorsCreditors.accountNumber}</th>
                      <th>{t.common.currency}</th>
                      <th className="col-amount">{t.common.amount}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {debtorsPage.items.map((r) => (
                      <tr
                        key={`d-${r.customerId}-${r.currencyCode}`}
                        {...clickableRowProps(() => navigate(`/customers/${r.customerId}`))}
                      >
                        <td>
                          <strong>{r.customerName}</strong>
                        </td>
                        <td className="col-ref">{r.accountCode}</td>
                        <td><CurrencyCodeWithFlag code={r.currencyCode} /></td>
                        <td className="col-amount">
                          <MoneyText amount={r.amountDisplay} flow="in" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
                <Pagination
                  page={debtorsPage.page}
                  pageSize={debtorsPage.pageSize}
                  total={debtorsPage.total}
                  onPageChange={setDebtorsListPage}
                />
              </>
            )}
          </ReportSection>

          <ReportSection title={t.debtorsCreditors.creditors}>
            {creditorsPage.items.length === 0 ? (
              <p className="muted">{t.debtorsCreditors.emptyCreditors}</p>
            ) : (
              <>
                <div className="report-table-wrap"><table className="report-ledger">
                  <thead>
                    <tr>
                      <th>{t.common.customer}</th>
                      <th>{t.debtorsCreditors.accountNumber}</th>
                      <th>{t.common.currency}</th>
                      <th className="col-amount">{t.common.amount}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {creditorsPage.items.map((r) => (
                      <tr
                        key={`c-${r.customerId}-${r.currencyCode}`}
                        {...clickableRowProps(() => navigate(`/customers/${r.customerId}`))}
                      >
                        <td>
                          <strong>{r.customerName}</strong>
                        </td>
                        <td className="col-ref">{r.accountCode}</td>
                        <td><CurrencyCodeWithFlag code={r.currencyCode} /></td>
                        <td className="col-amount">
                          <MoneyText amount={r.amountDisplay} flow="out" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
                <Pagination
                  page={creditorsPage.page}
                  pageSize={creditorsPage.pageSize}
                  total={creditorsPage.total}
                  onPageChange={setCreditorsListPage}
                />
              </>
            )}
          </ReportSection>
        </div>
      ) : null}

      {!busy && reportId === "employees" ? (
        <div className="stack">
          <ReportSection title={t.employees.periodTotal}>
            <CountGrid
              items={[
                { label: t.common.total, value: employeePayTotalCount },
                ...employeePayTotals.map((row) => ({
                  id: row.currencyCode,
                  label: <CurrencyCodeWithFlag code={row.currencyCode} />,
                  value: <MoneyText amount={row.amount} flow="out" />,
                })),
              ]}
            />
          </ReportSection>
          <ReportSection title={t.employees.ledgerTitle}>
            {employeePayItems.length === 0 ? (
              <p className="muted report-empty">{t.employees.emptyHistory}</p>
            ) : (
              <div className="report-table-wrap"><table className="report-ledger">
                <thead>
                  <tr>
                    <th>{t.common.date}</th>
                    <th>{t.employees.employee}</th>
                    <th className="col-amount">{t.common.amount}</th>
                    <th>{t.common.reference}</th>
                  </tr>
                </thead>
                <tbody>
                  {employeePayItems.map((r) => (
                    <tr key={r.id}>
                      <td className="col-when">{String(r.valueDate).slice(0, 10)}</td>
                      <td>
                        <strong>{r.employeeName}</strong>
                      </td>
                      <td className="col-amount money-out">
                        <MoneyText
                          amount={r.amount}
                          currency={r.currencyCode}
                          flow="out"
                        />
                      </td>
                      <td className="ltr-text col-ref">{txDisplayRef(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
            <Pagination
              page={employeePayPage}
              pageSize={listPageSize}
              total={employeePayTotalCount}
              busy={busy}
              onPageChange={setEmployeePayPage}
            />
          </ReportSection>
        </div>
      ) : null}

      <TransactionDetailModal
        detail={txModal.detail}
        busy={txModal.busy}
        error={txModal.error}
        onClose={txModal.close}
      />
      <ExchangeDealDetailModal
        detail={dealModal.detail}
        busy={dealModal.busy}
        error={dealModal.error}
        onClose={dealModal.close}
      />
    </div>
  );
}
