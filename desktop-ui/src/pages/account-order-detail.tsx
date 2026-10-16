import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  archiveAccountOrder,
  deleteAccountOrderRecipient,
  getAccountOrder,
  listAccountOrders,
  listCurrenciesPage,
  listCustomersPage,
  updateAccountOrder,
  upsertAccountOrderRecipient,
  type AccountOrderDetail,
  type AccountOrderListItem,
  type AccountOrderRecipientRow,
  type CurrencyListItem,
  type CustomerListItem,
} from "@desktop/api";
import { useAuth } from "@desktop/auth";
import { useT } from "@desktop/i18n";
import { errorMessage, todayIso } from "@desktop/lib/datetime";
import { canWritePath } from "@desktop/lib/permissions";
import { formatAmountDisplay } from "@desktop/pages/hawala-helpers";
import { CurrencyCodeWithFlag } from "@desktop/ui/currency-flag";
import { CurrencyPicker } from "@desktop/ui/currency-picker";
import { ModalErrorBanner } from "@desktop/ui/modal-error-banner";
import { PageLoadError } from "@desktop/ui/page-load-error";
import { SearchableSelect } from "@desktop/ui/searchable-select";
import { useSuccessModal } from "@desktop/ui/use-success-modal";

export function AccountOrderDetailPage() {
  const { id = "" } = useParams();
  const t = useT();
  const { session } = useAuth();
  const navigate = useNavigate();
  const canWrite = canWritePath(session, "/account-orders");
  const { showSuccess, successModal } = useSuccessModal();

  const [detail, setDetail] = useState<AccountOrderDetail | null>(null);
  const [orderList, setOrderList] = useState<AccountOrderListItem[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyListItem[]>([]);
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [savingRecipient, setSavingRecipient] = useState(false);

  const [name, setName] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [currencyCode, setCurrencyCode] = useState("");
  const [orderDate, setOrderDate] = useState(todayIso());
  const [originalAmount, setOriginalAmount] = useState("");
  const [purchaseDeductionPercent, setPurchaseDeductionPercent] = useState("0");
  const [status, setStatus] = useState("OPEN");

  const [editRecipientId, setEditRecipientId] = useState<string | null>(null);
  const [recipientName, setRecipientName] = useState("");
  const [recipientDetail, setRecipientDetail] = useState("");
  const [recipientDate, setRecipientDate] = useState(todayIso());
  const [recipientAmount, setRecipientAmount] = useState("");
  const [recipientFeePercent, setRecipientFeePercent] = useState("0");

  const load = useCallback(async () => {
    if (!id) return;
    setBusy(true);
    try {
      const [order, list, ccy] = await Promise.all([
        getAccountOrder(id),
        listAccountOrders({ page: 1, pageSize: 40 }),
        listCurrenciesPage({ activeOnly: true, pageSize: 200 }),
      ]);
      setDetail(order);
      setOrderList(list.items);
      setCurrencies(ccy.items);
      setName(order.name);
      setCustomerId(order.customerId ?? "");
      setCurrencyCode(order.currencyCode);
      setOrderDate(String(order.orderDate).slice(0, 10));
      setOriginalAmount(order.originalAmount);
      setPurchaseDeductionPercent(order.purchaseDeductionPercent);
      setStatus(order.status);
      setError(null);
    } catch (err) {
      setError(errorMessage(err, t.errors.loadGeneric));
      setDetail(null);
    } finally {
      setBusy(false);
    }
  }, [id, t.errors.loadGeneric]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void listCustomersPage({ archiveFilter: "active", pageSize: 200 })
      .then((res) => setCustomers(res.items))
      .catch(() => setCustomers([]));
  }, []);

  const customerOptions = useMemo(
    () => [
      { value: "", label: t.accountOrders.noCustomer },
      ...customers.map((c) => ({
        value: c.id,
        label: c.code ? `${c.fullName} (${c.code})` : c.fullName,
        keywords: [c.fullName, c.code ?? "", c.phone ?? ""].join(" "),
      })),
    ],
    [customers, t.accountOrders.noCustomer],
  );

  function resetRecipientForm(defaults?: {
    detail?: string;
    date?: string;
  }) {
    setEditRecipientId(null);
    setRecipientName("");
    setRecipientDetail(defaults?.detail ?? detail?.customerName ?? detail?.name ?? "");
    setRecipientDate(defaults?.date ?? (orderDate || todayIso()));
    setRecipientAmount("");
    setRecipientFeePercent("0");
    setFormError(null);
  }

  useEffect(() => {
    if (!detail) return;
    resetRecipientForm({
      detail: detail.customerName ?? detail.name,
      date: String(detail.orderDate).slice(0, 10),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when order id changes
  }, [detail?.id]);

  function startEditRecipient(row: AccountOrderRecipientRow) {
    setEditRecipientId(row.id);
    setRecipientName(row.name);
    setRecipientDetail(row.detail ?? "");
    setRecipientDate(String(row.recipientDate).slice(0, 10));
    setRecipientAmount(row.amount);
    setRecipientFeePercent(row.distributionFeePercent);
    setFormError(null);
  }

  async function onSaveOrder(e: FormEvent) {
    e.preventDefault();
    if (!detail || !canWrite || savingOrder) return;
    setSavingOrder(true);
    setFormError(null);
    try {
      const updated = await updateAccountOrder({
        id: detail.id,
        name: name.trim(),
        customerId: customerId || null,
        clearCustomer: !customerId,
        currencyCode,
        orderDate,
        originalAmount: originalAmount.trim(),
        purchaseDeductionPercent: purchaseDeductionPercent.trim() || "0",
        status,
      });
      setDetail(updated);
      showSuccess(t.common.success);
      void listAccountOrders({ page: 1, pageSize: 40 }).then((list) =>
        setOrderList(list.items),
      );
    } catch (err) {
      setFormError(errorMessage(err, t.errors.genericTryAgain));
    } finally {
      setSavingOrder(false);
    }
  }

  async function onSaveRecipient(e: FormEvent) {
    e.preventDefault();
    if (!detail || !canWrite || savingRecipient) return;
    setSavingRecipient(true);
    setFormError(null);
    try {
      const updated = await upsertAccountOrderRecipient({
        id: editRecipientId ?? undefined,
        orderId: detail.id,
        name: recipientName.trim(),
        detail: recipientDetail.trim() || null,
        recipientDate,
        amount: recipientAmount.trim(),
        distributionFeePercent: recipientFeePercent.trim() || "0",
        status: "COMPLETED",
      });
      setDetail(updated);
      resetRecipientForm({
        detail: updated.customerName ?? updated.name,
        date: String(updated.orderDate).slice(0, 10),
      });
      showSuccess(t.common.success);
    } catch (err) {
      setFormError(errorMessage(err, t.accountOrders.overDistribution));
    } finally {
      setSavingRecipient(false);
    }
  }

  async function onDeleteRecipient(row: AccountOrderRecipientRow) {
    if (!canWrite) return;
    if (!window.confirm(`${t.accountOrders.deleteRecipient} “${row.name}”?`)) {
      return;
    }
    try {
      const updated = await deleteAccountOrderRecipient(row.id);
      setDetail(updated);
      if (editRecipientId === row.id) {
        resetRecipientForm({
          detail: updated.customerName ?? updated.name,
          date: String(updated.orderDate).slice(0, 10),
        });
      }
      showSuccess(t.common.success);
    } catch (err) {
      setFormError(errorMessage(err, t.errors.genericTryAgain));
    }
  }

  async function onArchive() {
    if (!detail || !canWrite) return;
    if (!window.confirm(`${t.accountOrders.archiveOrder} “${detail.name}”?`)) {
      return;
    }
    try {
      await archiveAccountOrder(detail.id);
      showSuccess(t.common.success);
      navigate("/account-orders");
    } catch (err) {
      setFormError(errorMessage(err, t.errors.genericTryAgain));
    }
  }

  if (error && !detail) {
    return (
      <PageLoadError message={error} onRetry={() => void load()} />
    );
  }

  if (busy && !detail) {
    return (
      <div className="stack">
        <p className="muted">{t.common.loading}</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="stack">
        <p className="muted">{t.accountOrders.selectOrder}</p>
        <Link to="/account-orders">{t.common.back}</Link>
      </div>
    );
  }

  const totals = detail.totals;

  return (
    <div className="stack account-order-desk">
      <header className="page-header row wrap gap">
        <div className="stack tight">
          <p className="muted">
            <Link to="/account-orders">{t.accountOrders.title}</Link>
            {" / "}
            {detail.name}
          </p>
          <h1>
            {t.accountOrders.orderNumber} {detail.orderNumber}
          </h1>
        </div>
        <div className="row wrap gap">
          {canWrite ? (
            <button type="button" className="btn danger" onClick={() => void onArchive()}>
              {t.accountOrders.archiveOrder}
            </button>
          ) : null}
        </div>
      </header>

      <ModalErrorBanner message={formError} />

      <div className="account-order-layout">
        <aside className="account-order-list section-card">
          <h2 className="section-title">{t.accountOrders.ordersList}</h2>
          <div className="table-scroll account-order-list-scroll">
            <table className="data-table compact">
              <thead>
                <tr>
                  <th>{t.accountOrders.orderName}</th>
                  <th>{t.accountOrders.orderNumber}</th>
                </tr>
              </thead>
              <tbody>
                {orderList.map((row) => {
                  const selected = row.id === detail.id;
                  return (
                    <tr
                      key={row.id}
                      className={`customer-row-clickable${selected ? " is-selected" : ""}`}
                      aria-selected={selected}
                      aria-current={selected ? "page" : undefined}
                      onClick={() => navigate(`/account-orders/${row.id}`)}
                    >
                      <td>{row.name}</td>
                      <td dir="ltr">{row.orderNumber}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </aside>

        <section className="account-order-main stack">
          <form className="section-card stack" onSubmit={onSaveOrder}>
            <div className="account-order-header-grid">
              <label className="field">
                <span>{t.accountOrders.orderName}</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={!canWrite}
                  required
                />
              </label>
              <label className="field">
                <span>{t.accountOrders.orderNumber}</span>
                <input value={detail.orderNumber} readOnly dir="ltr" />
              </label>
              <label className="field">
                <span>{t.accountOrders.orderDate}</span>
                <input
                  type="date"
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                  disabled={!canWrite}
                  required
                />
              </label>
              <SearchableSelect
                label={t.accountOrders.linkedCustomer}
                value={customerId}
                options={customerOptions}
                onChange={setCustomerId}
                disabled={!canWrite}
                placeholder={t.accountOrders.optionalCustomer}
              />
              <CurrencyPicker
                label={t.common.currency}
                currencies={currencies}
                value={currencyCode}
                onChange={setCurrencyCode}
                onCurrenciesChange={setCurrencies}
                emptyLabel={t.common.noData}
                searchPlaceholder={t.common.search}
                required
                allowManage={false}
              />
              <label className="field">
                <span>{t.common.status}</span>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  disabled={!canWrite}
                >
                  <option value="OPEN">{t.accountOrders.statusOpen}</option>
                  <option value="COMPLETED">{t.accountOrders.statusCompleted}</option>
                  <option value="CANCELLED">{t.accountOrders.statusCancelled}</option>
                </select>
              </label>
              <label className="field">
                <span>{t.accountOrders.originalAmount}</span>
                <input
                  value={originalAmount}
                  onChange={(e) => setOriginalAmount(e.target.value)}
                  inputMode="decimal"
                  dir="ltr"
                  disabled={!canWrite}
                  required
                />
              </label>
              <label className="field">
                <span>{t.accountOrders.purchaseDeductionPercent}</span>
                <input
                  value={purchaseDeductionPercent}
                  onChange={(e) => setPurchaseDeductionPercent(e.target.value)}
                  inputMode="decimal"
                  dir="ltr"
                  disabled={!canWrite}
                />
              </label>
              <label className="field">
                <span>{t.accountOrders.purchaseDeduction}</span>
                <input
                  value={formatAmountDisplay(totals.purchaseDeduction)}
                  readOnly
                  dir="ltr"
                />
              </label>
              <label className="field">
                <span>{t.accountOrders.netPurchaseAmount}</span>
                <input
                  value={formatAmountDisplay(totals.netPurchaseAmount)}
                  readOnly
                  dir="ltr"
                />
              </label>
            </div>
            {canWrite ? (
              <div className="row gap end">
                <button type="submit" className="btn primary" disabled={savingOrder}>
                  {t.accountOrders.saveOrder}
                </button>
              </div>
            ) : null}
          </form>

          <form className="section-card account-order-entry-row" onSubmit={onSaveRecipient}>
            <h2 className="section-title">
              {editRecipientId
                ? t.accountOrders.editRecipient
                : t.accountOrders.addRecipient}
            </h2>
            <div className="account-order-entry-grid">
              <label className="field">
                <span>{t.accountOrders.recipientName}</span>
                <input
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  disabled={!canWrite}
                  required
                />
              </label>
              <label className="field">
                <span>{t.accountOrders.detail}</span>
                <input
                  value={recipientDetail}
                  onChange={(e) => setRecipientDetail(e.target.value)}
                  disabled={!canWrite}
                />
              </label>
              <label className="field">
                <span>{t.accountOrders.recipientDate}</span>
                <input
                  type="date"
                  value={recipientDate}
                  onChange={(e) => setRecipientDate(e.target.value)}
                  disabled={!canWrite}
                  required
                />
              </label>
              <label className="field">
                <span>{t.accountOrders.recipientAmount}</span>
                <input
                  value={recipientAmount}
                  onChange={(e) => setRecipientAmount(e.target.value)}
                  inputMode="decimal"
                  dir="ltr"
                  disabled={!canWrite}
                  required
                />
              </label>
              <label className="field">
                <span>{t.accountOrders.distributionFeePercent}</span>
                <input
                  value={recipientFeePercent}
                  onChange={(e) => setRecipientFeePercent(e.target.value)}
                  inputMode="decimal"
                  dir="ltr"
                  disabled={!canWrite}
                />
              </label>
              {canWrite ? (
                <div className="row gap account-order-entry-actions">
                  {editRecipientId ? (
                    <button
                      type="button"
                      className="btn"
                      onClick={() =>
                        resetRecipientForm({
                          detail: detail.customerName ?? detail.name,
                          date: orderDate,
                        })
                      }
                    >
                      {t.common.cancel}
                    </button>
                  ) : null}
                  <button
                    type="submit"
                    className="btn primary"
                    disabled={savingRecipient}
                  >
                    {t.accountOrders.saveRecipient}
                  </button>
                </div>
              ) : null}
            </div>
          </form>

          <div className="section-card stack">
            <h2 className="section-title">{t.accountOrders.recipients}</h2>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t.accountOrders.recipientId}</th>
                    <th>{t.accountOrders.recipientName}</th>
                    <th>{t.accountOrders.recipientDate}</th>
                    <th>{t.accountOrders.detail}</th>
                    <th className="num">{t.accountOrders.originalAmount}</th>
                    <th className="num">{t.accountOrders.recipientAmount}</th>
                    <th className="num">{t.accountOrders.distributionFeePercent}</th>
                    <th className="num">{t.accountOrders.distributionFeeAmount}</th>
                    <th className="num">{t.accountOrders.netRecipientAmount}</th>
                    <th>{t.common.currency}</th>
                    {canWrite ? <th /> : null}
                  </tr>
                </thead>
                <tbody>
                  {detail.recipients.length === 0 ? (
                    <tr>
                      <td colSpan={canWrite ? 12 : 11} className="muted">
                        {t.accountOrders.emptyRecipients}
                      </td>
                    </tr>
                  ) : null}
                  {detail.recipients.map((row, index) => (
                    <tr
                      key={row.id}
                      className={
                        editRecipientId === row.id ? "is-selected" : undefined
                      }
                      aria-selected={editRecipientId === row.id}
                    >
                      <td dir="ltr">{index + 1}</td>
                      <td dir="ltr">{row.recipientNumber}</td>
                      <td>{row.name}</td>
                      <td dir="ltr">{String(row.recipientDate).slice(0, 10)}</td>
                      <td>{row.detail ?? "—"}</td>
                      <td className="num" dir="ltr">
                        {formatAmountDisplay(detail.originalAmount)}
                      </td>
                      <td className="num" dir="ltr">
                        {formatAmountDisplay(row.amount)}
                      </td>
                      <td className="num" dir="ltr">
                        {row.distributionFeePercent}
                      </td>
                      <td className="num" dir="ltr">
                        {formatAmountDisplay(row.distributionFeeAmount)}
                      </td>
                      <td className="num" dir="ltr">
                        {formatAmountDisplay(row.netAmount)}
                      </td>
                      <td>
                        <CurrencyCodeWithFlag code={detail.currencyCode} />
                      </td>
                      {canWrite ? (
                        <td>
                          <div className="row gap wrap">
                            <button
                              type="button"
                              className="btn small"
                              onClick={() => startEditRecipient(row)}
                            >
                              {t.common.edit}
                            </button>
                            <button
                              type="button"
                              className="btn small danger"
                              onClick={() => void onDeleteRecipient(row)}
                            >
                              {t.common.delete}
                            </button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <footer className="account-order-footer section-card row wrap gap">
            <div className="stat">
              <span className="muted">{t.accountOrders.originalAmount}</span>
              <strong dir="ltr">{formatAmountDisplay(detail.originalAmount)}</strong>
            </div>
            <div className="stat">
              <span className="muted">{t.accountOrders.totalDistributed}</span>
              <strong dir="ltr">
                {formatAmountDisplay(totals.totalDistributed)}
              </strong>
            </div>
            <div className="stat">
              <span className="muted">{t.accountOrders.remainingAmount}</span>
              <strong dir="ltr">
                {formatAmountDisplay(totals.remainingAmount)}
              </strong>
            </div>
            <div className="stat account-order-fee-total">
              <span className="muted">{t.accountOrders.totalDistributionFees}</span>
              <strong dir="ltr">
                {formatAmountDisplay(totals.totalDistributionFees)}
              </strong>
            </div>
            <div className="stat">
              <span className="muted">{t.accountOrders.netProfit}</span>
              <strong className="amount-emphasis" dir="ltr">
                {formatAmountDisplay(totals.netProfit)}
              </strong>
            </div>
            <div className="stat">
              <span className="muted">{t.accountOrders.recipients}</span>
              <strong dir="ltr">{totals.recipientCount}</strong>
            </div>
          </footer>
        </section>
      </div>

      {successModal}
    </div>
  );
}
