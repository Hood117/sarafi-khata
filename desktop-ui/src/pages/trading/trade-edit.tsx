import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  archiveTrade,
  getTrade,
  listCurrenciesPage,
  listCustomersPage,
  listPartners,
  tradeBuy,
  tradeSell,
  updateTrade,
  type CurrencyListItem,
  type CustomerListItem,
  type PartnerListItem,
  type TradeDetail,
} from "@desktop/api";
import { useAuth } from "@desktop/auth";
import { useT } from "@desktop/i18n";
import {
  endSubmit,
  errorMessage,
  tryBeginSubmit,
} from "@desktop/lib/datetime";
import { notifyDeskDataChanged, notifyMovementSaved } from "@desktop/lib/desk-events";
import { handleDeskFormKeyDown } from "@desktop/lib/form-keyboard";
import { normalizeAmountInput } from "@desktop/lib/western-digits";
import { AmountInput } from "@desktop/ui/amount-input";
import { useConfirmDialog } from "@desktop/ui/confirm-dialog";
import { ModalErrorBanner } from "@desktop/ui/modal-error-banner";
import { useSuccessModal } from "@desktop/ui/use-success-modal";
import { COUNTERPARTIES, CP_LABELS } from "./constants";

export function TradingTradeEditPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const t = useT();
  const { confirm } = useConfirmDialog();
  const [trade, setTrade] = useState<TradeDetail | null>(null);
  const [currencies, setCurrencies] = useState<CurrencyListItem[]>([]);
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [partners, setPartners] = useState<PartnerListItem[]>([]);
  const [invCcy, setInvCcy] = useState("");
  const [payCcy, setPayCcy] = useState("");
  const [qty, setQty] = useState("");
  const [rate, setRate] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [cpType, setCpType] = useState<(typeof COUNTERPARTIES)[number]>("PARTNER");
  const [customerId, setCustomerId] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [cpName, setCpName] = useState("");
  const [notes, setNotes] = useState("");
  const [valueDate, setValueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const submittingRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const { showSuccess, successModal } = useSuccessModal();

  useEffect(() => {
    void Promise.all([
      listCurrenciesPage({ activeOnly: true, pageSize: 100 }),
      listCustomersPage({ archiveFilter: "active", pageSize: 100 }),
      listPartners(),
    ])
      .then(([ccy, cust, parts]) => {
        setCurrencies(ccy.items);
        setCustomers(cust.items);
        setPartners(parts);
      })
      .catch((err: unknown) => {
        setError(errorMessage(err, t.errors.loadGeneric));
      });
  }, []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setBusy(true);
    void getTrade(id)
      .then((t) => {
        if (cancelled) return;
        setTrade(t);
        setInvCcy(t.inventoryCurrencyCode);
        setPayCcy(t.paymentCurrencyCode);
        setQty(t.quantity);
        setRate(t.rate);
        setPaymentAmount(t.paymentAmount);
        setCpType(
          (COUNTERPARTIES as readonly string[]).includes(t.counterpartyType)
            ? (t.counterpartyType as (typeof COUNTERPARTIES)[number])
            : "OTHER",
        );
        setCustomerId(t.customerId ?? "");
        setPartnerId(t.partnerSarafiId ?? "");
        setCpName(t.counterpartyName ?? "");
        setNotes(t.notes ?? "");
        setValueDate(t.valueDate.slice(0, 10));
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err, t.errors.loadGeneric));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const financialChanged = useMemo(() => {
    if (!trade) return false;
    return (
      qty !== trade.quantity ||
      rate !== trade.rate ||
      paymentAmount !== trade.paymentAmount ||
      invCcy !== trade.inventoryCurrencyCode ||
      payCcy !== trade.paymentCurrencyCode
    );
  }, [trade, qty, rate, paymentAmount, invCcy, payCcy]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!trade || !session) return;
    if (!tryBeginSubmit(submittingRef)) return;
    setBusy(true);
    setError(null);
    try {
      if (financialChanged) {
        const ok = await confirm({
          title: t.common.confirm,
          message: t.desk.replaceTradeConfirm,
        });
        if (!ok) {
          endSubmit(submittingRef);
          setBusy(false);
          return;
        }
        await archiveTrade(trade.id);
        const input = {
          inventoryCurrencyCode: invCcy,
          quantity: qty,
          rate,
          paymentCurrencyCode: payCcy,
          paymentAmount: paymentAmount || undefined,
          counterpartyType: cpType,
          customerId: cpType === "CUSTOMER" ? customerId : null,
          partnerSarafiId: cpType === "PARTNER" ? partnerId : null,
          counterpartyName:
            cpType === "CUSTOMER" || cpType === "PARTNER" ? null : cpName || cpType,
          walkInPhone: null,
          notes: notes || null,
          valueDate: valueDate || undefined,
          createdById: session.userId,
        };
        const posted =
          trade.direction === "SELL" ? await tradeSell(input) : await tradeBuy(input);
        notifyMovementSaved();
        showSuccess(t.desk.replacedWith.replace("{reference}", posted.reference));
        navigate(`/trading/trades/${posted.id}`, { replace: true });
        return;
      }

      const updated = await updateTrade({
        id: trade.id,
        notes: notes || null,
        valueDate: valueDate || null,
        counterpartyType: cpType,
        customerId: cpType === "CUSTOMER" ? customerId : null,
        partnerSarafiId: cpType === "PARTNER" ? partnerId : null,
        counterpartyName:
          cpType === "CUSTOMER" || cpType === "PARTNER" ? null : cpName || cpType,
      });
      setTrade(updated);
      notifyDeskDataChanged();
      showSuccess(t.common.saved);
    } catch (err: unknown) {
      setError(errorMessage(err, t.errors.tradingSave));
    } finally {
      endSubmit(submittingRef);
      setBusy(false);
    }
  }

  async function onArchive() {
    if (!trade) return;
    const ok = await confirm({
      title: t.common.archive,
      message: t.desk.archiveTradeConfirm.replace("{reference}", trade.reference),
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await archiveTrade(trade.id);
      notifyDeskDataChanged();
      navigate("/trading/history");
    } catch (err: unknown) {
      setError(errorMessage(err, t.errors.tradingSave));
      setBusy(false);
    }
  }

  if (!id) {
    return <Link to="/trading/history">{t.common.back}</Link>;
  }

  return (
    <div className="card stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 className="section-title" style={{ margin: 0 }}>
          {t.desk.editTrade.replace("{reference}", trade?.reference ?? "")}
        </h2>
        <Link className="button-link secondary" to="/trading/history">
          {t.common.back}
        </Link>
      </div>

      {busy && !trade ? <p className="muted">{t.common.loading}</p> : null}

      {trade ? (
        <form
          ref={formRef}
          className="stack"
          data-desk-form
          onKeyDown={(e: ReactKeyboardEvent<HTMLFormElement>) =>
            handleDeskFormKeyDown(e, {
              busy,
              onSubmit: () => formRef.current?.requestSubmit(),
            })
          }
          onSubmit={(e) => void onSubmit(e)}
        >
          <div className="row">
            <label>
              {t.common.currency}
              <select value={invCcy} onChange={(e) => setInvCcy(e.target.value)} required>
                {currencies.map((c) => (
                  <option key={c.id} value={c.code}>
                    {c.code}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t.desk.quantity}
              <AmountInput
                value={qty}
                required
                onValueChange={(v) => setQty(normalizeAmountInput(v))}
              />
            </label>
            <label>
              {t.desk.rate}
              <AmountInput
                value={rate}
                required
                onValueChange={(v) => setRate(normalizeAmountInput(v))}
              />
            </label>
          </div>
          <div className="row">
            <label>
              {t.desk.paymentCurrency}
              <select value={payCcy} onChange={(e) => setPayCcy(e.target.value)} required>
                {currencies.map((c) => (
                  <option key={c.id} value={c.code}>
                    {c.code}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t.desk.paymentAmount}
              <AmountInput
                value={paymentAmount}
                onValueChange={(v) => setPaymentAmount(normalizeAmountInput(v))}
              />
            </label>
          </div>
          <div className="row" style={{ flexWrap: "wrap", alignItems: "end" }}>
            <label>
              {t.desk.party}
              <select
                value={cpType}
                onChange={(e) =>
                  setCpType(e.target.value as (typeof COUNTERPARTIES)[number])
                }
              >
                {COUNTERPARTIES.map((t) => (
                  <option key={t} value={t}>
                    {CP_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
            {cpType === "CUSTOMER" ? (
              <label style={{ flex: 1 }}>
                {t.common.customer}
                <select
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  required
                >
                  <option value="">{t.common.select}</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {cpType === "PARTNER" ? (
              <label style={{ flex: 1 }}>
                {t.desk.partnerSarafi}
                <select
                  value={partnerId}
                  onChange={(e) => setPartnerId(e.target.value)}
                  required
                >
                  <option value="">{t.common.select}</option>
                  {partners.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {cpType === "WALK_IN" ||
            (cpType !== "CUSTOMER" && cpType !== "PARTNER") ? (
              <label style={{ flex: 1 }}>
                {cpType === "WALK_IN" ? t.desk.walkInName : t.common.name}
                <input
                  value={cpName}
                  onChange={(e) => setCpName(e.target.value)}
                  required={cpType === "WALK_IN"}
                />
              </label>
            ) : null}
          </div>
          <div className="row">
            <label>
              {t.desk.valueDate}
              <input
                type="date"
                value={valueDate}
                onChange={(e) => setValueDate(e.target.value)}
              />
            </label>
            <label style={{ flex: 1 }}>
              {t.common.notes}
              <input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
          </div>
          <div className="row">
            <ModalErrorBanner message={error} />
          </div>
          <div className="row">
            <button type="submit" disabled={busy}>
              {busy ? t.common.saving : t.common.save}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => void onArchive()}
            >
              {t.common.archive}
            </button>
          </div>
        </form>
      ) : null}
      {successModal}
    </div>
  );
}
