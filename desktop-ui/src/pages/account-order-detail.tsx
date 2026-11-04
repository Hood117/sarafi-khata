import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Archive,
  ClipboardList,
  Pencil,
  Plus,
  Save,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";

import {
  archiveAccountOrder,
  completeAccountOrderRecipient,
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
import { AmountInput } from "@desktop/ui/amount-input";
import { CurrencyCodeWithFlag } from "@desktop/ui/currency-flag";
import { CurrencyPicker } from "@desktop/ui/currency-picker";
import { Modal } from "@desktop/ui/modal";
import { ModalErrorBanner } from "@desktop/ui/modal-error-banner";
import { PageLoadError } from "@desktop/ui/page-load-error";
import { SearchableSelect } from "@desktop/ui/searchable-select";
import { useSuccessModal } from "@desktop/ui/use-success-modal";

function orderStatusLabel(
  t: ReturnType<typeof useT>,
  status: string,
): string {
  switch (status.toUpperCase()) {
    case "COMPLETED":
      return t.accountOrders.statusCompleted;
    case "CANCELLED":
      return t.accountOrders.statusCancelled;
    default:
      return t.accountOrders.statusOpen;
  }
}

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
  const [editingOrder, setEditingOrder] = useState(false);

  const [name, setName] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [currencyCode, setCurrencyCode] = useState("");
  const [orderDate, setOrderDate] = useState(todayIso());
  const [originalAmount, setOriginalAmount] = useState("");
  const [purchaseDeductionPercent, setPurchaseDeductionPercent] = useState("0");
  const [status, setStatus] = useState("OPEN");

  const [editRecipientId, setEditRecipientId] = useState<string | null>(null);
  const [recipientCustomerId, setRecipientCustomerId] = useState("");
  const [recipientMode, setRecipientMode] = useState<"existing" | "new">(
    "existing",
  );
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
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
      // Finish any leftover pending payouts from older saves (now auto-complete on save).
      let resolved = order;
      if (order.transactionId && canWrite) {
        for (const row of order.recipients) {
          if (row.status.toUpperCase() === "PENDING") {
            resolved = await completeAccountOrderRecipient(row.id);
          }
        }
      }
      setDetail(resolved);
      setOrderList(list.items);
      setCurrencies(ccy.items);
      setName(resolved.name);
      setCustomerId(resolved.customerId ?? "");
      setCurrencyCode(resolved.currencyCode);
      setOrderDate(String(resolved.orderDate).slice(0, 10));
      setOriginalAmount(resolved.originalAmount);
      setPurchaseDeductionPercent(resolved.purchaseDeductionPercent);
      setStatus(resolved.status);
      setEditingOrder(false);
      setError(null);
    } catch (err) {
      setError(errorMessage(err, t.errors.loadGeneric));
      setDetail(null);
    } finally {
      setBusy(false);
    }
  }, [canWrite, id, t.errors.loadGeneric]);

  useEffect(() => {
    void load();
  }, [load]);

  function applyOrderFields(order: AccountOrderDetail) {
    setName(order.name);
    setCustomerId(order.customerId ?? "");
    setCurrencyCode(order.currencyCode);
    setOrderDate(String(order.orderDate).slice(0, 10));
    setOriginalAmount(order.originalAmount);
    setPurchaseDeductionPercent(order.purchaseDeductionPercent);
    setStatus(order.status);
  }

  function cancelEditOrder() {
    if (!detail) return;
    applyOrderFields(detail);
    setEditingOrder(false);
    setFormError(null);
  }

  useEffect(() => {
    void listCustomersPage({ archiveFilter: "active", pageSize: 200 })
      .then((res) => setCustomers(res.items))
      .catch(() => setCustomers([]));
  }, []);

  const customerOptions = useMemo(
    () =>
      customers.map((c) => ({
        value: c.id,
        label: c.code ? `${c.fullName} (${c.code})` : c.fullName,
        keywords: [c.fullName, c.code ?? "", c.phone ?? ""].join(" "),
      })),
    [customers],
  );

  function resetRecipientForm(defaults?: {
    detail?: string;
    date?: string;
  }) {
    setEditRecipientId(null);
    setRecipientCustomerId("");
    setRecipientMode("existing");
    setNewCustomerName("");
    setNewCustomerPhone("");
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
    setRecipientMode("existing");
    setRecipientCustomerId(row.customerId ?? "");
    setNewCustomerName("");
    setNewCustomerPhone("");
    setRecipientDetail(row.detail ?? "");
    setRecipientDate(String(row.recipientDate).slice(0, 10));
    setRecipientAmount(row.amount);
    setRecipientFeePercent(row.distributionFeePercent);
    setFormError(null);
  }

  async function onSaveOrder(e: FormEvent) {
    e.preventDefault();
    if (!detail || !canWrite || !editingOrder || savingOrder) return;
    if (!customerId.trim() && detail.transactionId) {
      setFormError(t.accountOrders.customerRequired);
      return;
    }
    setSavingOrder(true);
    setFormError(null);
    try {
      const updated = await updateAccountOrder({
        id: detail.id,
        name: name.trim(),
        customerId: customerId || null,
        clearCustomer: !customerId && !detail.transactionId,
        currencyCode,
        orderDate,
        originalAmount: originalAmount.trim(),
        purchaseDeductionPercent: purchaseDeductionPercent.trim() || "0",
        status,
      });
      setDetail(updated);
      applyOrderFields(updated);
      setEditingOrder(false);
      showSuccess(t.common.success);
      void listCustomersPage({ archiveFilter: "active", pageSize: 200 }).then(
        (res) => setCustomers(res.items),
      );
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
    if (recipientMode === "existing" && !recipientCustomerId.trim()) {
      setFormError(t.accountOrders.customerRequired);
      return;
    }
    if (
      recipientMode === "new" &&
      (!newCustomerName.trim() || !newCustomerPhone.trim())
    ) {
      setFormError(t.accountOrders.customerRequired);
      return;
    }
    setSavingRecipient(true);
    setFormError(null);
    try {
      // Backend save upserts + completes the payout in one step.
      const updated = await upsertAccountOrderRecipient({
        id: editRecipientId ?? undefined,
        orderId: detail.id,
        customerId:
          recipientMode === "existing" ? recipientCustomerId.trim() : null,
        newCustomer:
          recipientMode === "new"
            ? {
                fullName: newCustomerName.trim(),
                phone: newCustomerPhone.trim(),
              }
            : null,
        detail: recipientDetail.trim() || null,
        recipientDate,
        amount: recipientAmount.trim(),
        distributionFeePercent: recipientFeePercent.trim() || "0",
      });
      setDetail(updated);
      void listCustomersPage({ archiveFilter: "active", pageSize: 200 }).then(
        (res) => setCustomers(res.items),
      );
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
    <div className="stack account-order-desk workspace-page">
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
              <Archive className="nav-icon" size={16} aria-hidden />
              <span>{t.accountOrders.archiveOrder}</span>
            </button>
          ) : null}
        </div>
      </header>

      <ModalErrorBanner message={formError} />
      {!detail.transactionId ? (
        <p className="muted small">{t.accountOrders.trackingOnlyLegacy}</p>
      ) : null}

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
          <section className="section-card stack account-order-header-card">
            <div className="account-order-header-top">
              <h2 className="section-title">
                <ClipboardList className="nav-icon" size={16} aria-hidden />
                <span>{t.accountOrders.orderDetails}</span>
              </h2>
              {canWrite ? (
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    applyOrderFields(detail);
                    setEditingOrder(true);
                    setFormError(null);
                  }}
                >
                  <Pencil className="nav-icon" size={16} aria-hidden />
                  <span>{t.accountOrders.editOrder}</span>
                </button>
              ) : null}
            </div>
            <dl className="account-order-detail-grid account-order-header-identity">
              <div className="account-order-detail-item">
                <dt>{t.accountOrders.orderName}</dt>
                <dd>{detail.name}</dd>
              </div>
              <div className="account-order-detail-item">
                <dt>{t.accountOrders.orderNumber}</dt>
                <dd dir="ltr">{detail.orderNumber}</dd>
              </div>
              <div className="account-order-detail-item">
                <dt>{t.accountOrders.orderDate}</dt>
                <dd dir="ltr">{String(detail.orderDate).slice(0, 10)}</dd>
              </div>
              <div className="account-order-detail-item">
                <dt>{t.accountOrders.linkedCustomer}</dt>
                <dd>
                  {detail.customerName
                    ? detail.customerCode
                      ? `${detail.customerName} (${detail.customerCode})`
                      : detail.customerName
                    : "—"}
                </dd>
              </div>
              <div className="account-order-detail-item">
                <dt>{t.common.currency}</dt>
                <dd>
                  <CurrencyCodeWithFlag code={detail.currencyCode} />
                </dd>
              </div>
              <div className="account-order-detail-item">
                <dt>{t.common.status}</dt>
                <dd>
                  <span
                    className={`badge account-order-status-badge status-${detail.status.toLowerCase()}`}
                  >
                    {orderStatusLabel(t, detail.status)}
                  </span>
                </dd>
              </div>
            </dl>
            <dl className="account-order-detail-grid account-order-header-money">
              <div className="account-order-detail-item">
                <dt>{t.accountOrders.originalAmount}</dt>
                <dd className="amount-emphasis" dir="ltr">
                  {formatAmountDisplay(detail.originalAmount)}
                </dd>
              </div>
              <div className="account-order-detail-item">
                <dt>{t.accountOrders.purchaseDeductionPercent}</dt>
                <dd className="amount-emphasis" dir="ltr">
                  {detail.purchaseDeductionPercent}
                </dd>
              </div>
              <div className="account-order-detail-item">
                <dt>{t.accountOrders.purchaseDeduction}</dt>
                <dd className="amount-emphasis" dir="ltr">
                  {formatAmountDisplay(totals.purchaseDeduction)}
                </dd>
              </div>
              <div className="account-order-detail-item">
                <dt>{t.accountOrders.netPurchaseAmount}</dt>
                <dd className="amount-emphasis" dir="ltr">
                  {formatAmountDisplay(totals.netPurchaseAmount)}
                </dd>
              </div>
            </dl>
          </section>

          <form className="section-card account-order-entry-row" onSubmit={onSaveRecipient}>
            <h2 className="section-title">
              {editRecipientId ? (
                <Pencil className="nav-icon" size={16} aria-hidden />
              ) : (
                <UserPlus className="nav-icon" size={16} aria-hidden />
              )}
              <span>
                {editRecipientId
                  ? t.accountOrders.editRecipient
                  : t.accountOrders.addRecipient}
              </span>
            </h2>
            <div className="account-order-entry-grid">
              <label className="field">
                <span>{t.accountOrders.recipientType}</span>
                <select
                  value={recipientMode}
                  onChange={(e) =>
                    setRecipientMode(e.target.value === "new" ? "new" : "existing")
                  }
                  disabled={!canWrite}
                >
                  <option value="existing">{t.accountOrders.linkedCustomer}</option>
                  <option value="new">{t.accountOrders.newRecipientCustomer}</option>
                </select>
              </label>
              {recipientMode === "existing" ? (
                <SearchableSelect
                  label={t.accountOrders.recipientCustomer}
                  value={recipientCustomerId}
                  options={customerOptions}
                  onChange={setRecipientCustomerId}
                  disabled={!canWrite}
                  placeholder=""
                />
              ) : (
                <>
                  <label className="field">
                    <span>{t.common.fullName}</span>
                    <input
                      value={newCustomerName}
                      onChange={(e) => setNewCustomerName(e.target.value)}
                      disabled={!canWrite}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>{t.common.phone}</span>
                    <input
                      value={newCustomerPhone}
                      onChange={(e) => setNewCustomerPhone(e.target.value)}
                      disabled={!canWrite}
                      dir="ltr"
                      required
                    />
                  </label>
                </>
              )}
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
                <AmountInput
                  className="amount-emphasis"
                  value={recipientAmount}
                  onValueChange={setRecipientAmount}
                  disabled={!canWrite}
                  required
                />
              </label>
              <label className="field">
                <span>{t.accountOrders.distributionFeePercent}</span>
                <AmountInput
                  className="amount-emphasis"
                  value={recipientFeePercent}
                  onValueChange={setRecipientFeePercent}
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
                      <X className="nav-icon" size={16} aria-hidden />
                      <span>{t.common.cancel}</span>
                    </button>
                  ) : null}
                  <button
                    type="submit"
                    className="btn primary"
                    disabled={savingRecipient}
                  >
                    {editRecipientId ? (
                      <Save className="nav-icon" size={16} aria-hidden />
                    ) : (
                      <Plus className="nav-icon" size={16} aria-hidden />
                    )}
                    <span>{t.accountOrders.saveRecipient}</span>
                  </button>
                </div>
              ) : null}
            </div>
          </form>

          <div className="section-card stack account-order-recipients-card">
            <h2 className="section-title">
              <ClipboardList className="nav-icon" size={16} aria-hidden />
              <span>{t.accountOrders.recipients}</span>
            </h2>
            <div className="table-scroll">
              <table className="data-table account-order-recipients-table">
                <thead>
                  <tr>
                    <th className="col-row">#</th>
                    <th className="col-ref">{t.accountOrders.recipientId}</th>
                    <th className="col-party">{t.accountOrders.recipientName}</th>
                    <th className="col-date">{t.accountOrders.recipientDate}</th>
                    <th>{t.accountOrders.detail}</th>
                    <th className="num col-amount">{t.accountOrders.recipientAmount}</th>
                    <th className="num">{t.accountOrders.distributionFeePercent}</th>
                    <th className="num col-amount">{t.accountOrders.distributionFeeAmount}</th>
                    <th className="num col-amount">{t.accountOrders.netRecipientAmount}</th>
                    <th className="col-center">{t.common.currency}</th>
                    {canWrite ? <th className="col-actions" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {detail.recipients.length === 0 ? (
                    <tr>
                      <td colSpan={canWrite ? 11 : 10} className="muted">
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
                      <td className="col-row" dir="ltr">
                        {index + 1}
                      </td>
                      <td className="col-ref" dir="ltr">
                        <strong>{row.recipientNumber}</strong>
                      </td>
                      <td className="col-party">
                        <strong className="account-order-recipient-name">
                          {row.customerName ?? row.name}
                        </strong>
                        {row.customerCode ? (
                          <span className="account-order-recipient-code muted">
                            {" "}
                            ({row.customerCode})
                          </span>
                        ) : null}
                      </td>
                      <td className="col-date" dir="ltr">
                        {String(row.recipientDate).slice(0, 10)}
                      </td>
                      <td className="account-order-recipient-detail">
                        {row.detail ?? "—"}
                      </td>
                      <td className="num col-amount amount-emphasis" dir="ltr">
                        {formatAmountDisplay(row.amount)}
                      </td>
                      <td className="num" dir="ltr">
                        {row.distributionFeePercent}
                      </td>
                      <td className="num col-amount amount-emphasis" dir="ltr">
                        {formatAmountDisplay(row.distributionFeeAmount)}
                      </td>
                      <td className="num col-amount amount-emphasis" dir="ltr">
                        {formatAmountDisplay(row.netAmount)}
                      </td>
                      <td className="col-center">
                        <CurrencyCodeWithFlag code={detail.currencyCode} />
                      </td>
                      {canWrite ? (
                        <td className="col-actions">
                          <div className="row gap account-order-row-actions">
                            <button
                              type="button"
                              className="btn small"
                              onClick={() => startEditRecipient(row)}
                            >
                              <Pencil className="nav-icon" size={14} aria-hidden />
                              <span>{t.common.editAction}</span>
                            </button>
                            <button
                              type="button"
                              className="btn small danger"
                              onClick={() => void onDeleteRecipient(row)}
                            >
                              <Trash2 className="nav-icon" size={14} aria-hidden />
                              <span>{t.common.delete}</span>
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
        </section>
      </div>

      <footer className="account-order-footer section-card">
        <div className="stat">
          <span className="muted">{t.accountOrders.originalAmount}</span>
          <strong className="amount-emphasis">
            {formatAmountDisplay(detail.originalAmount)}
          </strong>
        </div>
        <div className="stat">
          <span className="muted">{t.accountOrders.totalDistributed}</span>
          <strong className="amount-emphasis">
            {formatAmountDisplay(totals.totalDistributed)}
          </strong>
        </div>
        <div className="stat">
          <span className="muted">{t.accountOrders.remainingAmount}</span>
          <strong className="amount-emphasis">
            {formatAmountDisplay(totals.remainingAmount)}
          </strong>
        </div>
        <div className="stat account-order-fee-total">
          <span className="muted">{t.accountOrders.totalDistributionFees}</span>
          <strong className="amount-emphasis">
            {formatAmountDisplay(totals.totalDistributionFees)}
          </strong>
        </div>
        <div className="stat">
          <span className="muted">{t.accountOrders.recipients}</span>
          <strong className="amount-emphasis">
            {totals.completedCount}/{totals.recipientCount}
          </strong>
        </div>
        <div className="stat account-order-net-benefit">
          <span className="muted">{t.accountOrders.netBenefit}</span>
          <strong className="amount-emphasis">
            {formatAmountDisplay(totals.netBenefit ?? totals.netProfit)}
          </strong>
        </div>
      </footer>

      {editingOrder ? (
        <Modal
          title={t.accountOrders.editOrder}
          size="wide"
          onClose={cancelEditOrder}
        >
          <form className="stack account-order-edit-modal" onSubmit={onSaveOrder}>
            <ModalErrorBanner message={formError} />
            <div className="account-order-header-grid account-order-edit-identity">
              <label className="field">
                <span>{t.accountOrders.orderName}</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
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
                  required
                />
              </label>
              <SearchableSelect
                label={t.accountOrders.linkedCustomer}
                value={customerId}
                options={customerOptions}
                onChange={setCustomerId}
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
                >
                  <option value="OPEN">{t.accountOrders.statusOpen}</option>
                  <option value="COMPLETED">{t.accountOrders.statusCompleted}</option>
                  <option value="CANCELLED">{t.accountOrders.statusCancelled}</option>
                </select>
              </label>
            </div>
            <div className="account-order-header-grid account-order-edit-money">
              <label className="field">
                <span>{t.accountOrders.originalAmount}</span>
                <AmountInput
                  className="amount-emphasis"
                  value={originalAmount}
                  onValueChange={setOriginalAmount}
                  required
                />
              </label>
              <label className="field">
                <span>{t.accountOrders.purchaseDeductionPercent}</span>
                <AmountInput
                  className="amount-emphasis"
                  value={purchaseDeductionPercent}
                  onValueChange={setPurchaseDeductionPercent}
                />
              </label>
              <label className="field">
                <span>{t.accountOrders.purchaseDeduction}</span>
                <input
                  className="amount-emphasis"
                  value={formatAmountDisplay(totals.purchaseDeduction)}
                  readOnly
                  dir="ltr"
                />
              </label>
              <label className="field">
                <span>{t.accountOrders.netPurchaseAmount}</span>
                <input
                  className="amount-emphasis"
                  value={formatAmountDisplay(totals.netPurchaseAmount)}
                  readOnly
                  dir="ltr"
                />
              </label>
            </div>
            <div className="modal-actions" style={{ justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn"
                onClick={cancelEditOrder}
                disabled={savingOrder}
              >
                <X className="nav-icon" size={16} aria-hidden />
                <span>{t.common.cancel}</span>
              </button>
              <button
                type="submit"
                className="btn primary"
                disabled={savingOrder}
              >
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
