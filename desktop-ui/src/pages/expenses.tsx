import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import {
  getExpenseSummary,
  listCurrenciesPage,
  listExpenseCategories,
  listExpenses,
  listWalletsPage,
  postExpense,
  type CurrencyListItem,
  type ExpenseCategoryOption,
  type ExpenseRow,
  type ExpenseSummary,
  type WalletListItem,
} from "@desktop/api";
import { useAuth } from "@desktop/auth";
import { Modal } from "@desktop/ui/modal";
import { Pagination } from "@desktop/ui/pagination";
import { Stat } from "@desktop/ui/stat";
import { useT } from "@desktop/i18n";

const DEFAULT_CURRENCY = "AFN";

function currencyLabel(c: CurrencyListItem) {
  const sym = c.symbol?.trim();
  return sym ? `${c.code} — ${c.name} (${sym})` : `${c.code} — ${c.name}`;
}

function pickDefaultCurrency(items: CurrencyListItem[]) {
  const preferred = items.find(
    (c) => c.code.toUpperCase() === "AFN" || c.code.toUpperCase() === "AF",
  );
  return preferred?.code ?? items[0]?.code ?? DEFAULT_CURRENCY;
}

export function ExpensesPage() {
  const t = useT();
  const { session } = useAuth();
  const [categories, setCategories] = useState<ExpenseCategoryOption[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyListItem[]>([]);
  const [wallets, setWallets] = useState<WalletListItem[]>([]);
  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [items, setItems] = useState<ExpenseRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [filterCategory, setFilterCategory] = useState("");
  const [filterCurrency, setFilterCurrency] = useState("");
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));

  const [category, setCategory] = useState("RENT");
  const [amount, setAmount] = useState("");
  const [currencyCode, setCurrencyCode] = useState(DEFAULT_CURRENCY);
  const [cashWalletId, setCashWalletId] = useState("");
  const [notes, setNotes] = useState("");
  const [valueDate, setValueDate] = useState(() => new Date().toISOString().slice(0, 10));

  const cashWallets = useMemo(
    () => wallets.filter((w) => w.type === "VAULT" || w.type === "TILL"),
    [wallets],
  );

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [cats, ccy, w, sum, list] = await Promise.all([
        listExpenseCategories(),
        listCurrenciesPage({ activeOnly: true, pageSize: 200 }),
        listWalletsPage({ page: 1, pageSize: 100 }),
        getExpenseSummary({
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          currencyCode: filterCurrency || undefined,
        }),
        listExpenses({
          page,
          pageSize,
          category: filterCategory || undefined,
          currencyCode: filterCurrency || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        }),
      ]);
      setCategories(cats);
      setCurrencies(ccy.items);
      setWallets(w.items);
      setSummary(sum);
      setItems(list.items);
      setTotal(list.total);

      const cash = w.items.find((x) => x.type === "VAULT" || x.type === "TILL");
      setCashWalletId((prev) => prev || cash?.id || "");
      setCurrencyCode((prev) => {
        if (ccy.items.some((c) => c.code === prev)) return prev;
        return pickDefaultCurrency(ccy.items);
      });
      setCategory((prev) => prev || cats[0]?.id || "RENT");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [dateFrom, dateTo, filterCategory, filterCurrency, page, reloadKey]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [filterCategory, filterCurrency, dateFrom, dateTo]);

  function openAddModal() {
    setFormError(null);
    setAmount("");
    setNotes("");
    setValueDate(new Date().toISOString().slice(0, 10));
    setCategory(categories[0]?.id ?? "RENT");
    setCurrencyCode(pickDefaultCurrency(currencies));
    if (!cashWalletId && cashWallets[0]) setCashWalletId(cashWallets[0].id);
    setShowAdd(true);
  }

  function closeAddModal() {
    if (saving) return;
    setShowAdd(false);
    setFormError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!session?.userId) return;
    setSaving(true);
    setFormError(null);
    setOk(null);
    try {
      const posted = await postExpense({
        category,
        currencyCode,
        amount,
        cashWalletId,
        notes: notes || undefined,
        valueDate: valueDate || undefined,
        createdById: session.userId,
      });
      setShowAdd(false);
      setAmount("");
      setNotes("");
      setOk(t.expenses.postedOk.replace("{reference}", posted.reference));
      setPage(1);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  function categoryLabel(id: string) {
    return categories.find((c) => c.id === id)?.label ?? id;
  }

  return (
    <div className="stack">
      <div
        className="row"
        style={{ justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}
      >
        <div>
          <h1 style={{ margin: "0 0 0.25rem" }}>{t.nav.expenses}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {t.expenses.hint}
          </p>
        </div>
        <button type="button" className="btn primary" onClick={openAddModal}>
          {t.expenses.addExpense}
        </button>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {ok ? <p className="muted">{ok}</p> : null}

      <div className="section-card stack">
        <div className="row" style={{ flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end" }}>
          <label className="stack" style={{ gap: "0.25rem" }}>
            <span className="muted">{t.expenses.periodFrom}</span>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label className="stack" style={{ gap: "0.25rem" }}>
            <span className="muted">{t.expenses.periodTo}</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
          <label className="stack" style={{ gap: "0.25rem", minWidth: "12rem" }}>
            <span className="muted">{t.expenses.filterCurrency}</span>
            <select value={filterCurrency} onChange={(e) => setFilterCurrency(e.target.value)}>
              <option value="">{t.desk.allCurrenciesFilter}</option>
              {currencies.map((c) => (
                <option key={c.id} value={c.code}>
                  {currencyLabel(c)}
                </option>
              ))}
            </select>
          </label>
          <label className="stack" style={{ gap: "0.25rem", minWidth: "10rem" }}>
            <span className="muted">{t.expenses.category}</span>
            <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
              <option value="">{t.expenses.allCategories}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {busy && !summary ? <p className="muted">{t.common.loading}</p> : null}

        {summary ? (
          <div className="stat-grid">
            <Stat label={t.expenses.totalExpenses} value={summary.total} />
            <Stat label={t.dailyBook.rent} value={summary.rent} />
            <Stat label={t.desk.salary} value={summary.salary} />
            <Stat label={t.dailyBook.utilities} value={summary.utilities} />
            <Stat label={t.dailyBook.transport} value={summary.transport} />
            <Stat label={t.dailyBook.office} value={summary.office} />
            <Stat label={t.desk.other} value={summary.other} />
          </div>
        ) : null}
      </div>

      <div className="section-card stack">
        <h2 style={{ margin: 0 }}>{t.nav.expenses}</h2>
        {items.length === 0 && !busy ? (
          <p className="muted">{t.expenses.noExpenses}</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>{t.common.date}</th>
                  <th>{t.expenses.category}</th>
                  <th>{t.common.amount}</th>
                  <th>{t.common.currency}</th>
                  <th>{t.common.reference}</th>
                  <th>{t.expenses.cashWallet}</th>
                  <th>{t.common.user}</th>
                  <th>{t.common.notes}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.transactionId}>
                    <td>{row.valueDate.slice(0, 10)}</td>
                    <td>{row.categoryLabel || categoryLabel(row.category)}</td>
                    <td>
                      <strong>{row.amount}</strong>
                    </td>
                    <td>
                      {row.currencyCode}
                      {row.currencySymbol ? ` (${row.currencySymbol})` : ""}
                      {row.currencyName ? (
                        <div className="muted" style={{ fontSize: "0.8rem" }}>
                          {row.currencyName}
                        </div>
                      ) : null}
                    </td>
                    <td>{row.reference}</td>
                    <td>{row.cashWalletName ?? "—"}</td>
                    <td>{row.createdByName ?? "—"}</td>
                    <td>{row.notes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          busy={busy}
          onPageChange={setPage}
        />
      </div>

      {showAdd ? (
        <Modal title={t.expenses.addExpense} onClose={closeAddModal}>
          <form className="stack" onSubmit={(e) => void onSubmit(e)}>
            {formError ? <p className="error">{formError}</p> : null}
            <label className="stack" style={{ gap: "0.25rem" }}>
              <span className="muted">{t.expenses.category}</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)} required>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="exchange-fields-grid">
              <label className="stack" style={{ gap: "0.25rem" }}>
                <span className="muted">{t.common.amount}</span>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={t.common.amountPlaceholder}
                  required
                  autoFocus
                />
              </label>
              <label className="stack" style={{ gap: "0.25rem" }}>
                <span className="muted">{t.common.currency}</span>
                <select
                  value={currencyCode}
                  onChange={(e) => setCurrencyCode(e.target.value)}
                  required
                >
                  {currencies.map((c) => (
                    <option key={c.id} value={c.code}>
                      {currencyLabel(c)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="stack" style={{ gap: "0.25rem" }}>
                <span className="muted">{t.common.date}</span>
                <input
                  type="date"
                  value={valueDate}
                  onChange={(e) => setValueDate(e.target.value)}
                />
              </label>
              <label className="stack" style={{ gap: "0.25rem" }}>
                <span className="muted">{t.expenses.cashWallet}</span>
                <select
                  value={cashWalletId}
                  onChange={(e) => setCashWalletId(e.target.value)}
                  required
                >
                  {cashWallets.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.type})
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="stack" style={{ gap: "0.25rem" }}>
              <span className="muted">{t.common.notes}</span>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
            <div className="modal-actions">
              <button type="button" className="btn" disabled={saving} onClick={closeAddModal}>
                {t.common.cancel}
              </button>
              <button
                type="submit"
                className="btn primary"
                disabled={saving || !cashWalletId || !amount.trim()}
              >
                {saving ? t.common.posting : t.expenses.postExpense}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
