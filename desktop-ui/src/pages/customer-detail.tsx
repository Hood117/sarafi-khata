import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  archiveCustomer,
  customerAddMoney,
  customerTakeMoney,
  getCustomer,
  getCustomerBalances,
  getTransactionDetail,
  listCurrenciesPage,
  listCustomerLedger,
  listCustomersPage,
  listWalletsPage,
  restoreCustomer,
  transferFunds,
  type CurrencyListItem,
  type CustomerBalanceRow,
  type CustomerDetail,
  type CustomerLedgerRow,
  type CustomerListItem,
  type CustomerMoneyResult,
  type TransactionDetail,
  type WalletListItem,
} from "@desktop/api";
import { useAuth } from "@desktop/auth";
import { IconCash, IconHistory } from "@desktop/icons";
import { useT } from "@desktop/i18n";
import { nowTime, todayIso } from "@desktop/lib/datetime";
import { CustomerEditForm } from "@desktop/pages/customer-forms";
import { Modal } from "@desktop/ui/modal";
import { Pagination } from "@desktop/ui/pagination";
import { SuccessModal } from "@desktop/ui/success-modal";

type Tab = "overview" | "history";
type MoneyMode = "add" | "take";

function flowBadge(flow: string, t: ReturnType<typeof useT>) {
  if (flow === "IN") return <span className="badge badge-ok">{t.common.debit}</span>;
  if (flow === "OUT") return <span className="badge">{t.common.credit}</span>;
  if (flow === "MIXED") return <span className="badge">{t.common.net}</span>;
  return <span className="muted">—</span>;
}

type ReceiptLabels = {
  depositTitle: string;
  withdrawTitle: string;
  customer: string;
  reference: string;
  relatedTransaction: string;
  date: string;
  currency: string;
  amount: string;
  balance: string;
  status: string;
};

function printReceipt(
  result: CustomerMoneyResult,
  companyName: string,
  labels: ReceiptLabels,
) {
  const w = window.open("", "_blank", "noopener,noreferrer,width=480,height=720");
  if (!w) return;
  const title =
    result.direction === "IN" ? labels.depositTitle : labels.withdrawTitle;
  w.document.write(`<!doctype html><html><head><title>${title}</title>
  <style>
    body{font-family:Georgia,serif;padding:24px;color:#111}
    h1{font-size:1.25rem;margin:0 0 4px}
    .muted{color:#555;font-size:0.9rem}
    table{width:100%;border-collapse:collapse;margin-top:16px}
    td{padding:6px 0;border-bottom:1px solid #ddd;vertical-align:top}
    td:first-child{color:#555;width:42%}
    .sig{margin-top:48px;display:flex;justify-content:space-between;gap:24px}
    .sig div{flex:1;border-top:1px solid #333;padding-top:8px;font-size:0.85rem}
  </style></head><body>
  <h1>${companyName}</h1>
  <p class="muted">${title}</p>
  <table>
    <tr><td>${labels.customer}</td><td>${result.customerName}</td></tr>
    <tr><td>${labels.reference}</td><td>${result.transaction.reference}</td></tr>
    <tr><td>${labels.relatedTransaction}</td><td>${result.transaction.id.slice(0, 8)}</td></tr>
    <tr><td>${labels.date}</td><td>${result.transaction.valueDate}</td></tr>
    <tr><td>${labels.currency}</td><td>${result.currencyCode}</td></tr>
    <tr><td>${labels.amount}</td><td>${result.amount}</td></tr>
    <tr><td>${labels.balance}</td><td>${result.previousBalance}</td></tr>
    <tr><td>${labels.balance}</td><td>${result.newBalance}</td></tr>
    <tr><td>${labels.status}</td><td>${result.transaction.status}</td></tr>
  </table>
  <script>window.onload=()=>{window.print();}</script>
  </body></html>`);
  w.document.close();
}

export function CustomerDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const t = useT();

  const [tab, setTab] = useState<Tab>("overview");
  const [showEdit, setShowEdit] = useState(false);
  const [moneyMode, setMoneyMode] = useState<MoneyMode | null>(null);
  const [showTransfer, setShowTransfer] = useState(false);

  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [balances, setBalances] = useState<CustomerBalanceRow[]>([]);
  const [history, setHistory] = useState<CustomerLedgerRow[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const historyPageSize = 25;
  const [currencies, setCurrencies] = useState<CurrencyListItem[]>([]);
  const [cashWallets, setCashWallets] = useState<WalletListItem[]>([]);
  const [otherCustomers, setOtherCustomers] = useState<CustomerListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [moneyError, setMoneyError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [detail, setDetail] = useState<TransactionDetail | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [amount, setAmount] = useState("");
  const [currencyCode, setCurrencyCode] = useState("");
  const [cashWalletId, setCashWalletId] = useState("");
  const [valueDate, setValueDate] = useState(todayIso());
  const [valueTime, setValueTime] = useState(nowTime());
  const [description, setDescription] = useState("");
  const [moneyNotes, setMoneyNotes] = useState("");
  const [reference, setReference] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [lastResult, setLastResult] = useState<CustomerMoneyResult | null>(null);

  const [transferReceiverId, setTransferReceiverId] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferCurrency, setTransferCurrency] = useState("");
  const [transferDescription, setTransferDescription] = useState("");
  const [transferError, setTransferError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setBusy(true);
    try {
      const [c, bals, hist, ccy, wallets, customers] = await Promise.all([
        getCustomer(id),
        getCustomerBalances(id),
        listCustomerLedger({
          customerId: id,
          page: historyPage,
          pageSize: historyPageSize,
        }),
        listCurrenciesPage({ activeOnly: true, pageSize: 100 }),
        listWalletsPage({ pageSize: 100, activeOnly: true }),
        listCustomersPage({ archiveFilter: "active", page: 1, pageSize: 200 }),
      ]);
      setCustomer(c);
      setBalances(bals);
      setHistory(hist.items);
      setHistoryTotal(hist.total);
      setCurrencies(ccy.items);
      const cash = wallets.items.filter((w) => w.type === "TILL" || w.type === "VAULT");
      setCashWallets(cash);
      setCashWalletId((prev) => prev || cash[0]?.id || "");
      setCurrencyCode((prev) => prev || ccy.items[0]?.code || "");
      setTransferCurrency((prev) => prev || ccy.items[0]?.code || "");
      setOtherCustomers(customers.items.filter((row) => row.id !== id));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [id, historyPage]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setHistoryPage(1);
  }, [id]);

  const companyName = useMemo(() => "Saraf", []);

  const receiptLabels = useMemo<ReceiptLabels>(
    () => ({
      depositTitle: t.desk.depositTitle,
      withdrawTitle: t.desk.withdrawTitle,
      customer: t.common.customer,
      reference: t.common.reference,
      relatedTransaction: t.common.relatedTransaction,
      date: t.common.date,
      currency: t.common.currency,
      amount: t.common.amount,
      balance: t.common.balance,
      status: t.common.status,
    }),
    [t],
  );

  const heldBalances = useMemo(
    () =>
      balances.filter((b) => {
        const n = Number.parseFloat(String(b.balanceDisplay).replace(/,/g, ""));
        return Number.isFinite(n) && n > 0;
      }),
    [balances],
  );

  const moneyCurrencyOptions = useMemo(() => {
    if (moneyMode === "take") {
      return heldBalances.map((b) => ({
        code: b.currencyCode,
        label: `${b.currencyCode} (${b.balanceDisplay})`,
      }));
    }
    return currencies.map((c) => ({ code: c.code, label: c.code }));
  }, [moneyMode, heldBalances, currencies]);

  function openMoney(mode: MoneyMode) {
    setMoneyError(null);
    if (mode === "take") {
      if (heldBalances.length === 0) {
        setError(t.desk.noFundsWithdraw);
        return;
      }
      setCurrencyCode(heldBalances[0]?.currencyCode ?? "");
    } else {
      setCurrencyCode((prev) => prev || currencies[0]?.code || "");
    }
    setMoneyMode(mode);
  }

  function openTransfer() {
    setTransferError(null);
    if (heldBalances.length === 0) {
      setError(t.desk.noFundsTransfer);
      return;
    }
    setTransferCurrency(heldBalances[0]?.currencyCode ?? "");
    setShowTransfer(true);
  }

  async function onArchive() {
    if (!customer) return;
    if (!window.confirm(`${t.customers.archiveCustomer} “${customer.fullName}”?`)) return;
    try {
      await archiveCustomer(customer.id);
      await load();
      setSuccessMessage(t.common.success);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function onRestore() {
    if (!customer) return;
    try {
      await restoreCustomer(customer.id);
      await load();
      setSuccessMessage(t.common.success);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function openLedgerDetail(txId: string) {
    setDetailBusy(true);
    setDetailError(null);
    try {
      const row = await getTransactionDetail(txId);
      setDetail(row);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : String(err));
      setDetail(null);
    } finally {
      setDetailBusy(false);
    }
  }

  function resetMoneyForm(keepOpen: boolean) {
    setAmount("");
    setDescription("");
    setMoneyNotes("");
    setReference("");
    setPaymentMethod("Cash");
    setValueDate(todayIso());
    setValueTime(nowTime());
    setMoneyError(null);
    if (!keepOpen) setMoneyMode(null);
  }

  function resetTransferForm() {
    setTransferReceiverId("");
    setTransferAmount("");
    setTransferDescription("");
    setTransferError(null);
    setShowTransfer(false);
  }

  async function submitMoney(action: "save" | "print" | "new") {
    if (!session || !customer || !moneyMode) return;
    if (!cashWalletId) {
      setMoneyError(t.desk.selectCashWallet);
      return;
    }
    setSaving(true);
    setMoneyError(null);
    setError(null);
    try {
      const payload = {
        customerId: customer.id,
        currencyCode,
        amount: amount.trim(),
        valueDate: `${valueDate} ${valueTime}:00`,
        description: description.trim() || undefined,
        notes: moneyNotes.trim() || undefined,
        reference: reference.trim() || undefined,
        paymentMethod,
        cashWalletId,
        createdById: session.userId,
      };
      const result =
        moneyMode === "add"
          ? await customerAddMoney(payload)
          : await customerTakeMoney(payload);
      setLastResult(result);
      const msg =
        moneyMode === "add"
          ? `${t.transactions.deposit}: ${result.currencyCode} ${result.amount}`
          : `${t.transactions.withdrawal}: ${result.currencyCode} ${result.amount}`;
      await load();
      if (action === "print") printReceipt(result, companyName, receiptLabels);
      if (action === "new") {
        resetMoneyForm(true);
        setSuccessMessage(msg);
      } else {
        resetMoneyForm(false);
        setSuccessMessage(msg);
      }
    } catch (err) {
      setMoneyError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function submitTransfer() {
    if (!session || !customer) return;
    if (!transferReceiverId) {
      setTransferError(t.desk.selectReceivingCustomer);
      return;
    }
    if (!transferAmount.trim()) {
      setTransferError(t.desk.enterAmount);
      return;
    }
    const amountText = transferAmount.trim();
    const currency = transferCurrency;
    const receiverId = transferReceiverId;
    const receiverName =
      otherCustomers.find((c) => c.id === receiverId)?.fullName ?? t.common.customer;
    setSaving(true);
    setTransferError(null);
    try {
      const posted = await transferFunds({
        reference: `TR-${Date.now()}`,
        senderCustomerId: customer.id,
        receiverCustomerId: receiverId,
        currencyCode: currency,
        amount: amountText,
        valueDate: todayIso(),
        description: transferDescription.trim() || undefined,
        createdById: session.userId,
      });
      resetTransferForm();
      setSuccessMessage(
        `${t.reports.transfer}: ${amountText} ${currency} → ${receiverName} (${posted.reference}).`,
      );
      await load();
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (!id) {
    return (
      <div className="stack">
        <Link to="/customers">← Customers</Link>
      </div>
    );
  }

  return (
    <div className="stack">
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div>
          <Link className="nav-link" to="/customers" style={{ padding: 0 }}>
            ← {t.nav.customers}
          </Link>
          <h1 style={{ margin: "0.35rem 0 0.25rem" }}>
            {customer?.fullName ?? t.common.customer}
          </h1>
          <p className="muted" style={{ margin: 0 }}>
            {customer?.code
              ? t.customers.customerId.replace("{code}", customer.code)
              : t.customers.noCode}
            {customer?.phone ? ` · ${customer.phone}` : ""}
            {customer?.isArchived ? ` · ${t.common.archived}` : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
          {customer?.isArchived ? (
            <button type="button" className="btn primary" onClick={() => void onRestore()}>
              {t.common.restore}
            </button>
          ) : (
            <>
              <button type="button" className="btn" onClick={() => setShowEdit(true)}>
                {t.customers.edit}
              </button>
              <button type="button" className="btn" onClick={() => void onArchive()}>
                {t.common.archive}
              </button>
            </>
          )}
          <button type="button" className="btn" onClick={() => navigate("/customers")}>
            {t.common.back}
          </button>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {busy && !customer ? <p className="muted">{t.common.loading}</p> : null}

      <div className="nav-row">
        {(
          [
            ["overview", t.common.view, <IconCash key="o" />],
            ["history", t.common.ledgerEntries, <IconHistory key="h" />],
          ] as Array<[Tab, string, ReactNode]>
        ).map(([key, label, icon]) => (
          <button
            key={key}
            type="button"
            className={tab === key ? "nav-link active" : "nav-link"}
            onClick={() => setTab(key)}
          >
            <span className="nav-link-icon">{icon}</span>
            <span className="nav-link-label">{label}</span>
          </button>
        ))}
      </div>

      {tab === "overview" && customer ? (
        <div className="stack">
          <div className="card stack">
            <div
              className="row"
              style={{ justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}
            >
              <div>
                <h2 style={{ margin: 0 }}>{t.customers.currentBalances}</h2>
                <p className="muted" style={{ margin: "0.25rem 0 0" }}>
                  {t.customers.currentBalancesHint}
                </p>
              </div>
              {!customer.isArchived ? (
                <div className="row" style={{ gap: "0.45rem", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => openMoney("add")}
                  >
                    {t.transactions.deposit}
                  </button>
                  <button type="button" className="btn" onClick={() => openMoney("take")}>
                    {t.transactions.withdrawal}
                  </button>
                  <button type="button" className="btn" onClick={openTransfer}>
                    {t.reports.transfer}
                  </button>
                </div>
              ) : null}
            </div>
            {balances.length === 0 ? (
              <p className="muted">{t.common.noData}</p>
            ) : (
              <div className="cash-card-grid">
                {balances.map((b) => (
                  <article key={b.currencyCode} className="cash-balance-card">
                    <div className="cash-balance-card-top">
                      <div className="cash-balance-code-wrap">
                        <span className="cash-balance-code">{b.currencyCode}</span>
                        {b.currencySymbol ? (
                          <span className="cash-balance-symbol">{b.currencySymbol}</span>
                        ) : null}
                      </div>
                    </div>
                    <div className="cash-balance-amount">{b.balanceDisplay}</div>
                  </article>
                ))}
              </div>
            )}
          </div>
          <div className="row" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
            <button type="button" className="btn" onClick={() => setTab("history")}>
              {t.customers.viewLedger}
            </button>
            {lastResult ? (
              <button
                type="button"
                className="btn secondary"
                onClick={() => printReceipt(lastResult, companyName, receiptLabels)}
              >
                {t.customers.reprintLastReceipt}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === "history" ? (
        <div className="card stack">
          <h2 style={{ margin: 0 }}>{t.common.ledgerEntries}</h2>
          <p className="muted" style={{ margin: 0 }}>
            {t.customers.ledgerHistoryHint.replace("{count}", String(historyTotal))}
          </p>
          {history.length === 0 ? (
            <p className="muted">{t.common.noEntries}</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>{t.common.date}</th>
                  <th>{t.common.description}</th>
                  <th>{t.common.amount}</th>
                  <th>{t.desk.direction}</th>
                  <th>{t.common.reference}</th>
                  <th>{t.common.status}</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr
                    key={row.id}
                    className="customer-row-clickable"
                    onClick={() => void openLedgerDetail(row.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        void openLedgerDetail(row.id);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={t.customers.openDetailsFor.replace("{reference}", row.reference)}
                  >
                    <td>{row.valueDate}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{row.activity}</div>
                      {row.description ? (
                        <div className="muted" style={{ fontSize: "0.85rem" }}>
                          {row.description}
                        </div>
                      ) : null}
                    </td>
                    <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                      {row.amountSummary}
                    </td>
                    <td>{flowBadge(row.flow, t)}</td>
                    <td>{row.reference}</td>
                    <td>{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Pagination
            page={historyPage}
            pageSize={historyPageSize}
            total={historyTotal}
            busy={busy}
            onPageChange={setHistoryPage}
            label={t.customers.ledgerRecords.replace("{count}", String(historyTotal))}
          />
          {detailBusy ? <p className="muted">{t.common.loading}</p> : null}
          {detailError ? <p className="error">{detailError}</p> : null}
        </div>
      ) : null}

      {detail ? (
        <Modal
          title={t.customers.ledgerTitle.replace("{reference}", detail.reference)}
          size="lg"
          onClose={() => setDetail(null)}
        >
          <div className="stack">
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
                <div>{detail.status}</div>
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
              <table>
                <thead>
                  <tr>
                    <th>{t.common.wallet}</th>
                    <th>{t.common.currency}</th>
                    <th>{t.desk.direction}</th>
                    <th>{t.common.amount}</th>
                    <th>{t.common.description}</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.lines.map((line) => (
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
                        {line.direction === "DEBIT" ? (
                          <span className="badge badge-ok">{t.common.debit} (+)</span>
                        ) : (
                          <span className="badge">{t.common.credit} (−)</span>
                        )}
                      </td>
                      <td style={{ fontWeight: 600 }}>{line.amount}</td>
                      <td>{line.memo ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn" onClick={() => setDetail(null)}>
                {t.common.close}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {showEdit && customer ? (
        <Modal
          title={t.customers.editCustomerTitle.replace("{name}", customer.fullName)}
          size="lg"
          onClose={() => setShowEdit(false)}
        >
          <CustomerEditForm
            customer={customer}
            onCancel={() => setShowEdit(false)}
            onSaved={async (updated) => {
              setShowEdit(false);
              setSuccessMessage(t.customers.customerUpdated.replace("{name}", updated.fullName));
              await load();
            }}
          />
        </Modal>
      ) : null}

      {moneyMode && customer && !customer.isArchived ? (
        <Modal
          title={moneyMode === "add" ? t.desk.depositTitle : t.desk.withdrawTitle}
          size="md"
          onClose={() => resetMoneyForm(false)}
        >
          <p className="muted" style={{ margin: 0 }}>
            {moneyMode === "add" ? t.dashboard.depositHint : t.dashboard.withdrawalHint}
          </p>
          {moneyError ? <p className="error">{moneyError}</p> : null}
          <label>
            {t.common.customer}
            <input value={customer.fullName} disabled />
          </label>
          <label>
            {t.desk.cashierVault} *
            <select
              value={cashWalletId}
              required
              onChange={(e) => setCashWalletId(e.target.value)}
            >
              {cashWallets.length === 0 ? (
                <option value="">{t.common.noData}</option>
              ) : (
                cashWallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.type})
                  </option>
                ))
              )}
            </select>
          </label>
          <label>
            {t.common.currency}
            <select value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value)}>
              {moneyCurrencyOptions.length === 0 ? (
                <option value="">{t.common.noData}</option>
              ) : (
                moneyCurrencyOptions.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))
              )}
            </select>
          </label>
          <label>
            {t.common.amount}
            <input
              value={amount}
              required
              placeholder={t.common.amountPlaceholder}
              onChange={(e) => {
                setAmount(e.target.value);
                setMoneyError(null);
              }}
            />
          </label>
          <div className="row" style={{ gap: "0.5rem" }}>
            <label style={{ flex: 1 }}>
              {t.common.date}
              <input
                type="date"
                value={valueDate}
                onChange={(e) => setValueDate(e.target.value)}
              />
            </label>
            <label style={{ flex: 1 }}>
              {t.common.time}
              <input
                type="time"
                value={valueTime}
                onChange={(e) => setValueTime(e.target.value)}
              />
            </label>
          </div>
          <label>
            {t.common.description}
            <input value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <label>
            {t.common.notes}
            <input value={moneyNotes} onChange={(e) => setMoneyNotes(e.target.value)} />
          </label>
          <label>
            {t.common.referenceNumber}
            <input
              value={reference}
              placeholder={t.customers.autoIfEmpty}
              onChange={(e) => setReference(e.target.value)}
            />
          </label>
          {moneyMode === "add" ? (
            <label>
              {t.common.paymentMethod}
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                <option value="Cash">{t.desk.settlementCash}</option>
                <option value="Bank">{t.common.bank}</option>
                <option value="Other">{t.desk.other}</option>
              </select>
            </label>
          ) : null}
          <div className="modal-actions">
            <button
              type="button"
              className="btn primary"
              disabled={
                saving ||
                !amount.trim() ||
                (moneyMode === "take" && (!currencyCode || moneyCurrencyOptions.length === 0))
              }
              onClick={() => void submitMoney("save")}
            >
              {saving ? t.common.saving : t.common.save}
            </button>
            <button
              type="button"
              className="btn"
              disabled={
                saving ||
                !amount.trim() ||
                (moneyMode === "take" && (!currencyCode || moneyCurrencyOptions.length === 0))
              }
              onClick={() => void submitMoney("print")}
            >
              {`${t.common.save} & ${t.common.print}`}
            </button>
            <button
              type="button"
              className="btn secondary"
              disabled={
                saving ||
                !amount.trim() ||
                (moneyMode === "take" && (!currencyCode || moneyCurrencyOptions.length === 0))
              }
              onClick={() => void submitMoney("new")}
            >
              {`${t.common.save} & ${t.common.create}`}
            </button>
          </div>
        </Modal>
      ) : null}

      {showTransfer && customer && !customer.isArchived ? (
        <Modal title={t.desk.transferTitle} size="md" onClose={resetTransferForm}>
          <p className="muted" style={{ margin: 0 }}>
            {t.dashboard.transferHint}
          </p>
          {transferError ? <p className="error">{transferError}</p> : null}
          <label>
            {t.common.from}
            <input value={customer.fullName} disabled />
          </label>
          <label>
            {t.transfers.receiverCustomer} *
            <select
              value={transferReceiverId}
              required
              onChange={(e) => setTransferReceiverId(e.target.value)}
            >
              <option value="">{t.reports.selectCustomer}…</option>
              {otherCustomers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName}
                  {c.code ? ` (${c.code})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t.common.currency}
            <select
              value={transferCurrency}
              onChange={(e) => setTransferCurrency(e.target.value)}
            >
              {heldBalances.length === 0 ? (
                <option value="">{t.common.noData}</option>
              ) : (
                heldBalances.map((b) => (
                  <option key={b.currencyCode} value={b.currencyCode}>
                    {b.currencyCode} ({b.balanceDisplay})
                  </option>
                ))
              )}
            </select>
          </label>
          <label>
            {t.common.amount} *
            <input
              value={transferAmount}
              required
              placeholder={t.common.amountPlaceholder}
              onChange={(e) => setTransferAmount(e.target.value)}
            />
          </label>
          <label>
            {t.common.description}
            <input
              value={transferDescription}
              onChange={(e) => setTransferDescription(e.target.value)}
            />
          </label>
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={resetTransferForm} disabled={saving}>
              {t.common.cancel}
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={saving || !transferAmount.trim() || !transferReceiverId}
              onClick={() => void submitTransfer()}
            >
              {saving ? t.common.posting : t.reports.transfer}
            </button>
          </div>
        </Modal>
      ) : null}

      {successMessage ? (
        <SuccessModal
          title={t.common.success}
          message={successMessage}
          onClose={() => setSuccessMessage(null)}
        />
      ) : null}
    </div>
  );
}
