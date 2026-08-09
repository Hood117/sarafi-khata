import { useCallback, useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import {
  getCashFlowReport,
  getCustomerStatementReport,
  getDailyReport,
  getExchangePeriodReport,
  getHawalaStatusReport,
  getMonthlyReport,
  getReportsOverview,
  getTransactionDetail,
  getTransactionsReport,
  listCurrenciesPage,
  listCustomersPage,
  type CashFlowReport,
  type CurrencyListItem,
  type CustomerListItem,
  type CustomerStatementReport,
  type DailyReport,
  type DayCurrencyPosition,
  type ExchangePeriodReport,
  type HawalaReportPage,
  type MonthlyReport,
  type ReportCurrencyAmount,
  type ReportsOverview,
  type TransactionDetail,
  type TransactionsReportPage,
} from "@desktop/api";
import { useAuth } from "@desktop/auth";
import { useT } from "@desktop/i18n";
import { todayIso } from "@desktop/lib/datetime";
import { statusLabel } from "@desktop/lib/i18n-labels";
import { Modal } from "@desktop/ui/modal";
import { Pagination } from "@desktop/ui/pagination";

type ReportId =
  | "hub"
  | "overview"
  | "daily"
  | "monthly"
  | "cash-flow"
  | "hawala"
  | "exchange"
  | "customer-statement"
  | "transactions";

type ReportMeta = {
  id: Exclude<ReportId, "hub">;
  title: string;
  blurb: string;
};

type MoneyFlow = "in" | "out" | "neutral";

function monthStart(isoDay: string): string {
  return `${isoDay.slice(0, 7)}-01`;
}

function formatWhen(value: string): string {
  if (!value) return "—";
  return value.length >= 19 ? value.slice(0, 19) : value.slice(0, 10);
}

function formatAmounts(rows: ReportCurrencyAmount[]): string {
  if (!rows.length) return "—";
  return rows
    .map((r) => `${r.amount} ${r.currencySymbol?.trim() || r.currencyCode}`)
    .join(" · ");
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((r) =>
      r
        .map((cell) => {
          const s = String(cell ?? "");
          if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
          return s;
        })
        .join(","),
    )
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function MoneyText({
  amount,
  currency,
  flow = "neutral",
}: {
  amount: string;
  currency?: string | null;
  flow?: MoneyFlow;
}) {
  const code = currency?.trim();
  return (
    <span className={`money money-${flow}`}>
      {amount}
      {code ? ` ${code}` : ""}
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
  if (!rows.length) return <span>—</span>;
  return (
    <ul className="money-list">
      {rows.map((r) => (
        <li key={r.currencyCode}>
          <MoneyText
            amount={r.amount}
            currency={r.currencySymbol?.trim() || r.currencyCode}
            flow={flow}
          />
        </li>
      ))}
    </ul>
  );
}

function AmountSummary({ text }: { text: string }) {
  if (!text || text === "—") return <span>—</span>;
  const parts = text.split("·").map((p) => p.trim()).filter(Boolean);
  return (
    <div className="money-summary">
      {parts.map((part, i) => {
        const isIn = part.startsWith("+");
        const isOut = part.startsWith("−") || part.startsWith("-");
        const flow: MoneyFlow = isIn ? "in" : isOut ? "out" : "neutral";
        const cleaned = part.replace(/^[+\-−]\s*/, "");
        return (
          <span key={`${part}-${i}`} className={`money-chip money-chip-${flow}`}>
            {isIn ? "+" : isOut ? "−" : ""}
            {cleaned}
          </span>
        );
      })}
    </div>
  );
}

function FlowTag({ flow, children }: { flow: MoneyFlow; children: ReactNode }) {
  return <span className={`flow-tag flow-tag-${flow}`}>{children}</span>;
}

function TotalCard({
  label,
  children,
  hint,
  flow = "neutral",
}: {
  label: string;
  children: ReactNode;
  hint?: ReactNode;
  flow?: MoneyFlow;
}) {
  return (
    <div className={`report-total report-total-${flow}`}>
      <div className="report-total-label">{label}</div>
      <div className="report-total-value">{children}</div>
      {hint ? <div className="report-total-hint">{hint}</div> : null}
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
    <div className="report-section stack">
      <div className="report-section-head">
        <h3>{title}</h3>
        {hint ? <p className="muted">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

function MoneyLegend() {
  const t = useT();
  return (
    <div className="report-legend no-print">
      <span className="report-legend-item">
        <span className="report-legend-dot in" aria-hidden />
        {t.desk.moneyComingIn}
      </span>
      <span className="report-legend-item">
        <span className="report-legend-dot out" aria-hidden />
        {t.desk.moneyGoingOut}
      </span>
    </div>
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
  if (!rows.length) return <p className="muted">{t.reports.noBalances}</p>;
  return (
    <table className="report-ledger">
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
              <strong>{r.currencyCode}</strong>
              {r.currencySymbol ? ` (${r.currencySymbol})` : ""}
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
    </table>
  );
}

function CountGrid({
  items,
}: {
  items: Array<{ label: string; value: number | string }>;
}) {
  return (
    <div className="report-totals">
      {items.map((item) => (
        <TotalCard key={item.label} label={item.label} flow="neutral">
          {item.value}
        </TotalCard>
      ))}
    </div>
  );
}

function ReportToolbar({
  onPrint,
  onCsv,
  onRefresh,
}: {
  onPrint: () => void;
  onCsv?: () => void;
  onRefresh: () => void;
}) {
  const t = useT();
  return (
    <div className="report-toolbar no-print">
      <button type="button" className="btn" onClick={onRefresh}>
        {t.desk.refresh}
      </button>
      <button type="button" className="btn" onClick={onPrint}>
        {t.common.print}
      </button>
      {onCsv ? (
        <button type="button" className="btn" onClick={onCsv}>
          {t.desk.exportCsv}
        </button>
      ) : null}
      <span className="muted report-toolbar-hint">{t.reports.pdfViaPrint}</span>
    </div>
  );
}

function ReportHeader({ title, filters }: { title: string; filters?: string }) {
  const { session } = useAuth();
  const t = useT();
  const now = new Date();
  return (
    <div className="report-print-header stack" style={{ gap: "0.2rem" }}>
      <div className="brand">Saraf</div>
      <h1 style={{ margin: 0, fontSize: "1.2rem" }}>{title}</h1>
      <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>
        {t.reports.generatedBy} {session?.fullName ?? "—"} · {now.toLocaleDateString()}{" "}
        {now.toLocaleTimeString()}
        {filters ? ` · ${t.reports.filters}: ${filters}` : ""}
      </p>
    </div>
  );
}

function TransactionDetailModal({
  detail,
  busy,
  error,
  onClose,
}: {
  detail: TransactionDetail | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const t = useT();
  if (!detail && !busy && !error) return null;
  return (
    <Modal
      title={
        detail
          ? t.customers.ledgerTitle.replace("{reference}", detail.reference)
          : t.desk.transactionsReport
      }
      size="lg"
      onClose={onClose}
    >
      <div className="stack">
        {busy ? <p className="muted">{t.common.loading}</p> : null}
        {error ? <p className="error">{error}</p> : null}
        {detail ? (
          <>
            <p className="muted" style={{ margin: 0 }}>
              {detail.activity}
            </p>
            <div className="customer-form-grid">
              <div>
                <span className="muted">{t.common.date}</span>
                <div>{detail.valueDate}</div>
              </div>
              <div>
                <span className="muted">{t.common.type}</span>
                <div>{detail.type}</div>
              </div>
              <div>
                <span className="muted">{t.common.status}</span>
                <div>{statusLabel(t, detail.status)}</div>
              </div>
              <div>
                <span className="muted">{t.common.customer}</span>
                <div>{detail.customerName ?? detail.walkInName ?? "—"}</div>
              </div>
            </div>
            {detail.description ? (
              <p style={{ margin: 0 }}>
                <span className="muted">{t.common.description}: </span>
                {detail.description}
              </p>
            ) : null}
            <h3 style={{ margin: "0.5rem 0 0", fontSize: "1rem" }}>{t.common.ledgerEntries}</h3>
            {detail.lines.length === 0 ? (
              <p className="muted">{t.common.noEntries}</p>
            ) : (
              <table className="report-ledger">
                <thead>
                  <tr>
                    <th>{t.common.wallet}</th>
                    <th>{t.common.currency}</th>
                    <th>{t.desk.direction}</th>
                    <th className="col-amount">{t.common.amount}</th>
                    <th>{t.common.description}</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.lines.map((line) => {
                    const flow: MoneyFlow =
                      line.direction === "DEBIT" ? "in" : "out";
                    return (
                      <tr key={line.id}>
                        <td>
                          {line.walletName}
                          <div className="muted" style={{ fontSize: "0.8rem" }}>
                            {line.walletType}
                          </div>
                        </td>
                        <td>
                          {line.currencyCode}
                          {line.currencySymbol ? ` (${line.currencySymbol})` : ""}
                        </td>
                        <td>
                          <FlowTag flow={flow}>
                            {line.direction === "DEBIT"
                              ? `${t.common.debit} (+)`
                              : `${t.common.credit} (−)`}
                          </FlowTag>
                        </td>
                        <td className="col-amount">
                          <MoneyText amount={line.amount} flow={flow} />
                        </td>
                        <td>{line.memo ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </>
        ) : null}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={onClose}>
            {t.common.close}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function OverviewBody({ data }: { data: ReportsOverview }) {
  const t = useT();
  return (
    <div className="stack">
      <MoneyLegend />
      <div className="report-totals">
        <TotalCard label={t.reports.totalTransactions} flow="neutral">
          {data.totalTransactions}
        </TotalCard>
        <TotalCard label={t.desk.moneyComingIn} flow="in">
          <AmountList rows={data.moneyIn} flow="in" />
        </TotalCard>
        <TotalCard label={t.desk.moneyGoingOut} flow="out">
          <AmountList rows={data.moneyOut} flow="out" />
        </TotalCard>
        <TotalCard label={t.desk.netMovement} flow="neutral">
          <AmountList rows={data.netMovement} flow="neutral" />
        </TotalCard>
        <TotalCard
          label={t.desk.hawalaReceived}
          flow="in"
          hint={formatAmounts(data.hawalaReceived)}
        >
          {data.hawalaReceivedCount}
        </TotalCard>
        <TotalCard
          label={t.desk.hawalaSent}
          flow="out"
          hint={formatAmounts(data.hawalaSent)}
        >
          {data.hawalaSentCount}
        </TotalCard>
        <TotalCard
          label={t.desk.currencyExchanges}
          flow="neutral"
          hint={`${t.desk.exchangeProfit}: ${formatAmounts(data.exchangeProfit)}`}
        >
          {data.exchangeCount}
        </TotalCard>
      </div>

      <ReportSection title={t.desk.activityBreakdown}>
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
      </ReportSection>

      <ReportSection title={t.desk.balancesByCurrency}>
        {data.balancesByCurrency.length === 0 ? (
          <p className="muted">{t.reports.noBalances}</p>
        ) : (
          <table className="report-ledger">
            <thead>
              <tr>
                <th>{t.common.currency}</th>
                <th className="col-amount">{t.common.balance}</th>
                <th className="col-amount">{t.desk.vaultBalance}</th>
                <th className="col-amount">{t.desk.till}</th>
              </tr>
            </thead>
            <tbody>
              {data.balancesByCurrency.map((r) => (
                <tr key={r.currencyCode}>
                  <td>
                    <strong>{r.currencyCode}</strong>
                    {r.currencySymbol ? ` (${r.currencySymbol})` : ""}
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
          </table>
        )}
      </ReportSection>
    </div>
  );
}

function DateRangeFilters({
  dateFrom,
  dateTo,
  onFrom,
  onTo,
  extra,
}: {
  dateFrom: string;
  dateTo: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  extra?: ReactNode;
}) {
  const t = useT();
  return (
    <div className="report-filters no-print">
      <p className="report-filters-title">{t.reports.filters}</p>
      <label className="stack">
        <span>{t.reports.fromDate}</span>
        <input type="date" value={dateFrom} onChange={(e) => onFrom(e.target.value)} />
      </label>
      <label className="stack">
        <span>{t.reports.toDate}</span>
        <input type="date" value={dateTo} onChange={(e) => onTo(e.target.value)} />
      </label>
      {extra}
    </div>
  );
}

export function ReportsPage() {
  const t = useT();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const reportParam = params.get("r") ?? "hub";
  const reportId = (
    [
      "hub",
      "overview",
      "daily",
      "monthly",
      "cash-flow",
      "hawala",
      "exchange",
      "customer-statement",
      "transactions",
    ].includes(reportParam)
      ? reportParam
      : "hub"
  ) as ReportId;

  const today = todayIso();
  const dayParam = params.get("day");
  const monthParam = params.get("month");
  const [dateFrom, setDateFrom] = useState(monthStart(today));
  const [dateTo, setDateTo] = useState(today);
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
  const [hawalaPageData, setHawalaPageData] = useState<HawalaReportPage | null>(null);
  const [hawalaPage, setHawalaPage] = useState(1);
  const [hawalaStatus, setHawalaStatus] = useState("ALL");
  const [hawalaDirection, setHawalaDirection] = useState("ALL");
  const [hawalaCurrency, setHawalaCurrency] = useState("ALL");
  const [hawalaCustomerId, setHawalaCustomerId] = useState("");
  const [hawalaReference, setHawalaReference] = useState("");
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
  const [statementCurrency, setStatementCurrency] = useState("ALL");
  const [statement, setStatement] = useState<CustomerStatementReport | null>(null);
  const [txDetail, setTxDetail] = useState<TransactionDetail | null>(null);
  const [txDetailBusy, setTxDetailBusy] = useState(false);
  const [txDetailError, setTxDetailError] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const catalog: ReportMeta[] = useMemo(
    () => [
      {
        id: "overview",
        title: t.desk.reportsOverview,
        blurb: t.dashboard.monthlyActivity,
      },
      {
        id: "daily",
        title: t.desk.dailyReport,
        blurb: t.desk.dailySummary,
      },
      {
        id: "monthly",
        title: t.desk.monthlyReport,
        blurb: t.pages.monthlyReport,
      },
      {
        id: "cash-flow",
        title: t.desk.cashFlowReport,
        blurb: t.desk.moneyComingIn,
      },
      {
        id: "hawala",
        title: t.reports.hawalaReport,
        blurb: t.reports.hawala,
      },
      {
        id: "exchange",
        title: t.desk.exchangeReport,
        blurb: t.reports.exchange,
      },
      {
        id: "customer-statement",
        title: t.desk.customerStatementReport,
        blurb: t.reports.customerStatement,
      },
      {
        id: "transactions",
        title: t.desk.transactionsReport,
        blurb: t.reports.transactions,
      },
    ],
    [t],
  );

  const openReport = useCallback(
    (id: ReportId, extra?: { day?: string; month?: string }) => {
      if (id === "hub") {
        setParams({});
        return;
      }
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
    if (reportId === "daily" && dayParam && /^\d{4}-\d{2}-\d{2}/.test(dayParam)) {
      setDay(dayParam.slice(0, 10));
    }
    if (reportId === "monthly" && monthParam && /^\d{4}-\d{2}/.test(monthParam)) {
      setMonth(monthParam.slice(0, 7));
    }
  }, [reportId, dayParam, monthParam]);

  const periodFilter = useMemo(() => {
    return { dateFrom, dateTo };
  }, [dateFrom, dateTo]);

  const load = useCallback(async () => {
    if (reportId === "hub") return;
    setBusy(true);
    setError(null);
    try {
      if (reportId === "overview") {
        setOverview(await getReportsOverview(periodFilter));
      } else if (reportId === "daily") {
        setDaily(await getDailyReport(day));
      } else if (reportId === "monthly") {
        setMonthly(await getMonthlyReport(month));
      } else if (reportId === "cash-flow") {
        setCashFlow(await getCashFlowReport(periodFilter));
      } else if (reportId === "hawala") {
        if (!customers.length || !currencies.length) {
          const [custPage, curPage] = await Promise.all([
            listCustomersPage({ archiveFilter: "active", page: 1, pageSize: 200 }),
            listCurrenciesPage({ activeOnly: true, pageSize: 200 }),
          ]);
          setCustomers(custPage.items);
          setCurrencies(curPage.items);
        }
        setHawalaPageData(
          await getHawalaStatusReport(
            {
              ...periodFilter,
              currencyCode: hawalaCurrency === "ALL" ? undefined : hawalaCurrency,
              customerId: hawalaCustomerId || undefined,
              reference: hawalaReference.trim() || undefined,
              direction: hawalaDirection === "ALL" ? undefined : hawalaDirection,
              page: hawalaPage,
              pageSize: 25,
            },
            hawalaStatus,
          ),
        );
      } else if (reportId === "exchange") {
        if (!customers.length || !currencies.length) {
          const [custPage, curPage] = await Promise.all([
            listCustomersPage({ archiveFilter: "active", page: 1, pageSize: 200 }),
            listCurrenciesPage({ activeOnly: true, pageSize: 200 }),
          ]);
          setCustomers(custPage.items);
          setCurrencies(curPage.items);
        }
        setExchange(
          await getExchangePeriodReport({
            ...periodFilter,
            fromCurrencyCode: fromCurrency === "ALL" ? undefined : fromCurrency,
            toCurrencyCode: toCurrency === "ALL" ? undefined : toCurrency,
            customerId: exchangeCustomerId || undefined,
            reference: exchangeReference.trim() || undefined,
            page: exchangePage,
            pageSize: 25,
          }),
        );
      } else if (reportId === "customer-statement") {
        if (!customers.length || !currencies.length) {
          const [custPage, curPage] = await Promise.all([
            listCustomersPage({ archiveFilter: "active", page: 1, pageSize: 200 }),
            listCurrenciesPage({ activeOnly: true, pageSize: 200 }),
          ]);
          setCustomers(custPage.items);
          setCurrencies(curPage.items);
        }
        if (customerId) {
          setStatement(
            await getCustomerStatementReport({
              ...periodFilter,
              customerId,
              currencyCode:
                statementCurrency === "ALL" ? undefined : statementCurrency,
            }),
          );
        } else {
          setStatement(null);
        }
      } else if (reportId === "transactions") {
        if (!customers.length || !currencies.length) {
          const [custPage, curPage] = await Promise.all([
            listCustomersPage({ archiveFilter: "active", page: 1, pageSize: 200 }),
            listCurrenciesPage({ activeOnly: true, pageSize: 200 }),
          ]);
          setCustomers(custPage.items);
          setCurrencies(curPage.items);
        }
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
              pageSize: 25,
            },
            txType,
          ),
        );
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [
    reportId,
    periodFilter,
    day,
    month,
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
    customerId,
    statementCurrency,
    customers.length,
    currencies.length,
    txPageNum,
    txType,
    txCustomerId,
    txCurrency,
    txStatus,
    txAmount,
    txReference,
    search,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

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

  async function openTxDetail(txId: string) {
    setTxDetail(null);
    setTxDetailBusy(true);
    setTxDetailError(null);
    try {
      setTxDetail(await getTransactionDetail(txId));
    } catch (err) {
      setTxDetailError(err instanceof Error ? err.message : String(err));
      setTxDetail(null);
    } finally {
      setTxDetailBusy(false);
    }
  }

  function closeTxDetail() {
    setTxDetail(null);
    setTxDetailError(null);
  }

  const activeMeta = catalog.find((r) => r.id === reportId);
  const filterLabel =
    reportId === "daily"
      ? day
      : reportId === "monthly"
        ? month
        : `${periodFilter.dateFrom} → ${periodFilter.dateTo}`;

  const onDayChange = (value: string) => {
    setDay(value);
    setParams({ r: "daily", day: value });
  };

  const onMonthChange = (value: string) => {
    setMonth(value);
    setParams({ r: "monthly", month: value });
  };

  if (reportId === "hub") {
    return (
      <div className="stack">
        <div className="report-hub-head">
          <h1>{t.nav.reports}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {t.desk.reportsOverview}
          </p>
        </div>
        <MoneyLegend />
        <div className="report-tile-grid">
          {catalog.map((report) => (
            <div key={report.id} className="report-tile">
              <button
                type="button"
                className="report-tile-body"
                onClick={() => openReport(report.id)}
              >
                <span className="report-tile-title">{report.title}</span>
                <span className="report-tile-blurb">{report.blurb}</span>
              </button>
            </div>
          ))}
        </div>
        <div className="report-section stack no-print">
          <div className="report-section-head">
            <h3>{t.desk.relatedScreens}</h3>
          </div>
          <div className="row" style={{ gap: "0.75rem", flexWrap: "wrap" }}>
            <Link to="/daybook">{t.desk.daybookLink}</Link>
            <Link to="/capital">{t.desk.ownerCapitalLink}</Link>
            <Link to="/vaults">{t.desk.vaultsLink}</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="stack report-page">
      <div className="report-page-bar no-print">
        <button type="button" className="btn" onClick={() => openReport("hub")}>
          {t.reports.backToReports}
        </button>
        <ReportToolbar
          onRefresh={() => void load()}
          onPrint={() => window.print()}
          onCsv={
            reportId === "transactions" && txPage
              ? () =>
                  downloadCsv("transactions-report.csv", [
                    ["Reference", "Type", "Status", "Customer", "Date", "Amounts"],
                    ...txPage.items.map((r) => [
                      r.reference,
                      r.type,
                      r.status,
                      r.customerName ?? "",
                      r.valueDate.slice(0, 19),
                      r.amountSummary,
                    ]),
                  ])
              : reportId === "hawala" && hawalaPageData
                ? () =>
                    downloadCsv("hawala-report.csv", [
                      [
                        "Reference",
                        "Direction",
                        "Status",
                        "Amount",
                        "Currency",
                        "Customer",
                        "Sender",
                        "Receiver",
                        "Date",
                      ],
                      ...hawalaPageData.items.map((r) => [
                        r.reference,
                        r.direction,
                        r.status,
                        r.amount,
                        r.currencyCode,
                        r.customerName ?? "",
                        r.senderName ?? "",
                        r.receiverName ?? "",
                        r.valueDate.slice(0, 19),
                      ]),
                    ])
                : reportId === "exchange" && exchange
                  ? () =>
                      downloadCsv("exchange-report.csv", [
                        [
                          "Reference",
                          "Side",
                          "Given",
                          "Received",
                          "Deal rate",
                          "Board rate",
                          "Profit",
                          "Customer",
                          "Date",
                        ],
                        ...exchange.items.map((r) => [
                          r.reference,
                          r.side,
                          `${r.fromAmount} ${r.fromCurrency}`,
                          `${r.toAmount} ${r.toCurrency}`,
                          r.dealRate,
                          r.boardRate ?? "",
                          `${r.profitAmount} ${r.profitCurrency}`,
                          r.customerName ?? "",
                          r.valueDate.slice(0, 19),
                        ]),
                      ])
                  : reportId === "customer-statement" && statement
                    ? () =>
                        downloadCsv("customer-statement.csv", [
                          [
                            "Date",
                            "Reference",
                            "Type",
                            "Status",
                            "Debit (in)",
                            "Credit (out)",
                            "Currency",
                            "Running balance",
                          ],
                          ...statement.lines.map((r) => [
                            r.valueDate.slice(0, 19),
                            r.reference,
                            r.type,
                            r.status,
                            r.debit,
                            r.credit,
                            r.currencyCode,
                            r.balanceAfter,
                          ]),
                        ])
                    : undefined
          }
        />
      </div>

      <ReportHeader title={activeMeta?.title ?? t.nav.reports} filters={filterLabel} />

      {reportId === "daily" ? (
        <div className="report-filters no-print">
          <p className="report-filters-title">{t.reports.filters}</p>
          <label className="stack">
            <span>{t.desk.businessDate}</span>
            <input type="date" value={day} onChange={(e) => onDayChange(e.target.value)} />
          </label>
        </div>
      ) : null}

      {reportId === "monthly" ? (
        <div className="report-filters no-print">
          <p className="report-filters-title">{t.reports.filters}</p>
          <label className="stack">
            <span>{t.desk.selectMonth}</span>
            <input
              type="month"
              value={month}
              onChange={(e) => onMonthChange(e.target.value)}
            />
          </label>
        </div>
      ) : null}

      {reportId === "overview" ||
      reportId === "cash-flow" ||
      reportId === "hawala" ||
      reportId === "exchange" ||
      reportId === "customer-statement" ||
      reportId === "transactions" ? (
        <DateRangeFilters
          dateFrom={dateFrom}
          dateTo={dateTo}
          onFrom={setDateFrom}
          onTo={setDateTo}
          extra={
            <>
              {reportId === "hawala" ? (
                <>
                  <label className="stack" style={{ gap: "0.25rem" }}>
                    <span>{t.desk.direction}</span>
                    <select
                      value={hawalaDirection}
                      onChange={(e) => setHawalaDirection(e.target.value)}
                    >
                      <option value="ALL">{t.common.all}</option>
                      <option value="SEND">{t.desk.newSend}</option>
                      <option value="RECEIVE">{t.desk.newReceive}</option>
                    </select>
                  </label>
                  <label className="stack" style={{ gap: "0.25rem" }}>
                    <span>{t.common.status}</span>
                    <select
                      value={hawalaStatus}
                      onChange={(e) => setHawalaStatus(e.target.value)}
                    >
                      <option value="ALL">{t.common.all}</option>
                      <option value="PENDING">PENDING</option>
                      <option value="SENT">SENT</option>
                      <option value="RECEIVED">RECEIVED</option>
                      <option value="COMPLETED">COMPLETED</option>
                      <option value="CANCELLED">CANCELLED</option>
                      <option value="RETURNED">RETURNED</option>
                    </select>
                  </label>
                  <label className="stack" style={{ gap: "0.25rem" }}>
                    <span>{t.common.currency}</span>
                    <select
                      value={hawalaCurrency}
                      onChange={(e) => setHawalaCurrency(e.target.value)}
                    >
                      <option value="ALL">{t.common.all}</option>
                      {currencies.map((c) => (
                        <option key={c.id} value={c.code}>
                          {c.code}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="stack" style={{ gap: "0.25rem", minWidth: "12rem" }}>
                    <span>{t.common.customer}</span>
                    <select
                      value={hawalaCustomerId}
                      onChange={(e) => setHawalaCustomerId(e.target.value)}
                    >
                      <option value="">{t.common.all}</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.fullName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="stack" style={{ gap: "0.25rem", minWidth: "10rem" }}>
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
                  <label className="stack" style={{ gap: "0.25rem" }}>
                    <span>{t.common.from}</span>
                    <select
                      value={fromCurrency}
                      onChange={(e) => setFromCurrency(e.target.value)}
                    >
                      <option value="ALL">{t.common.all}</option>
                      {currencies.map((c) => (
                        <option key={c.id} value={c.code}>
                          {c.code}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="stack" style={{ gap: "0.25rem" }}>
                    <span>{t.common.to}</span>
                    <select
                      value={toCurrency}
                      onChange={(e) => setToCurrency(e.target.value)}
                    >
                      <option value="ALL">{t.common.all}</option>
                      {currencies.map((c) => (
                        <option key={`to-${c.id}`} value={c.code}>
                          {c.code}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="stack" style={{ gap: "0.25rem", minWidth: "12rem" }}>
                    <span>{t.common.customer}</span>
                    <select
                      value={exchangeCustomerId}
                      onChange={(e) => setExchangeCustomerId(e.target.value)}
                    >
                      <option value="">{t.common.all}</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.fullName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="stack" style={{ gap: "0.25rem", minWidth: "10rem" }}>
                    <span>{t.common.reference}</span>
                    <input
                      value={exchangeReference}
                      onChange={(e) => setExchangeReference(e.target.value)}
                      placeholder={t.common.reference}
                    />
                  </label>
                </>
              ) : null}
              {reportId === "transactions" ? (
                <>
                  <label className="stack" style={{ gap: "0.25rem", minWidth: "12rem" }}>
                    <span>{t.common.customer}</span>
                    <select
                      value={txCustomerId}
                      onChange={(e) => setTxCustomerId(e.target.value)}
                    >
                      <option value="">{t.common.all}</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.fullName}
                          {c.code ? ` (${c.code})` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="stack" style={{ gap: "0.25rem" }}>
                    <span>{t.reports.transactionType}</span>
                    <select value={txType} onChange={(e) => setTxType(e.target.value)}>
                      <option value="ALL">{t.common.all}</option>
                      <option value="DEPOSIT">DEPOSIT</option>
                      <option value="WITHDRAWAL">WITHDRAWAL</option>
                      <option value="TRANSFER">TRANSFER</option>
                      <option value="EXCHANGE">EXCHANGE</option>
                      <option value="HAWALA">HAWALA</option>
                      <option value="EXPENSE">EXPENSE</option>
                      <option value="TRADE_BUY">TRADE_BUY</option>
                      <option value="TRADE_SELL">TRADE_SELL</option>
                      <option value="ADJUSTMENT">ADJUSTMENT</option>
                    </select>
                  </label>
                  <label className="stack" style={{ gap: "0.25rem" }}>
                    <span>{t.common.currency}</span>
                    <select
                      value={txCurrency}
                      onChange={(e) => setTxCurrency(e.target.value)}
                    >
                      <option value="ALL">{t.common.all}</option>
                      {currencies.map((c) => (
                        <option key={c.id} value={c.code}>
                          {c.code}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="stack" style={{ gap: "0.25rem" }}>
                    <span>{t.common.status}</span>
                    <select
                      value={txStatus}
                      onChange={(e) => setTxStatus(e.target.value)}
                    >
                      <option value="ALL">{t.common.all}</option>
                      <option value="POSTED">POSTED</option>
                      <option value="VOID">VOID</option>
                    </select>
                  </label>
                  <label className="stack" style={{ gap: "0.25rem", minWidth: "8rem" }}>
                    <span>{t.common.amount}</span>
                    <input
                      value={txAmount}
                      onChange={(e) => setTxAmount(e.target.value)}
                      placeholder={t.common.amount}
                      inputMode="decimal"
                    />
                  </label>
                  <label className="stack" style={{ gap: "0.25rem", minWidth: "10rem" }}>
                    <span>{t.common.reference}</span>
                    <input
                      value={txReference}
                      onChange={(e) => setTxReference(e.target.value)}
                      placeholder={t.common.reference}
                    />
                  </label>
                  <label className="stack" style={{ gap: "0.25rem", minWidth: "12rem" }}>
                    <span>{t.common.search}</span>
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={t.reports.searchPlaceholder}
                    />
                  </label>
                </>
              ) : null}
              {reportId === "customer-statement" ? (
                <>
                  <label className="stack" style={{ gap: "0.25rem", minWidth: "14rem" }}>
                    <span>{t.reports.selectCustomer}</span>
                    <select
                      value={customerId}
                      onChange={(e) => setCustomerId(e.target.value)}
                    >
                      <option value="">{t.reports.selectCustomerHint}</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.fullName}
                          {c.code ? ` (${c.code})` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="stack" style={{ gap: "0.25rem" }}>
                    <span>{t.common.currency}</span>
                    <select
                      value={statementCurrency}
                      onChange={(e) => setStatementCurrency(e.target.value)}
                    >
                      <option value="ALL">{t.common.all}</option>
                      {currencies.map((c) => (
                        <option key={c.id} value={c.code}>
                          {c.code}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : null}
            </>
          }
        />
      ) : null}

      {error ? <p className="error">{error}</p> : null}
      {busy ? <p className="muted">{t.reports.loadingReports}</p> : null}

      {reportId === "overview" && overview && !busy ? (
        <OverviewBody data={overview} />
      ) : null}

      {reportId === "daily" && daily && !busy ? (
        <div className="stack">
          <MoneyLegend />
          <div className="report-totals">
            <TotalCard label={t.reports.totalTransactions} flow="neutral">
              {daily.totalTransactions}
            </TotalCard>
            <TotalCard label={t.desk.moneyComingIn} flow="in">
              <AmountList rows={daily.moneyIn} flow="in" />
            </TotalCard>
            <TotalCard label={t.desk.moneyGoingOut} flow="out">
              <AmountList rows={daily.moneyOut} flow="out" />
            </TotalCard>
            <TotalCard label={t.desk.netMovement} flow="neutral">
              <AmountList rows={daily.netMovement} flow="neutral" />
            </TotalCard>
            <TotalCard
              label={t.desk.hawalaReceived}
              flow="in"
              hint={formatAmounts(daily.hawalaReceived)}
            >
              {daily.hawalaReceivedCount}
            </TotalCard>
            <TotalCard
              label={t.desk.hawalaSent}
              flow="out"
              hint={formatAmounts(daily.hawalaSent)}
            >
              {daily.hawalaSentCount}
            </TotalCard>
            <TotalCard
              label={t.desk.currencyExchanges}
              flow="neutral"
              hint={`${t.desk.exchangeProfit}: ${formatAmounts(daily.exchangeProfit)}`}
            >
              {daily.exchangeCount}
            </TotalCard>
          </div>

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

          <ReportSection title={t.desk.transactionsReport}>
            {daily.transactions.length === 0 ? (
              <p className="muted">{t.reports.noDataPeriod}</p>
            ) : (
              <table className="report-ledger">
                <thead>
                  <tr>
                    <th>{t.common.date}</th>
                    <th>{t.common.reference}</th>
                    <th>{t.reports.transactionType}</th>
                    <th>{t.common.customer}</th>
                    <th className="col-amount">{t.common.amount}</th>
                    <th>{t.common.status}</th>
                  </tr>
                </thead>
                <tbody>
                  {daily.transactions.map((r) => (
                    <tr key={r.id} {...clickableRowProps(() => void openTxDetail(r.id))}>
                      <td className="col-when">{formatWhen(r.valueDate)}</td>
                      <td className="col-ref">{r.reference}</td>
                      <td>{r.type}</td>
                      <td>{r.customerName ?? "—"}</td>
                      <td className="col-amount">
                        <AmountSummary text={r.amountSummary} />
                      </td>
                      <td>{statusLabel(t, r.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </ReportSection>
        </div>
      ) : null}

      {reportId === "monthly" && monthly && !busy ? (
        <div className="stack">
          <MoneyLegend />
          <div className="report-totals">
            <TotalCard label={t.reports.totalTransactions} flow="neutral">
              {monthly.totalTransactions}
            </TotalCard>
            <TotalCard label={t.desk.moneyComingIn} flow="in">
              <AmountList rows={monthly.moneyIn} flow="in" />
            </TotalCard>
            <TotalCard label={t.desk.moneyGoingOut} flow="out">
              <AmountList rows={monthly.moneyOut} flow="out" />
            </TotalCard>
            <TotalCard label={t.desk.netMovement} flow="neutral">
              <AmountList rows={monthly.netMovement} flow="neutral" />
            </TotalCard>
            <TotalCard
              label={t.desk.hawalaReceived}
              flow="in"
              hint={formatAmounts(monthly.hawalaReceived)}
            >
              {monthly.hawalaReceivedCount}
            </TotalCard>
            <TotalCard
              label={t.desk.hawalaSent}
              flow="out"
              hint={formatAmounts(monthly.hawalaSent)}
            >
              {monthly.hawalaSentCount}
            </TotalCard>
            <TotalCard
              label={t.desk.currencyExchanges}
              flow="neutral"
              hint={`${t.desk.exchangeProfit}: ${formatAmounts(monthly.exchangeProfit)}`}
            >
              {monthly.exchangeCount}
            </TotalCard>
          </div>

          <ReportSection title={t.desk.balancesByCurrency}>
            <PositionsTable rows={monthly.positions} />
          </ReportSection>

          <ReportSection title={t.desk.activityBreakdown}>
            <CountGrid
              items={[
                { label: t.reports.deposits, value: monthly.deposits },
                { label: t.reports.withdrawals, value: monthly.withdrawals },
                { label: t.reports.transfers, value: monthly.transfers },
                { label: t.reports.exchanges, value: monthly.exchanges },
                { label: t.reports.hawala, value: monthly.hawalas },
              ]}
            />
          </ReportSection>

          <ReportSection title={t.desk.dailyBreakdown} hint={t.desk.clickDayForDetail}>
            {monthly.days.length === 0 ? (
              <p className="muted">{t.reports.noDataPeriod}</p>
            ) : (
              <table className="report-ledger">
                <thead>
                  <tr>
                    <th>{t.common.date}</th>
                    <th>{t.reports.totalTransactions}</th>
                    <th>{t.reports.deposits}</th>
                    <th>{t.reports.withdrawals}</th>
                    <th>{t.reports.transfers}</th>
                    <th>{t.reports.exchanges}</th>
                    <th>{t.reports.hawala}</th>
                    <th className="col-amount">{t.desk.moneyComingIn}</th>
                    <th className="col-amount">{t.desk.moneyGoingOut}</th>
                    <th className="col-amount">{t.desk.netMovement}</th>
                  </tr>
                </thead>
                <tbody>
                  {monthly.days.map((d) => (
                    <tr
                      key={d.businessDate}
                      {...clickableRowProps(() =>
                        openReport("daily", { day: d.businessDate }),
                      )}
                    >
                      <td className="col-when">
                        <strong>{d.businessDate}</strong>
                      </td>
                      <td>{d.totalTransactions}</td>
                      <td>{d.deposits}</td>
                      <td>{d.withdrawals}</td>
                      <td>{d.transfers}</td>
                      <td>{d.exchanges}</td>
                      <td>{d.hawalas}</td>
                      <td className="col-amount">
                        <span className="money money-in">{formatAmounts(d.moneyIn)}</span>
                      </td>
                      <td className="col-amount">
                        <span className="money money-out">{formatAmounts(d.moneyOut)}</span>
                      </td>
                      <td className="col-amount">
                        <span className="money money-neutral">
                          {formatAmounts(d.netMovement)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </ReportSection>
        </div>
      ) : null}

      {reportId === "cash-flow" && cashFlow && !busy ? (
        <div className="stack">
          <MoneyLegend />
          <div className="report-totals">
            <TotalCard label={t.desk.moneyComingIn} flow="in">
              <AmountList rows={cashFlow.moneyIn} flow="in" />
            </TotalCard>
            <TotalCard label={t.desk.moneyGoingOut} flow="out">
              <AmountList rows={cashFlow.moneyOut} flow="out" />
            </TotalCard>
            <TotalCard label={t.desk.netMovement} flow="neutral">
              <AmountList rows={cashFlow.byCurrency} flow="neutral" />
            </TotalCard>
          </div>
          <ReportSection title={t.desk.cashFlowByType}>
            {cashFlow.byType.length === 0 ? (
              <p className="muted">{t.reports.noDataPeriod}</p>
            ) : (
              <table className="report-ledger">
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
                      <td>{r.currencyCode}</td>
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
              </table>
            )}
          </ReportSection>
        </div>
      ) : null}

      {reportId === "hawala" && hawalaPageData && !busy ? (
        <div className="stack">
          <MoneyLegend />
          <div className="report-totals">
            <TotalCard
              label={t.reports.totalHawala}
              flow="neutral"
              hint={formatAmounts(hawalaPageData.totalsByCurrency)}
            >
              {hawalaPageData.total}
            </TotalCard>
            <TotalCard
              label={t.desk.hawalaSent}
              flow="out"
              hint={formatAmounts(hawalaPageData.sentTotals)}
            >
              {hawalaPageData.sentCount}
            </TotalCard>
            <TotalCard
              label={t.desk.hawalaReceived}
              flow="in"
              hint={formatAmounts(hawalaPageData.receivedTotals)}
            >
              {hawalaPageData.receivedCount}
            </TotalCard>
          </div>
          <ReportSection title={t.reports.hawalaReport}>
            {hawalaPageData.items.length === 0 ? (
              <p className="muted">{t.reports.noDataPeriod}</p>
            ) : (
              <table className="report-ledger">
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
                        <td className="col-ref">{r.reference}</td>
                        <td>
                          <FlowTag flow={flow}>{r.direction}</FlowTag>
                        </td>
                        <td>
                          {r.customerName ??
                            ([r.senderName, r.receiverName].filter(Boolean).join(" → ") ||
                              "—")}
                        </td>
                        <td>{r.currencyCode}</td>
                        <td className="col-amount">
                          <MoneyText amount={r.amount} flow={flow} />
                        </td>
                        <td>{statusLabel(t, r.status)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </ReportSection>
          <Pagination
            page={hawalaPageData.page}
            pageSize={hawalaPageData.pageSize}
            total={hawalaPageData.total}
            onPageChange={setHawalaPage}
          />
        </div>
      ) : null}

      {reportId === "exchange" && exchange && !busy ? (
        <div className="stack">
          <MoneyLegend />
          <div className="report-totals">
            <TotalCard label={t.desk.currencyExchanges} flow="neutral">
              {exchange.totalDeals}
            </TotalCard>
            <TotalCard label={t.common.from} flow="out">
              <AmountList rows={exchange.givenTotals} flow="out" />
            </TotalCard>
            <TotalCard label={t.common.to} flow="in">
              <AmountList rows={exchange.receivedTotals} flow="in" />
            </TotalCard>
            <TotalCard label={t.desk.exchangeProfit} flow="neutral">
              <AmountList rows={exchange.profitByCurrency} flow="neutral" />
            </TotalCard>
          </div>
          <ReportSection title={t.desk.exchangeReport}>
            {exchange.items.length === 0 ? (
              <p className="muted">{t.reports.noDataPeriod}</p>
            ) : (
              <table className="report-ledger">
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
                      {...clickableRowProps(() => void openTxDetail(r.transactionId))}
                    >
                      <td className="col-when">{formatWhen(r.valueDate)}</td>
                      <td className="col-ref">{r.reference}</td>
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
              </table>
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

      {reportId === "customer-statement" && !busy ? (
        <div className="stack">
          {!customerId ? (
            <p className="muted">{t.reports.selectCustomerHint}</p>
          ) : statement ? (
            <>
              <p style={{ margin: 0 }}>
                <strong>{statement.customerName}</strong>
                {statement.customerCode ? ` · ${statement.customerCode}` : ""}
                {` · ${statement.dateFrom} → ${statement.dateTo}`}
              </p>
              <MoneyLegend />
              <div className="report-totals">
                <TotalCard label={t.desk.moneyComingIn} flow="in">
                  <AmountList rows={statement.moneyIn} flow="in" />
                </TotalCard>
                <TotalCard label={t.desk.moneyGoingOut} flow="out">
                  <AmountList rows={statement.moneyOut} flow="out" />
                </TotalCard>
              </div>
              <ReportSection title={t.customers.balances}>
                {statement.balances.length === 0 ? (
                  <p className="muted">{t.reports.noBalances}</p>
                ) : (
                  <table className="report-ledger">
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
                            <strong>{b.currencyCode}</strong>
                            {b.currencySymbol ? ` (${b.currencySymbol})` : ""}
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
                  </table>
                )}
              </ReportSection>
              <ReportSection title={t.desk.transactionsReport}>
                {statement.lines.length === 0 ? (
                  <p className="muted">{t.reports.noDataPeriod}</p>
                ) : (
                  <table className="report-ledger">
                    <thead>
                      <tr>
                        <th>{t.common.date}</th>
                        <th>{t.common.reference}</th>
                        <th>{t.reports.transactionType}</th>
                        <th>{t.common.currency}</th>
                        <th className="col-amount">{t.desk.moneyComingIn}</th>
                        <th className="col-amount">{t.desk.moneyGoingOut}</th>
                        <th className="col-amount">{t.common.balance}</th>
                        <th>{t.common.status}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statement.lines.map((line) => (
                        <tr
                          key={`${line.id}-${line.currencyCode}`}
                          {...clickableRowProps(() => void openTxDetail(line.id))}
                        >
                          <td className="col-when">{formatWhen(line.valueDate)}</td>
                          <td className="col-ref">{line.reference}</td>
                          <td>{line.type}</td>
                          <td>{line.currencyCode}</td>
                          <td className="col-amount">
                            <MoneyText amount={line.debit} flow="in" />
                          </td>
                          <td className="col-amount">
                            <MoneyText amount={line.credit} flow="out" />
                          </td>
                          <td className="col-amount">
                            <MoneyText amount={line.balanceAfter} />
                          </td>
                          <td>{statusLabel(t, line.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </ReportSection>
            </>
          ) : null}
        </div>
      ) : null}

      {reportId === "transactions" && txPage && !busy ? (
        <div className="stack">
          <MoneyLegend />
          <div className="report-totals">
            <TotalCard label={t.reports.totalTransactions} flow="neutral">
              {txPage.total}
            </TotalCard>
          </div>
          <ReportSection title={t.desk.transactionsReport}>
            {txPage.items.length === 0 ? (
              <p className="muted">{t.reports.noDataPeriod}</p>
            ) : (
              <table className="report-ledger">
                <thead>
                  <tr>
                    <th>{t.common.date}</th>
                    <th>{t.common.reference}</th>
                    <th>{t.reports.transactionType}</th>
                    <th>{t.common.customer}</th>
                    <th className="col-amount">{t.common.amount}</th>
                    <th>{t.common.status}</th>
                  </tr>
                </thead>
                <tbody>
                  {txPage.items.map((r) => (
                    <tr key={r.id} {...clickableRowProps(() => void openTxDetail(r.id))}>
                      <td className="col-when">{formatWhen(r.valueDate)}</td>
                      <td className="col-ref">{r.reference}</td>
                      <td>{r.type}</td>
                      <td>{r.customerName ?? "—"}</td>
                      <td className="col-amount">
                        <AmountSummary text={r.amountSummary} />
                      </td>
                      <td>{statusLabel(t, r.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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

      <TransactionDetailModal
        detail={txDetail}
        busy={txDetailBusy}
        error={txDetailError}
        onClose={closeTxDetail}
      />
    </div>
  );
}

