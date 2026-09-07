import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import {
  archiveHawala,
  getHawala,
  listCurrenciesPage,
  listHawalaDesk,
  listPartners,
  type CurrencyListItem,
  type HawalaListItem,
  type HawalaListPage,
  type PartnerListItem,
} from "@desktop/api";
import type { Dictionary } from "@/lib/i18n/messages/types";
import { useAuth } from "@desktop/auth";
import { HawalaFormModal } from "@desktop/components/hawala-form-modal";
import { SendHawalaFormModal } from "@desktop/components/send-hawala-form-modal";
import { TransactionTypeIcon } from "@desktop/components/transaction-type-icon";
import { useT } from "@desktop/i18n";
import { errorMessage } from "@desktop/lib/datetime";
import { PageLoadError } from "@desktop/ui/page-load-error";
import { DeskContextMenu } from "@desktop/ui/desk-context-menu";
import { useSuccessModal } from "@desktop/ui/use-success-modal";
import { statusLabel } from "@desktop/lib/i18n-labels";
import { txDisplayRef } from "@desktop/lib/tx-ref";
import { CurrencyCodeWithFlag } from "@desktop/ui/currency-flag";
import { CurrencyFilter } from "@desktop/ui/currency-filter";
import { SearchableSelect } from "@desktop/ui/searchable-select";
import {
  isSimpleDeskHawala,
  statusBadgeClass,
  todayIso,
} from "@desktop/pages/hawala-helpers";
import { sendHawalaWhatsAppToPartner } from "@desktop/lib/hawala-whatsapp";

function Field({
  label,
  required,
  error,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={className}>
      <span className={required ? "req" : undefined}>{label}</span>
      {children}
      {error ? <span className="field-error">{error}</span> : null}
    </label>
  );
}

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function exportCsv(rows: HawalaListItem[], t: Dictionary) {
  const headers = [
    t.desk.hawalaNumber,
    t.common.date,
    t.hawala.direction,
    t.hawala.sender,
    t.hawala.receiver,
    t.common.partner,
    t.desk.destination,
    t.common.currency,
    t.common.amount,
    t.common.commission,
    t.common.status,
    t.desk.createdBy,
  ];
  const lines = [headers.join(",")];
  for (const row of rows) {
    const dest = [row.destinationCity, row.destinationCountry]
      .filter(Boolean)
      .join(", ");
    const commission = [row.ownCommission, row.partnerCommission]
      .filter(Boolean)
      .join(" / ");
    lines.push(
      [
        txDisplayRef(row),
        String(row.valueDate).slice(0, 10),
        row.direction,
        row.senderName ?? "",
        row.receiverName ?? "",
        row.partnerSarafi ?? "",
        dest,
        row.currencyCode,
        row.amount,
        commission,
        row.status,
        row.createdByName ?? "",
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

export function HawalaPage() {
  const { session } = useAuth();
  const t = useT();
  const navigate = useNavigate();

  const [pageData, setPageData] = useState<HawalaListPage | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState("ALL");
  const [partnerFilter, setPartnerFilter] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [archiveFilter, setArchiveFilter] = useState<"active" | "archived" | "all">(
    "active",
  );
  const [sort, setSort] = useState("date_desc");
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  const [partners, setPartners] = useState<PartnerListItem[]>([]);
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
    void Promise.all([
      listPartners(),
      listCurrenciesPage({ activeOnly: true, pageSize: 100 }),
    ])
      .then(([p, ccy]) => {
        setPartners(p);
        setCurrencies(ccy.items);
      })
      .catch((err: unknown) => {
        setError(errorMessage(err, t.errors.loadGeneric));
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    void listHawalaDesk({
      page,
      pageSize: 25,
      search: search.trim() || undefined,
      direction: direction === "ALL" ? undefined : direction,
      partnerSarafiId: partnerFilter || undefined,
      currencyCode: currencyFilter || undefined,
      country: countryFilter.trim() || undefined,
      city: cityFilter.trim() || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      archiveFilter,
      sort,
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
    partnerFilter,
    currencyFilter,
    countryFilter,
    cityFilter,
    dateFrom,
    dateTo,
    archiveFilter,
    sort,
    reloadKey,
  ]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = searchInput.trim();
      if (next === search) return;
      setPage(1);
      setSearch(next);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput, search]);

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

  const totalPages = pageData
    ? Math.max(1, Math.ceil(pageData.total / pageData.pageSize))
    : 1;

  return (
    <div className="stack">
      {error ? (
        <PageLoadError
          message={error}
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      ) : null}

      <div className="hawala-filters no-print">
          <div className="hawala-filters-primary">
            <Field label={t.common.search} className="hawala-filter-grow">
              <input
                type="search"
                className="desk-search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t.hawala.searchPlaceholder}
              />
            </Field>
            <SearchableSelect
              className="hawala-filter-partner"
              hideLabel
              label={t.hawala.partner}
              value={partnerFilter}
              placeholder={`${t.common.all} ${t.common.partner}`}
              options={[
                { value: "", label: `${t.common.all} ${t.common.partner}` },
                ...partners.map((p) => ({
                  value: p.id,
                  label: p.name,
                  keywords: [p.phone, p.city, p.country].filter(Boolean).join(" "),
                })),
              ]}
              onChange={(value) => {
                setPage(1);
                setPartnerFilter(value);
              }}
            />
            <div className="hawala-filters-actions">
              <button
                type="button"
                className="secondary"
                disabled={!pageData?.items.length}
                onClick={() => pageData && exportCsv(pageData.items, t)}
              >
                {t.desk.exportCsv}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => window.print()}
              >
                {t.common.print}
              </button>
              <button
                type="button"
                className="secondary"
                aria-expanded={showMoreFilters}
                onClick={() => setShowMoreFilters((v) => !v)}
              >
                {showMoreFilters ? t.hawala.fewerFilters : t.desk.moreFilters}
              </button>
            </div>
          </div>

          {showMoreFilters ? (
            <div className="hawala-filters-more">
              <Field label={t.desk.direction}>
                <select
                  value={direction}
                  onChange={(e) => {
                    setPage(1);
                    setDirection(e.target.value);
                  }}
                >
                  <option value="ALL">{t.common.all}</option>
                  <option value="SEND">{t.hawala.send}</option>
                  <option value="RECEIVE">{t.hawala.receive}</option>
                </select>
              </Field>
              <CurrencyFilter
                currencies={currencies}
                value={currencyFilter}
                onChange={(code) => {
                  setPage(1);
                  setCurrencyFilter(code);
                }}
                label={t.common.currency}
              />
              <Field label={t.common.country}>
                <input
                  value={countryFilter}
                  onChange={(e) => {
                    setPage(1);
                    setCountryFilter(e.target.value);
                  }}
                />
              </Field>
              <Field label={t.common.city}>
                <input
                  value={cityFilter}
                  onChange={(e) => {
                    setPage(1);
                    setCityFilter(e.target.value);
                  }}
                />
              </Field>
              <Field label={t.common.from}>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setPage(1);
                    setDateFrom(e.target.value);
                  }}
                />
              </Field>
              <Field label={t.common.to}>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setPage(1);
                    setDateTo(e.target.value);
                  }}
                />
              </Field>
              <Field label={t.common.archive}>
                <select
                  value={archiveFilter}
                  onChange={(e) => {
                    setPage(1);
                    setArchiveFilter(
                      e.target.value as "active" | "archived" | "all",
                    );
                  }}
                >
                  <option value="active">{t.common.active}</option>
                  <option value="archived">{t.common.archived}</option>
                  <option value="all">{t.common.all}</option>
                </select>
              </Field>
              <Field label={t.common.filter}>
                <select
                  value={sort}
                  onChange={(e) => {
                    setPage(1);
                    setSort(e.target.value);
                  }}
                >
                  <option value="date_desc">{t.common.newestFirst}</option>
                  <option value="date_asc">{t.common.oldestFirst}</option>
                  <option value="amount_desc">{t.common.amount} ({t.common.newestFirst})</option>
                  <option value="amount_asc">{t.common.amount} ({t.common.oldestFirst})</option>
                  <option value="ref_asc">{t.desk.hawalaNumber}</option>
                </select>
              </Field>
            </div>
          ) : null}
        </div>

        <div className="section-card stack">
        {busy && !pageData ? <p className="muted">{t.common.loading}</p> : null}
        {pageData ? (
          <>
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>{t.desk.hawalaNumber}</th>
                    <th>{t.common.date}</th>
                    <th>{t.hawala.sender}</th>
                    <th>{t.hawala.receiver}</th>
                    <th>{t.common.partner}</th>
                    <th>{t.desk.destination}</th>
                    <th>{t.common.currency}</th>
                    <th>{t.common.amount}</th>
                    <th>{t.common.commission}</th>
                    <th>{t.common.status}</th>
                    <th>{t.desk.createdBy}</th>
                  </tr>
                </thead>
                <tbody>
                  {pageData.items.map((row) => (
                    <tr
                      key={row.id}
                      className="customer-row-clickable"
                      tabIndex={0}
                      role="link"
                      aria-label={`${t.common.view} ${txDisplayRef(row)}`}
                      onClick={() => navigate(`/hawala/${row.id}`)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setRowMenu({ x: e.clientX, y: e.clientY, row });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          navigate(`/hawala/${row.id}`);
                        }
                      }}
                    >
                      <td>
                        <strong>{txDisplayRef(row)}</strong>
                        <div
                          className="muted daybook-type-cell"
                          style={{ fontSize: "0.75rem" }}
                        >
                          <TransactionTypeIcon
                            type={
                              row.direction === "SEND" ? "HAWALA" : "HAWALA_RECEIVE"
                            }
                          />
                          <span>{row.direction}</span>
                        </div>
                      </td>
                      <td>{String(row.valueDate).slice(0, 10)}</td>
                      <td>{row.senderName ?? "—"}</td>
                      <td>{row.receiverName ?? "—"}</td>
                      <td>{row.partnerSarafi ?? "—"}</td>
                      <td>
                        {[row.destinationCity, row.destinationCountry]
                          .filter(Boolean)
                          .join(", ") || "—"}
                      </td>
                      <td>
                        <CurrencyCodeWithFlag code={row.currencyCode} />
                      </td>
                      <td className={row.direction === "SEND" ? "money-out" : "money-in"}>
                        {row.amount}
                      </td>
                      <td>
                        {row.ownCommission ?? "—"}
                        {row.partnerCommission
                          ? ` / ${row.partnerCommission}`
                          : ""}
                      </td>
                      <td>
                        <span className={statusBadgeClass(row.status)}>
                          {statusLabel(t, row.status)}
                        </span>
                      </td>
                      <td>{row.createdByName ?? "—"}</td>
                    </tr>
                  ))}
                  {pageData.items.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="muted">
                        {t.hawala.noTransfersMatch}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="row">
              <button
                type="button"
                className="secondary"
                disabled={page <= 1 || busy}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                {t.common.previous}
              </button>
              <span className="muted">
                {t.hawala.pageOf
                  .replace("{page}", String(page))
                  .replace("{total}", String(totalPages))}
              </span>
              <button
                type="button"
                className="secondary"
                disabled={page >= totalPages || busy}
                onClick={() => setPage((p) => p + 1)}
              >
                {t.common.next}
              </button>
            </div>
          </>
        ) : null}
      </div>
      {rowMenu ? (
        <DeskContextMenu
          x={rowMenu.x}
          y={rowMenu.y}
          items={[
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
