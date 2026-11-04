import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Save, X } from "lucide-react";

import {
  createAccountOrder,
  listAccountOrders,
  listCurrenciesPage,
  listCustomersPage,
  type AccountOrderListItem,
  type CurrencyListItem,
  type CustomerListItem,
} from "@desktop/api";
import { useAuth } from "@desktop/auth";
import { useT } from "@desktop/i18n";
import {
  datePeriodRange,
  errorMessage,
  todayIso,
  type DatePeriodPreset,
} from "@desktop/lib/datetime";
import {
  DEFAULT_CURRENCY_CODE,
  pickDefaultCurrency,
} from "@desktop/lib/default-currency";
import { statusLabel } from "@desktop/lib/i18n-labels";
import { canWritePath } from "@desktop/lib/permissions";
import {
  formatAmountDisplay,
  statusBadgeClass,
} from "@desktop/pages/hawala-helpers";
import { AmountInput } from "@desktop/ui/amount-input";
import { CurrencyCodeWithFlag } from "@desktop/ui/currency-flag";
import { CurrencyFilter } from "@desktop/ui/currency-filter";
import { CurrencyPicker } from "@desktop/ui/currency-picker";
import { Modal } from "@desktop/ui/modal";
import { ModalErrorBanner } from "@desktop/ui/modal-error-banner";
import { PageLoadError } from "@desktop/ui/page-load-error";
import { Pagination } from "@desktop/ui/pagination";
import { SearchableSelect } from "@desktop/ui/searchable-select";
import { useSuccessModal } from "@desktop/ui/use-success-modal";

export function AccountOrdersPage() {
  const t = useT();
  const { session } = useAuth();
  const navigate = useNavigate();
  const canWrite = canWritePath(session, "/account-orders");
  const defaultRange = useMemo(() => datePeriodRange("month", todayIso()), []);

  const [items, setItems] = useState<AccountOrderListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [currencyFilter, setCurrencyFilter] = useState("");
  const [, setPeriodPreset] = useState<DatePeriodPreset>("month");
  const [dateFrom, setDateFrom] = useState(defaultRange.from);
  const [dateTo, setDateTo] = useState(defaultRange.to);
  const [currencies, setCurrencies] = useState<CurrencyListItem[]>([]);
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const { showSuccess, successModal } = useSuccessModal();

  const [showCreate, setShowCreate] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [currencyCode, setCurrencyCode] = useState(DEFAULT_CURRENCY_CODE);
  const [orderDate, setOrderDate] = useState(todayIso());
  const [originalAmount, setOriginalAmount] = useState("");
  const [purchaseDeductionPercent, setPurchaseDeductionPercent] = useState("0");

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [list, ccy] = await Promise.all([
        listAccountOrders({
          page,
          pageSize,
          search: search.trim() || undefined,
          status: statusFilter === "ALL" ? undefined : statusFilter,
          currencyCode: currencyFilter || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        }),
        listCurrenciesPage({ activeOnly: true, pageSize: 200 }),
      ]);
      setItems(list.items);
      setTotal(list.total);
      setCurrencies(ccy.items);
      setCurrencyCode((prev) => {
        if (ccy.items.some((c) => c.code === prev)) return prev;
        return pickDefaultCurrency(ccy.items);
      });
      setError(null);
    } catch (err) {
      setError(errorMessage(err, t.errors.loadGeneric));
    } finally {
      setBusy(false);
    }
  }, [
    currencyFilter,
    dateFrom,
    dateTo,
    page,
    reloadKey,
    search,
    statusFilter,
    t.errors.loadGeneric,
  ]);

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
  }, [statusFilter, currencyFilter, dateFrom, dateTo]);

  useEffect(() => {
    if (!showCreate) return;
    void listCustomersPage({ archiveFilter: "active", pageSize: 200 })
      .then((res) => setCustomers(res.items))
      .catch(() => setCustomers([]));
  }, [showCreate]);

  function openCreate() {
    setFormError(null);
    setName("");
    setCustomerId("");
    setOrderDate(todayIso());
    setOriginalAmount("");
    setPurchaseDeductionPercent("0");
    setCurrencyCode(pickDefaultCurrency(currencies));
    setShowCreate(true);
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (!customerId.trim()) {
      setFormError(t.accountOrders.customerRequired);
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const created = await createAccountOrder({
        name: name.trim(),
        customerId: customerId.trim(),
        currencyCode,
        orderDate,
        originalAmount: originalAmount.trim(),
        purchaseDeductionPercent: purchaseDeductionPercent.trim() || "0",
      });
      setShowCreate(false);
      showSuccess(t.common.success);
      navigate(`/account-orders/${created.id}`);
    } catch (err) {
      setFormError(errorMessage(err, t.errors.genericTryAgain));
    } finally {
      setSaving(false);
    }
  }

  const customerOptions = useMemo(
    () =>
      customers.map((c) => ({
        value: c.id,
        label: c.code ? `${c.fullName} (${c.code})` : c.fullName,
        keywords: [c.fullName, c.code ?? "", c.phone ?? ""].join(" "),
      })),
    [customers],
  );

  return (
    <div className="stack page-account-orders workspace-page">
      {error ? (
        <PageLoadError
          message={error}
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      ) : null}

      <section className="panel records-panel">
        <div className="records-chrome">
          <div className="records-title">
            <div>
              <h2>{t.accountOrders.title}</h2>
              <span className="count-badge">{total}</span>
            </div>
            <div className="records-title-actions">
              {canWrite ? (
                <button type="button" className="btn primary" onClick={openCreate}>
                  <Plus className="nav-icon" size={16} aria-hidden />
                  <span>{t.accountOrders.newOrder}</span>
                </button>
              ) : null}
            </div>
          </div>
          <div className="table-toolbar">
            <label className="search-field search-field-emphasized">
              <input
                type="search"
                className="desk-search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t.accountOrders.searchPlaceholder}
                aria-label={t.common.search}
              />
            </label>
            <div className="table-filters">
              <label>
                <select
                  value={statusFilter}
                  aria-label={t.common.status}
                  title={t.common.status}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="ALL">{t.common.all}</option>
                  <option value="OPEN">{t.accountOrders.statusOpen}</option>
                  <option value="COMPLETED">{t.accountOrders.statusCompleted}</option>
                  <option value="CANCELLED">{t.accountOrders.statusCancelled}</option>
                </select>
              </label>
              <CurrencyFilter
                currencies={currencies}
                value={currencyFilter}
                onChange={setCurrencyFilter}
                hideLabel
              />
              <label>
                <input
                  type="date"
                  value={dateFrom}
                  aria-label={t.common.from}
                  title={t.common.from}
                  onChange={(e) => {
                    setPeriodPreset("custom");
                    setDateFrom(e.target.value);
                  }}
                />
              </label>
              <label>
                <input
                  type="date"
                  value={dateTo}
                  aria-label={t.common.to}
                  title={t.common.to}
                  onChange={(e) => {
                    setPeriodPreset("custom");
                    setDateTo(e.target.value);
                  }}
                />
              </label>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  const range = datePeriodRange("month", todayIso());
                  setPeriodPreset("month");
                  setDateFrom(range.from);
                  setDateTo(range.to);
                  setStatusFilter("ALL");
                  setCurrencyFilter("");
                  setSearchInput("");
                  setSearch("");
                  setPage(1);
                }}
              >
                {t.accountOrders.clearFilters}
              </button>
            </div>
          </div>
        </div>

        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t.accountOrders.orderNumber}</th>
                <th>{t.accountOrders.orderName}</th>
                <th>{t.accountOrders.linkedCustomer}</th>
                <th className="col-date">{t.accountOrders.orderDate}</th>
                <th className="col-center">{t.common.currency}</th>
                <th className="num">{t.accountOrders.originalAmount}</th>
                <th className="num">{t.accountOrders.remainingAmount}</th>
                <th className="num">{t.accountOrders.netBenefit}</th>
                <th>{t.common.status}</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && !busy ? (
                <tr>
                  <td colSpan={9} className="muted">
                    {t.accountOrders.empty}
                  </td>
                </tr>
              ) : null}
              {items.map((row) => (
                <tr
                  key={row.id}
                  className="customer-row-clickable"
                  onClick={() => navigate(`/account-orders/${row.id}`)}
                >
                  <td dir="ltr">{row.orderNumber}</td>
                  <td>{row.name}</td>
                  <td>
                    {row.customerName
                      ? row.customerCode
                        ? `${row.customerName} (${row.customerCode})`
                        : row.customerName
                      : t.accountOrders.noCustomer}
                  </td>
                  <td className="col-date" dir="ltr">
                    {String(row.orderDate).slice(0, 10)}
                  </td>
                  <td className="col-center">
                    <CurrencyCodeWithFlag code={row.currencyCode} />
                  </td>
                  <td className="num amount-emphasis" dir="ltr">
                    {formatAmountDisplay(row.originalAmount)}
                  </td>
                  <td className="num amount-emphasis" dir="ltr">
                    {formatAmountDisplay(row.totals.remainingAmount)}
                  </td>
                  <td className="num amount-emphasis" dir="ltr">
                    {formatAmountDisplay(
                      row.totals.netBenefit ?? row.totals.netProfit,
                    )}
                  </td>
                  <td>
                    <span className={statusBadgeClass(row.status)}>
                      {statusLabel(t, row.status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="records-pagination">
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            busy={busy}
          />
        </div>
      </section>

      {showCreate ? (
        <Modal
          title={t.accountOrders.newOrder}
          onClose={() => {
            if (!saving) setShowCreate(false);
          }}
        >
          <form className="stack form-grid" onSubmit={onCreate}>
            <ModalErrorBanner message={formError} />
            <label className="field">
              <span>{t.accountOrders.orderName}</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
              />
            </label>
            <SearchableSelect
              label={t.accountOrders.linkedCustomer}
              value={customerId}
              options={customerOptions}
              onChange={setCustomerId}
              placeholder={t.accountOrders.customerRequired}
            />
            <label className="field">
              <span>{t.accountOrders.orderDate}</span>
              <input
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                required
              />
            </label>
            <CurrencyPicker
              label={t.common.currency}
              currencies={currencies}
              value={currencyCode}
              onChange={setCurrencyCode}
              onCurrenciesChange={setCurrencies}
              emptyLabel={t.common.noData}
              searchPlaceholder={t.common.search}
              required
            />
            <label className="field">
              <span>{t.accountOrders.originalAmount}</span>
              <AmountInput
                value={originalAmount}
                onValueChange={setOriginalAmount}
                required
              />
            </label>
            <label className="field">
              <span>{t.accountOrders.purchaseDeductionPercent}</span>
              <AmountInput
                value={purchaseDeductionPercent}
                onValueChange={setPurchaseDeductionPercent}
              />
            </label>
            <div className="row gap end">
              <button
                type="button"
                className="btn"
                disabled={saving}
                onClick={() => setShowCreate(false)}
              >
                <X className="nav-icon" size={16} aria-hidden />
                <span>{t.common.cancel}</span>
              </button>
              <button type="submit" className="btn primary" disabled={saving}>
                <Save className="nav-icon" size={16} aria-hidden />
                <span>{t.accountOrders.saveOrder}</span>
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {successModal}
    </div>
  );
}
