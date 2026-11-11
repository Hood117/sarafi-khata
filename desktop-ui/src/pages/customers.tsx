import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useNavigate } from "react-router-dom";

import {
  archiveCustomer,
  getCustomer,
  getCustomersBalancesBatch,
  listCustomersPage,
  restoreCustomer,
  type CustomerBalanceRow,
  type CustomerDetail,
  type CustomerListItem,
  type CustomerListPage,
} from "@desktop/api";
import { useT } from "@desktop/i18n";
import { moneyToneClass } from "@desktop/lib/currency-labels";
import { errorMessage } from "@desktop/lib/datetime";
import { useDeskDataRefresh } from "@desktop/lib/use-desk-data-refresh";
import { CustomerEditForm } from "@desktop/pages/customer-forms";
import { useConfirmDialog } from "@desktop/ui/confirm-dialog";
import { DeskContextMenu } from "@desktop/ui/desk-context-menu";
import { Modal } from "@desktop/ui/modal";
import { PageLoadError } from "@desktop/ui/page-load-error";
import { SuccessModal } from "@desktop/ui/success-modal";

type ArchiveFilter = "active" | "archived" | "all";
type TypeFilter = "permanent" | "temporary";

function BalanceChips({ rows }: { rows: CustomerBalanceRow[] | undefined }) {
  if (!rows || rows.length === 0) return <span>—</span>;
  return (
    <span className="balance-chip-row">
      {rows.map((b, i) => (
        <span key={b.currencyCode}>
          {i > 0 ? <span className="muted"> · </span> : null}
          <span className={`money ${moneyToneClass(b.balanceDisplay)}`}>
            {b.currencyCode} {b.balanceDisplay}
          </span>
        </span>
      ))}
    </span>
  );
}

export function CustomersPage() {
  const t = useT();
  const navigate = useNavigate();
  const { confirm } = useConfirmDialog();
  const [customers, setCustomers] = useState<CustomerListPage | null>(null);
  const [balancesById, setBalancesById] = useState<Record<string, CustomerBalanceRow[]>>({});
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState<CustomerListItem[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const searchWrapRef = useRef<HTMLLabelElement | null>(null);
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>("active");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("permanent");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editCustomer, setEditCustomer] = useState<CustomerDetail | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [success, setSuccess] = useState<{ message: string; goToId?: string } | null>(null);
  const [rowMenu, setRowMenu] = useState<{
    x: number;
    y: number;
    customer: CustomerListItem;
  } | null>(null);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useDeskDataRefresh(reload);

  // Live-filter the customer table as the user types.
  useEffect(() => {
    const q = searchDraft.trim();
    const timer = window.setTimeout(() => {
      setPage(1);
      setSearch(q);
    }, 280);
    return () => window.clearTimeout(timer);
  }, [searchDraft]);

  // Fetch name suggestions for the typeahead dropdown.
  useEffect(() => {
    const q = searchDraft.trim();
    if (q.length < 1) {
      setSuggestions([]);
      setHighlight(-1);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSuggestBusy(true);
      void listCustomersPage({
        search: q,
        archiveFilter,
        typeFilter,
        page: 1,
        pageSize: 8,
      })
        .then((result) => {
          if (cancelled) return;
          setSuggestions(result.items);
          setHighlight(result.items.length > 0 ? 0 : -1);
        })
        .catch(() => {
          if (!cancelled) setSuggestions([]);
        })
        .finally(() => {
          if (!cancelled) setSuggestBusy(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchDraft, archiveFilter, typeFilter]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!searchWrapRef.current?.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    void listCustomersPage({
      search: search.trim() || undefined,
      archiveFilter,
      typeFilter,
      page,
      pageSize: 25,
    })
      .then(async (result) => {
        if (cancelled) return;
        setCustomers(result);
        setError(null);
        if (result.items.length === 0) {
          setBalancesById({});
          return;
        }
        try {
          const batch = await getCustomersBalancesBatch(
            result.items.map((c) => c.id),
          );
          if (!cancelled) {
            setBalancesById(
              Object.fromEntries(batch.map((b) => [b.customerId, b.balances])),
            );
          }
        } catch {
          if (!cancelled) setBalancesById({});
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err, t.errors.loadCustomers));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [search, page, reloadKey, archiveFilter, typeFilter]);

  function pickSuggestion(customer: CustomerListItem) {
    setSearchDraft(customer.fullName);
    setSearch(customer.fullName);
    setPage(1);
    setShowSuggestions(false);
    navigate(`/customers/${customer.id}`);
  }

  function onSearchKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && highlight >= 0 && suggestions[highlight]) {
      e.preventDefault();
      pickSuggestion(suggestions[highlight]);
      return;
    }
    if (!showSuggestions || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setShowSuggestions(false);
    }
  }

  async function handleArchive(id: string, name: string) {
    const ok = await confirm({
      title: t.common.archive,
      message: `${t.customers.archiveCustomer} “${name}”?`,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await archiveCustomer(id);
      reload();
    } catch (err: unknown) {
      setError(errorMessage(err, t.errors.genericTryAgain));
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore(id: string) {
    setBusy(true);
    try {
      await restoreCustomer(id);
      reload();
    } catch (err: unknown) {
      setError(errorMessage(err, t.errors.genericTryAgain));
    } finally {
      setBusy(false);
    }
  }

  async function openEdit(customer: CustomerListItem) {
    setEditLoading(true);
    setError(null);
    try {
      const detail = await getCustomer(customer.id);
      setEditCustomer(detail);
    } catch (err: unknown) {
      setError(errorMessage(err, t.errors.loadCustomers));
    } finally {
      setEditLoading(false);
    }
  }

  const totalPages = customers
    ? Math.max(1, Math.ceil(customers.total / customers.pageSize))
    : 1;

  return (
    <div className="stack customers-page workspace-page is-customers">
      {error ? <PageLoadError message={error} onRetry={reload} /> : null}
      {editLoading ? <p className="muted">{t.customers.loadingCustomer}</p> : null}
      {busy && !customers ? <p className="muted">{t.common.loading}</p> : null}

      <section className="panel records-panel">
        <div className="records-chrome">
          <div className="records-title customers-records-head">
            <div>
              <h2>{t.nav.customers}</h2>
              <span className="count-badge">{customers?.total ?? 0}</span>
            </div>
            <div className="table-toolbar customers-records-tools">
              <label
                ref={searchWrapRef}
                className="search-field search-field-emphasized customer-search-wrap"
              >
                <input
                  type="search"
                  className="desk-search"
                  value={searchDraft}
                  placeholder={t.customers.searchPlaceholder}
                  autoComplete="off"
                  aria-label={t.common.search}
                  aria-autocomplete="list"
                  aria-expanded={showSuggestions && suggestions.length > 0}
                  onChange={(e) => {
                    setSearchDraft(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onKeyDown={onSearchKeyDown}
                />
                {showSuggestions && searchDraft.trim().length > 0 ? (
                  <ul className="customer-suggest" role="listbox">
                    {suggestBusy && suggestions.length === 0 ? (
                      <li className="customer-suggest-empty muted">{t.common.loading}</li>
                    ) : null}
                    {!suggestBusy && suggestions.length === 0 ? (
                      <li className="customer-suggest-empty muted">{t.customers.emptyFiltered}</li>
                    ) : null}
                    {suggestions.map((c, idx) => (
                      <li key={c.id} role="option" aria-selected={idx === highlight}>
                        <button
                          type="button"
                          className={`customer-suggest-item${idx === highlight ? " is-active" : ""}`}
                          onMouseEnter={() => setHighlight(idx)}
                          onClick={() => pickSuggestion(c)}
                        >
                          <span className="customer-suggest-name">
                            {c.fullName}
                            {c.fatherName ? ` · ${c.fatherName}` : ""}
                          </span>
                          <span className="customer-suggest-meta muted">
                            {c.code ? (
                              <strong className="customer-list-code">{c.code}</strong>
                            ) : null}
                            {c.code && c.phone ? " · " : null}
                            {c.phone ? (
                              <span className="ltr-text phone-ltr" dir="ltr">
                                {c.phone}
                              </span>
                            ) : !c.code ? (
                              "—"
                            ) : null}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </label>
              <div className="table-filters">
                <label className="customers-status-filter">
                  <select
                    value={archiveFilter}
                    aria-label={t.common.status}
                    title={t.common.status}
                    onChange={(e) => {
                      setPage(1);
                      setArchiveFilter(e.target.value as ArchiveFilter);
                    }}
                  >
                    <option value="active">{t.common.active}</option>
                    <option value="archived">{t.common.archived}</option>
                    <option value="all">{t.common.all}</option>
                  </select>
                </label>
              </div>
            </div>
            <div className="records-title-actions">
              <div
                className="settings-tabs currency-panel-tabs customer-type-tabs"
                role="tablist"
                aria-label={t.customers.customerType}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={typeFilter === "permanent"}
                  className={`settings-tab${typeFilter === "permanent" ? " active" : ""}`}
                  onClick={() => {
                    setPage(1);
                    setTypeFilter("permanent");
                  }}
                >
                  {t.customers.permanent}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={typeFilter === "temporary"}
                  className={`settings-tab${typeFilter === "temporary" ? " active" : ""}`}
                  onClick={() => {
                    setPage(1);
                    setTypeFilter("temporary");
                  }}
                >
                  {t.customers.temporary}
                </button>
              </div>
            </div>
          </div>
        </div>
        {customers ? (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th className="customer-list-code-col customers-th-code">{t.customers.code}</th>
                    <th className="customers-th-name">{t.common.name}</th>
                    <th className="customers-th-phone">{t.common.phone}</th>
                    <th className="customers-th-balances">{t.customers.balances}</th>
                    <th className="customers-th-status">{t.common.status}</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.items.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="muted">
                        {archiveFilter === "archived"
                          ? t.customers.emptyArchived
                          : search
                            ? t.customers.emptyFiltered
                            : t.customers.emptyTitle}
                      </td>
                    </tr>
                  ) : (
                    customers.items.map((customer) => (
                      <tr
                        key={customer.id}
                        className="customer-row-clickable"
                        onClick={() => navigate(`/customers/${customer.id}`)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setRowMenu({ x: e.clientX, y: e.clientY, customer });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            navigate(`/customers/${customer.id}`);
                          }
                        }}
                        tabIndex={0}
                        role="link"
                        aria-label={`${t.common.view} ${customer.fullName}`}
                      >
                        <td className="customer-list-code-col">
                          {customer.code ? (
                            <strong className="customer-list-code">
                              {customer.code.replace(/^#+/, "")}
                            </strong>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          <span className="customer-list-person">
                            {customer.photo ? (
                              <img
                                className="customer-list-photo"
                                src={customer.photo}
                                alt=""
                              />
                            ) : (
                              <span className="customer-list-photo is-empty" aria-hidden="true" />
                            )}
                            <span className="customer-list-name">{customer.fullName}</span>
                          </span>
                        </td>
                        <td>
                          {customer.phone ? (
                            <span className="ltr-text phone-ltr" dir="ltr">
                              {customer.phone}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td style={{ fontSize: "0.9rem" }}>
                          <BalanceChips rows={balancesById[customer.id]} />
                        </td>
                        <td>
                          {customer.isArchived ? (
                            <span className="badge">{t.common.archived}</span>
                          ) : (
                            <span className="badge badge-ok">{t.common.active}</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="records-pagination">
              <span>
                {t.common.showing} {customers.items.length} {t.common.of} {customers.total} (
                {customers.page}/{totalPages})
              </span>
              <div className="row" style={{ gap: 8 }}>
                <button
                  type="button"
                  className="secondary"
                  disabled={page <= 1 || busy}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  {t.common.previous}
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={page >= totalPages || busy}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t.common.next}
                </button>
              </div>
            </div>
          </>
        ) : null}
      </section>

      {rowMenu ? (
        <DeskContextMenu
          x={rowMenu.x}
          y={rowMenu.y}
          items={
            rowMenu.customer.isArchived
              ? [
                  {
                    id: "restore",
                    label: t.common.restore,
                    disabled: busy,
                    onSelect: () => void handleRestore(rowMenu.customer.id),
                  },
                ]
              : [
                  {
                    id: "edit",
                    label: t.customers.edit,
                    disabled: editLoading,
                    onSelect: () => void openEdit(rowMenu.customer),
                  },
                  {
                    id: "archive",
                    label: t.common.archive,
                    danger: true,
                    disabled: busy,
                    onSelect: () =>
                      void handleArchive(rowMenu.customer.id, rowMenu.customer.fullName),
                  },
                ]
          }
          onClose={() => setRowMenu(null)}
        />
      ) : null}

      {editCustomer ? (
        <Modal
          title={`${t.customers.edit} — ${editCustomer.fullName}`}
          size="xl"
          onClose={() => setEditCustomer(null)}
        >
          <CustomerEditForm
            customer={editCustomer}
            onCancel={() => setEditCustomer(null)}
            onSaved={() => {
              setEditCustomer(null);
              setSuccess({ message: t.common.success });
              reload();
            }}
          />
        </Modal>
      ) : null}

      {success ? (
        <SuccessModal
          title={t.common.success}
          message={success.message}
          onClose={() => {
            const go = success.goToId;
            setSuccess(null);
            if (go) navigate(`/customers/${go}`);
          }}
        />
      ) : null}
    </div>
  );
}
