import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

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
import { CustomerCreateForm, CustomerEditForm } from "@desktop/pages/customer-forms";
import { Modal } from "@desktop/ui/modal";
import { SuccessModal } from "@desktop/ui/success-modal";

type ArchiveFilter = "active" | "archived" | "all";

function formatBalances(rows: CustomerBalanceRow[] | undefined) {
  if (!rows || rows.length === 0) return "—";
  return rows.map((b) => `${b.currencyCode} ${b.balanceDisplay}`).join(" · ");
}

export function CustomersPage() {
  const t = useT();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [customers, setCustomers] = useState<CustomerListPage | null>(null);
  const [balancesById, setBalancesById] = useState<Record<string, CustomerBalanceRow[]>>({});
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>("active");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [showNew, setShowNew] = useState(false);
  const [editCustomer, setEditCustomer] = useState<CustomerDetail | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [success, setSuccess] = useState<{ message: string; goToId?: string } | null>(null);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setShowNew(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      if (e.key.toLowerCase() !== "n") return;
      // Don't steal Ctrl+N while another overlay is already up.
      if (showNew || editCustomer || success) return;
      e.preventDefault();
      setShowNew(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showNew, editCustomer, success]);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    void listCustomersPage({
      search: search.trim() || undefined,
      archiveFilter,
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
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [search, page, reloadKey, archiveFilter]);

  function handleSearch(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setSearch(searchDraft.trim());
  }

  async function handleArchive(id: string, name: string) {
    if (!window.confirm(`${t.customers.archiveCustomer} “${name}”?`)) return;
    setBusy(true);
    try {
      await archiveCustomer(id);
      reload();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
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
      setError(err instanceof Error ? err.message : String(err));
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
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setEditLoading(false);
    }
  }

  const totalPages = customers
    ? Math.max(1, Math.ceil(customers.total / customers.pageSize))
    : 1;

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: "0 0 0.25rem" }}>{t.nav.customers}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {t.customers.emptyHint}
          </p>
        </div>
        <button
          type="button"
          className="btn primary"
          onClick={() => setShowNew(true)}
          title={t.customers.add}
        >
          {t.customers.add}
          <span className="muted" style={{ marginLeft: "0.45rem", fontSize: "0.8rem" }}>
            Ctrl+N
          </span>
        </button>
      </div>

      <div className="card stack">
        <form className="row" onSubmit={handleSearch} style={{ flexWrap: "wrap", gap: "0.5rem" }}>
          <label style={{ flex: 1, minWidth: 220 }}>
            {t.common.search}
            <input
              value={searchDraft}
              placeholder={t.customers.searchPlaceholder}
              onChange={(e) => setSearchDraft(e.target.value)}
            />
          </label>
          <label style={{ minWidth: 140 }}>
            {t.common.status}
            <select
              value={archiveFilter}
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
          <button type="submit" disabled={busy} style={{ alignSelf: "end" }}>
            {t.common.search}
          </button>
        </form>
        {error ? <p className="error">{error}</p> : null}
        {editLoading ? <p className="muted">{t.customers.loadingCustomer}</p> : null}
        {busy && !customers ? <p className="muted">{t.common.loading}</p> : null}
        {customers ? (
          <>
            <p className="muted">
              {t.common.showing} {customers.items.length} {t.common.of} {customers.total} (
              {customers.page}/{totalPages})
            </p>
            <table>
              <thead>
                <tr>
                  <th>{t.common.name}</th>
                  <th>{t.common.phone}</th>
                  <th>{t.customers.balances}</th>
                  <th>{t.common.status}</th>
                  <th>{t.common.actions}</th>
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
                      <td>
                        <span style={{ fontWeight: 600 }}>{customer.fullName}</span>
                        <div className="muted" style={{ fontSize: "0.8rem" }}>
                          {customer.code ?? "—"}
                        </div>
                      </td>
                      <td>{customer.phone ?? "—"}</td>
                      <td style={{ fontSize: "0.9rem" }}>
                        {formatBalances(balancesById[customer.id])}
                      </td>
                      <td>
                        {customer.isArchived ? (
                          <span className="badge">{t.common.archived}</span>
                        ) : (
                          <span className="badge badge-ok">{t.common.active}</span>
                        )}
                      </td>
                      <td onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                        <div className="row" style={{ gap: "0.35rem", flexWrap: "wrap" }}>
                          {customer.isArchived ? (
                            <button
                              type="button"
                              className="secondary"
                              disabled={busy}
                              onClick={() => void handleRestore(customer.id)}
                            >
                              {t.common.restore}
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="secondary"
                                disabled={editLoading}
                                onClick={() => void openEdit(customer)}
                              >
                                {t.customers.edit}
                              </button>
                              <button
                                type="button"
                                className="secondary"
                                disabled={busy}
                                onClick={() =>
                                  void handleArchive(customer.id, customer.fullName)
                                }
                              >
                                {t.common.archive}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <div className="row">
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
          </>
        ) : null}
      </div>

      {showNew ? (
        <Modal title={t.customers.add} size="lg" onClose={() => setShowNew(false)}>
          <CustomerCreateForm
            onCancel={() => setShowNew(false)}
            onCreated={(created) => {
              setShowNew(false);
              setSuccess({
                message: t.common.success,
                goToId: created.id,
              });
              reload();
            }}
          />
        </Modal>
      ) : null}

      {editCustomer ? (
        <Modal
          title={`${t.customers.edit} — ${editCustomer.fullName}`}
          size="lg"
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
