import { type FormEvent, useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import {
  getExpenseSummary,
  listCurrenciesPage,
  listExpenseCategories,
  listExpenses,
  postExpense,
  type CurrencyListItem,
  type ExpenseCategoryOption,
  type ExpenseRow,
  type ExpenseSummary,
} from "@desktop/api";
import { useAuth } from "@desktop/auth";
import {
  ExpenseDetailModal,
  clickableExpenseRowProps,
} from "@desktop/components/expense-detail-modal";
import { CurrencyFilter } from "@desktop/ui/currency-filter";
import { AmountInput } from "@desktop/ui/amount-input";
import { CurrencyPicker } from "@desktop/ui/currency-picker";
import { Modal } from "@desktop/ui/modal";
import { ModalErrorBanner } from "@desktop/ui/modal-error-banner";
import { Pagination } from "@desktop/ui/pagination";
import { Stat } from "@desktop/ui/stat";
import { useSuccessModal } from "@desktop/ui/use-success-modal";
import { useT } from "@desktop/i18n";
import {
  endSubmit,
  errorMessage,
  tryBeginSubmit,
} from "@desktop/lib/datetime";
import { txDisplayRef } from "@desktop/lib/tx-ref";
import { PageLoadError } from "@desktop/ui/page-load-error";
import {
  DEFAULT_CURRENCY_CODE,
  pickDefaultCurrency,
} from "@desktop/lib/default-currency";
import { handleDeskFormKeyDown } from "@desktop/lib/form-keyboard";

export function ExpensesPage() {
  const t = useT();
  const { session } = useAuth();
  const [categories, setCategories] = useState<ExpenseCategoryOption[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyListItem[]>([]);
  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [items, setItems] = useState<ExpenseRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [error, setError] = useState<string | null>(null);
  const { showSuccess, successModal } = useSuccessModal();
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const submittingRef = useRef(false);
  const addFormRef = useRef<HTMLFormElement>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [detail, setDetail] = useState<ExpenseRow | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [filterCategory, setFilterCategory] = useState("");
  const [filterCurrency, setFilterCurrency] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));

  const [category, setCategory] = useState("RENT");
  const [amount, setAmount] = useState("");
  const [currencyCode, setCurrencyCode] = useState(DEFAULT_CURRENCY_CODE);
  const [notes, setNotes] = useState("");
  const [valueDate, setValueDate] = useState(() => new Date().toISOString().slice(0, 10));

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [cats, ccy, sum, list] = await Promise.all([
        listExpenseCategories(),
        listCurrenciesPage({ activeOnly: true, pageSize: 200 }),
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
          search: search.trim() || undefined,
        }),
      ]);
      setCategories(cats);
      setCurrencies(ccy.items);
      setSummary(sum);
      setItems(list.items);
      setTotal(list.total);

      setCurrencyCode((prev) => {
        if (ccy.items.some((c) => c.code === prev)) return prev;
        return pickDefaultCurrency(ccy.items);
      });
      setCategory((prev) => prev || cats[0]?.id || "RENT");
      setError(null);
    } catch (err) {
      setError(errorMessage(err, t.errors.loadGeneric));
    } finally {
      setBusy(false);
    }
  }, [dateFrom, dateTo, filterCategory, filterCurrency, page, reloadKey, search, t.errors.loadGeneric]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 280);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

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
    if (saving || !tryBeginSubmit(submittingRef)) return;
    setSaving(true);
    setFormError(null);
    try {
      const posted = await postExpense({
        category,
        currencyCode,
        amount,
        notes: notes || undefined,
        valueDate: valueDate || undefined,
        createdById: session.userId,
      });
      setShowAdd(false);
      setAmount("");
      setNotes("");
      showSuccess(t.expenses.postedOk.replace("{reference}", txDisplayRef(posted)));
      setPage(1);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setFormError(errorMessage(err, t.errors.expenseSave));
    } finally {
      endSubmit(submittingRef);
      setSaving(false);
    }
  }

  function categoryLabel(id: string) {
    return categories.find((c) => c.id === id)?.label ?? id;
  }

  return (
    <div className="stack expenses-page workspace-page">
      {error ? (
        <PageLoadError message={error} onRetry={() => setReloadKey((k) => k + 1)} />
      ) : null}

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
          <label className="stack" style={{ gap: "0.25rem", minWidth: "10rem" }}>
            <span className="muted">{t.expenses.expenseType}</span>
            <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
              <option value="">{t.expenses.allExpenseTypes}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="stack" style={{ gap: "0.25rem", minWidth: "12rem", flex: "1 1 12rem" }}>
            <span className="muted">{t.common.search}</span>
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t.expenses.searchPlaceholder}
            />
          </label>
          <div style={{ minWidth: "12rem" }}>
            <CurrencyFilter
              currencies={currencies}
              value={filterCurrency}
              onChange={setFilterCurrency}
              allLabel={t.desk.allCurrenciesFilter}
              label={t.expenses.filterCurrency}
            />
          </div>
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
        <div className="row expenses-list-head">
          <h2 style={{ margin: 0 }}>{t.nav.expenses}</h2>
          <button
            type="button"
            className="btn primary"
            data-desk-action="new"
            data-desk-primary
            onClick={openAddModal}
          >
            {t.expenses.addExpense}
          </button>
        </div>
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
                  <tr
                    key={row.transactionId}
                    {...clickableExpenseRowProps(() => setDetail(row))}
                    aria-label={`${t.common.view} ${txDisplayRef(row)}`}
                  >
                    <td>{row.valueDate.slice(0, 10)}</td>
                    <td>{row.categoryLabel || categoryLabel(row.category)}</td>
                    <td>
                      <strong className="money-out">{row.amount}</strong>
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
                    <td>{txDisplayRef(row)}</td>
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
          <form
            ref={addFormRef}
            className="stack"
            data-desk-form
            onKeyDown={(e: ReactKeyboardEvent<HTMLFormElement>) =>
              handleDeskFormKeyDown(e, {
                busy: saving,
                onSubmit: () => addFormRef.current?.requestSubmit(),
              })
            }
            onSubmit={(e) => void onSubmit(e)}
          >
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
            <div className="money-ccy-row">
              <label className="money-ccy-amount stack" style={{ gap: "0.25rem" }}>
                <span className="muted">{t.common.amount}</span>
                <AmountInput
                  value={amount}
                  onValueChange={setAmount}
                  placeholder={t.common.amountPlaceholder}
                  required
                  autoFocus
                />
              </label>
              <CurrencyPicker
                label={t.common.currency}
                required
                currencies={currencies}
                value={currencyCode}
                onChange={setCurrencyCode}
                onCurrenciesChange={setCurrencies}
                emptyLabel={t.common.noData}
                searchPlaceholder={t.common.search}
              />
            </div>
            <label className="stack" style={{ gap: "0.25rem" }}>
              <span className="muted">{t.common.date}</span>
              <input
                type="date"
                value={valueDate}
                onChange={(e) => setValueDate(e.target.value)}
              />
            </label>
            <label className="stack" style={{ gap: "0.25rem" }}>
              <span className="muted">{t.common.notes}</span>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
            <ModalErrorBanner message={formError} />
            <div className="modal-actions">
              <button type="button" className="btn" disabled={saving} onClick={closeAddModal}>
                {t.common.cancel}
              </button>
              <button
                type="submit"
                className="btn primary"
                data-desk-action="save"
                disabled={saving || !amount.trim()}
              >
                {saving ? t.common.posting : t.expenses.postExpense}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      <ExpenseDetailModal detail={detail} onClose={() => setDetail(null)} />
      {successModal}
    </div>
  );
}
