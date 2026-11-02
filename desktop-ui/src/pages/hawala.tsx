import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  archiveHawala,
  getHawala,
  listCurrenciesPage,
  listHawalaDesk,
  type CurrencyListItem,
  type HawalaDetail,
  type HawalaListCommissionTotal,
  type HawalaListItem,
  type HawalaListPage,
} from "@desktop/api";
import type { Dictionary } from "@/lib/i18n/messages/types";
import { useAuth } from "@desktop/auth";
import {
  CompleteReceiveHawalaModal,
  isPendingReceiveHawala,
} from "@desktop/components/complete-receive-hawala-modal";
import { HawalaFormModal } from "@desktop/components/hawala-form-modal";
import { DESK_MOVEMENT_SAVED_EVENT } from "@desktop/components/quick-actions-bar";
import { SendHawalaFormModal } from "@desktop/components/send-hawala-form-modal";
import { clickableTxRowProps } from "@desktop/components/transaction-detail-modal";
import { useT } from "@desktop/i18n";
import {
  datePeriodRange,
  errorMessage,
  todayIso,
  type DatePeriodPreset,
} from "@desktop/lib/datetime";
import { PageLoadError } from "@desktop/ui/page-load-error";
import { DeskContextMenu } from "@desktop/ui/desk-context-menu";
import { Pagination } from "@desktop/ui/pagination";
import { useSuccessModal } from "@desktop/ui/use-success-modal";
import { statusLabel } from "@desktop/lib/i18n-labels";
import { hawalaNumberRef } from "@desktop/lib/tx-ref";
import { CurrencyCodeWithFlag } from "@desktop/ui/currency-flag";
import { CurrencyFilter } from "@desktop/ui/currency-filter";
import {
  formatAmountDisplay,
  isSimpleDeskHawala,
  parseMoney,
  statusBadgeClass,
} from "@desktop/pages/hawala-helpers";
import { sendHawalaWhatsAppToPartner } from "@desktop/lib/hawala-whatsapp";

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function exportCsv(rows: HawalaListItem[], t: Dictionary) {
  const headers = [
    t.common.date,
    t.desk.hawalaNumber,
    t.common.type,
    t.hawala.sender,
    t.hawala.receiver,
    t.common.currency,
    t.common.amount,
    t.common.commission,
    t.common.status,
  ];
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(
      [
        String(row.valueDate).slice(0, 10),
        hawalaNumberRef(row),
        row.direction,
        row.senderName ?? "",
        row.receiverName ?? "",
        row.currencyCode,
        row.amount,
        row.ownCommission ?? "",
        row.status,
      ]
        .map((c) => escapeCsv(String(c)))
        .join(","),
    );
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `hawala-export-${todayIso()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function commissionLines(totals: HawalaListCommissionTotal[]): string {
  if (!totals.length) return "0";
  return totals
    .map((row) => `${formatAmountDisplay(row.total)} ${row.currencyCode}`)
    .join("\n");
}

export function HawalaPage() {
  const { session } = useAuth();
  const t = useT();
  const navigate = useNavigate();
  const defaultRange = useMemo(() => datePeriodRange("today", todayIso()), []);

  const [pageData, setPageData] = useState<HawalaListPage | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [currencyFilter, setCurrencyFilter] = useState("");
  const [periodPreset, setPeriodPreset] = useState<DatePeriodPreset>("today");
  const [dateFrom, setDateFrom] = useState(defaultRange.from);
  const [dateTo, setDateTo] = useState(defaultRange.to);
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [currencies, setCurrencies] = useState<CurrencyListItem[]>([]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowMenu, setRowMenu] = useState<{
    x: number;
    y: number;
    row: HawalaListItem;
  } | null>(null);
  const { showSuccess, successModal } = useSuccessModal();
  const [editOpen, setEditOpen] = useState(false);
  const [simpleEditOpen, setSimpleEditOpen] = useState(false);
  const [editHawalaId, setEditHawalaId] = useState<string | null>(null);
  const [editDirection, setEditDirection] = useState<"SEND" | "RECEIVE">("SEND");
  const [whatsappBusy, setWhatsappBusy] = useState(false);
  const [completeTarget, setCompleteTarget] = useState<HawalaDetail | null>(null);
  const [completeBusy, setCompleteBusy] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

  const applyPreset = useCallback((preset: Exclude<DatePeriodPreset, "custom">) => {
    const range = datePeriodRange(preset, todayIso());
    setPeriodPreset(preset);
    setDateFrom(range.from);
    setDateTo(range.to);
    setPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    const range = datePeriodRange("today", todayIso());
    setPeriodPreset("today");
    setDateFrom(range.from);
    setDateTo(range.to);
    setDirection("ALL");
    setStatusFilter("ALL");
    setCurrencyFilter("");
    setSearchInput("");
    setSearch("");
    setPage(1);
  }, []);

  function openEditModal(row: HawalaListItem) {
    void (async () => {
      try {
        const detail = await getHawala(row.id);
        if (isSimpleDeskHawala(detail)) {
          setEditHawalaId(row.id);
          setEditDirection(
            detail.direction.toUpperCase() === "RECEIVE" ? "RECEIVE" : "SEND",
          );
          setSimpleEditOpen(true);
          return;
        }
        setEditHawalaId(row.id);
        setEditDirection(
          detail.direction.toUpperCase() === "RECEIVE" ? "RECEIVE" : "SEND",
        );
        setEditOpen(true);
      } catch {
        setEditHawalaId(row.id);
        setEditDirection(
          row.direction.toUpperCase() === "RECEIVE" ? "RECEIVE" : "SEND",
        );
        setEditOpen(true);
      }
    })();
  }

  useEffect(() => {
    void listCurrenciesPage({ activeOnly: true, pageSize: 100 })
      .then((ccy) => setCurrencies(ccy.items))
      .catch((err: unknown) => {
        setError(errorMessage(err, t.errors.loadGeneric));
      });
  }, [t.errors.loadGeneric]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = searchInput.trim();
      if (next === search) return;
      setSearch(next);
      setPage(1);
    }, 280);
    return () => window.clearTimeout(timer);
  }, [searchInput, search]);

  useEffect(() => {
    setPage(1);
  }, [dateFrom, dateTo, direction, statusFilter, currencyFilter]);

  useEffect(() => {
    const onSaved = () => setReloadKey((k) => k + 1);
    window.addEventListener(DESK_MOVEMENT_SAVED_EVENT, onSaved);
    return () => window.removeEventListener(DESK_MOVEMENT_SAVED_EVENT, onSaved);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    void listHawalaDesk({
      page,
      pageSize: 25,
      search: search.trim() || undefined,
      direction: direction === "ALL" ? undefined : direction,
      status: statusFilter === "ALL" ? undefined : statusFilter,
      currencyCode: currencyFilter || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      archiveFilter: "active",
      sort: "date_desc",
    })
      .then((result) => {
        if (!cancelled) {
          setPageData(result);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(errorMessage(err, t.errors.loadGeneric));
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    page,
    search,
    direction,
    statusFilter,
    currencyFilter,
    dateFrom,
    dateTo,
    reloadKey,
    t.errors.loadGeneric,
  ]);

  async function handleArchive(id: string) {
    if (!session) return;
    if (!window.confirm(t.hawala.archiveConfirmSoft)) {
      return;
    }
    setBusy(true);
    try {
      await archiveHawala({ id, actorUserId: session.userId });
      setReloadKey((k) => k + 1);
      showSuccess(t.hawala.archivedOk);
    } catch (err: unknown) {
      setError(errorMessage(err, t.errors.hawalaSave));
    } finally {
      setBusy(false);
    }
  }

  async function openCompleteModal(id: string) {
    setCompleteError(null);
    setBusy(true);
    try {
      const detail = await getHawala(id);
      setCompleteTarget(detail);
    } catch (err: unknown) {
      setError(errorMessage(err, t.errors.loadGeneric));
    } finally {
      setBusy(false);
    }
  }

  async function handleWhatsApp(id: string) {
    setWhatsappBusy(true);
    setError(null);
    try {
      const result = await sendHawalaWhatsAppToPartner(id, t.hawala.whatsappMessage);
      if (!result.ok) {
        setError(
          result.reason === "missing_phone"
            ? t.hawala.whatsappPartnerMissingPhone
            : result.error || t.errors.loadGeneric,
        );
      }
    } finally {
      setWhatsappBusy(false);
    }
  }

  const totals = pageData?.commissionTotals ?? [];

  return (
    <div className="stack hawala-desk-page workspace-page is-hawala">
      {error ? (
        <PageLoadError
          message={error}
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      ) : null}

      <section className="panel records-panel hawala-filters no-print">
        <div className="records-chrome">
          <div className="records-title">
            <div>
              <h2>{t.nav.hawala}</h2>
            </div>
            <div className="records-title-actions hawala-filters-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => navigate("/hawala/commission")}
              >
                {t.nav.commissionTracking}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={!pageData?.items.length}
                onClick={() => pageData && exportCsv(pageData.items, t)}
              >
                {t.desk.exportCsv}
              </button>
              <button type="button" className="secondary" onClick={() => window.print()}>
                {t.common.print}
              </button>
            </div>
          </div>
          <div className="table-toolbar" style={{ flexDirection: "column", alignItems: "stretch" }}>
            <div className="report-period-presets" role="group" aria-label={t.common.filter}>
              {(
                [
                  ["today", t.common.today],
                  ["yesterday", t.common.yesterday],
                  ["week", t.common.thisWeek],
                  ["month", t.common.thisMonth],
                  ["custom", t.common.custom],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={
                    periodPreset === id
                      ? "report-period-preset active"
                      : "report-period-preset"
                  }
                  onClick={() => {
                    if (id === "custom") {
                      setPeriodPreset("custom");
                      return;
                    }
                    applyPreset(id);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="commission-tracking-filter-row table-filters">
              <label className="stack" style={{ gap: "0.25rem" }}>
                <span className="muted">{t.common.from}</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setPeriodPreset("custom");
                    setDateFrom(e.target.value);
                  }}
                />
              </label>
              <label className="stack" style={{ gap: "0.25rem" }}>
                <span className="muted">{t.common.to}</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setPeriodPreset("custom");
                    setDateTo(e.target.value);
                  }}
                />
              </label>
              <label className="stack" style={{ gap: "0.25rem", minWidth: "9rem" }}>
                <span className="muted">{t.commissionTracking.hawalaType}</span>
                <select
                  value={direction}
                  onChange={(e) => setDirection(e.target.value)}
                >
                  <option value="ALL">{t.common.all}</option>
                  <option value="SEND">{t.commissionTracking.typeSent}</option>
                  <option value="RECEIVE">{t.commissionTracking.typeReceived}</option>
                </select>
              </label>
              <label className="stack" style={{ gap: "0.25rem", minWidth: "9rem" }}>
                <span className="muted">{t.common.status}</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="ALL">{t.common.all}</option>
                  <option value="PENDING">{t.status.pending}</option>
                  <option value="COMPLETED">{t.status.completed}</option>
                </select>
              </label>
              <div style={{ minWidth: "12rem" }}>
                <CurrencyFilter
                  currencies={currencies}
                  value={currencyFilter}
                  onChange={setCurrencyFilter}
                  allLabel={t.desk.allCurrenciesFilter}
                  label={t.common.currency}
                />
              </div>
              <label className="search-field" style={{ flex: "1 1 14rem", maxWidth: "none" }}>
                <input
                  type="search"
                  className="desk-search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder={t.hawala.searchPlaceholder}
                  aria-label={t.common.search}
                />
              </label>
              <button type="button" className="secondary" onClick={clearFilters}>
                {t.hawala.clearFilters}
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className="stat-grid hawala-kpi-strip">
        <div className="stat-card">
          <div className="stat-label">{t.hawala.totalHawalas}</div>
          <div className="stat-value">{pageData?.total ?? 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">{t.status.pending}</div>
          <div className="stat-value">{pageData?.pending ?? 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">{t.status.completed}</div>
          <div className="stat-value">{pageData?.completed ?? 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">{t.hawala.totalCommission}</div>
          <div className="stat-value commission-stat-value">
            {commissionLines(totals)}
          </div>
        </div>
      </div>

      <section className="panel records-panel">
        <div className="records-chrome">
          <div className="records-title">
            <div>
              <h2>{t.nav.hawala}</h2>
              <span className="count-badge">{pageData?.total ?? 0}</span>
            </div>
          </div>
        </div>
        {busy && !pageData ? <p className="muted" style={{ padding: "18px" }}>{t.common.loading}</p> : null}
        {pageData ? (
          <>
            <div className="daybook-journal-scroll table-scroll">
              <table className="report-ledger daybook-journal-table hawala-desk-table">
                <thead>
                  <tr>
                    <th className="col-when">{t.common.date}</th>
                    <th className="col-ref">{t.desk.hawalaNumber}</th>
                    <th>{t.common.type}</th>
                    <th>{t.hawala.sender}</th>
                    <th>{t.hawala.receiver}</th>
                    <th className="col-amount">{t.common.amount}</th>
                    <th className="col-amount">{t.common.commission}</th>
                    <th>{t.common.status}</th>
                    <th className="col-actions">{t.common.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {pageData.items.map((row) => {
                    const sent = row.direction.toUpperCase() === "SEND";
                    const canComplete =
                      isPendingReceiveHawala(row) && !row.isArchived;
                    const commission = (row.ownCommission ?? "").trim();
                    const rowProps = clickableTxRowProps(() =>
                      navigate(`/hawala/${row.id}`),
                    );
                    return (
                      <tr
                        key={row.id}
                        {...rowProps}
                        className={`${rowProps.className} is-clickable${
                          canComplete ? " hawala-row-pending" : ""
                        }`}
                        aria-label={`${t.common.view} ${hawalaNumberRef(row)}`}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setRowMenu({ x: e.clientX, y: e.clientY, row });
                        }}
                      >
                        <td className="col-when">
                          {String(row.valueDate).slice(0, 10)}
                        </td>
                        <td className="col-ref">
                          <strong>{hawalaNumberRef(row)}</strong>
                        </td>
                        <td>
                          {sent
                            ? t.commissionTracking.typeSent
                            : t.commissionTracking.typeReceived}
                        </td>
                        <td className="col-party" title={row.senderName ?? ""}>
                          {row.senderName ?? "—"}
                        </td>
                        <td className="col-party" title={row.receiverName ?? ""}>
                          {row.receiverName ?? "—"}
                        </td>
                        <td
                          className={`col-amount ${sent ? "money-out" : "money-in"}`}
                        >
                          {formatAmountDisplay(row.amount)}{" "}
                          <CurrencyCodeWithFlag code={row.currencyCode} />
                        </td>
                        <td className="col-amount">
                          {commission && parseMoney(commission) !== 0
                            ? formatAmountDisplay(commission)
                            : "—"}
                        </td>
                        <td>
                          <span className={statusBadgeClass(row.status)}>
                            {statusLabel(t, row.status)}
                          </span>
                        </td>
                        <td className="col-actions">
                          {canComplete ? (
                            <button
                              type="button"
                              className="btn primary hawala-complete-btn"
                              disabled={busy || completeBusy}
                              onClick={(e) => {
                                e.stopPropagation();
                                void openCompleteModal(row.id);
                              }}
                            >
                              {t.hawala.completeHawala}
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                  {pageData.items.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="muted">
                        {t.hawala.noTransfersMatch}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="records-pagination">
              <Pagination
                page={pageData.page}
                pageSize={pageData.pageSize}
                total={pageData.total}
                busy={busy}
                onPageChange={setPage}
              />
            </div>
          </>
        ) : null}
      </section>
      {rowMenu ? (
        <DeskContextMenu
          x={rowMenu.x}
          y={rowMenu.y}
          items={[
            ...(isPendingReceiveHawala(rowMenu.row) && !rowMenu.row.isArchived
              ? [
                  {
                    id: "complete",
                    label: t.hawala.completeHawala,
                    disabled: busy || completeBusy,
                    onSelect: () => void openCompleteModal(rowMenu.row.id),
                  },
                ]
              : []),
            {
              id: "edit",
              label: t.common.editAction,
              disabled: busy || Boolean(rowMenu.row.isArchived),
              onSelect: () => openEditModal(rowMenu.row),
            },
            {
              id: "whatsapp",
              label: t.hawala.sendWhatsApp,
              disabled: busy || whatsappBusy,
              onSelect: () => void handleWhatsApp(rowMenu.row.id),
            },
            {
              id: "delete",
              label: t.common.delete,
              danger: true,
              disabled: busy || Boolean(rowMenu.row.isArchived),
              onSelect: () => void handleArchive(rowMenu.row.id),
            },
          ]}
          onClose={() => setRowMenu(null)}
        />
      ) : null}
      {completeTarget ? (
        <CompleteReceiveHawalaModal
          detail={completeTarget}
          busy={completeBusy}
          error={completeError}
          onClose={() => {
            if (completeBusy) return;
            setCompleteTarget(null);
            setCompleteError(null);
          }}
          onCompleted={() => {
            setCompleteTarget(null);
            setCompleteError(null);
            setReloadKey((k) => k + 1);
            showSuccess(t.common.success);
          }}
          onError={setCompleteError}
          onBusy={setCompleteBusy}
        />
      ) : null}
      <HawalaFormModal
        open={editOpen}
        direction={editDirection}
        editTransactionId={editHawalaId}
        onClose={() => {
          setEditOpen(false);
          setEditHawalaId(null);
        }}
        onSaved={() => {
          setReloadKey((k) => k + 1);
          showSuccess(t.common.success);
        }}
      />
      <SendHawalaFormModal
        open={simpleEditOpen}
        direction={editDirection}
        editTransactionId={editHawalaId}
        onClose={() => {
          setSimpleEditOpen(false);
          setEditHawalaId(null);
        }}
        onSaved={() => {
          setReloadKey((k) => k + 1);
          showSuccess(t.common.success);
        }}
      />
      {successModal}
    </div>
  );
}
