import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  archiveTrade,
  getTrade,
  listCurrenciesPage,
  listCustomersPage,
  listPartners,
  listWalletsPage,
  tradeBuy,
  tradeSell,
  updateTrade,
  type CurrencyListItem,
  type CustomerListItem,
  type PartnerListItem,
  type TradeDetail,
  type WalletListItem,
} from "@desktop/api";
import { useAuth } from "@desktop/auth";
import { useT } from "@desktop/i18n";
import { COUNTERPARTIES, CP_LABELS } from "./constants";

export function TradingTradeEditPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const t = useT();
  const [trade, setTrade] = useState<TradeDetail | null>(null);
  const [currencies, setCurrencies] = useState<CurrencyListItem[]>([]);
  const [wallets, setWallets] = useState<WalletListItem[]>([]);
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [partners, setPartners] = useState<PartnerListItem[]>([]);
  const [invCcy, setInvCcy] = useState("");
  const [payCcy, setPayCcy] = useState("");
  const [qty, setQty] = useState("");
  const [rate, setRate] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [cashWalletId, setCashWalletId] = useState("");
  const [cpType, setCpType] = useState<(typeof COUNTERPARTIES)[number]>("PARTNER");
  const [customerId, setCustomerId] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [cpName, setCpName] = useState("");
  const [notes, setNotes] = useState("");
  const [valueDate, setValueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      listCurrenciesPage({ activeOnly: true, pageSize: 100 }),
      listWalletsPage({ activeOnly: true, pageSize: 100 }),
      listCustomersPage({ archiveFilter: "active", pageSize: 100 }),
      listPartners(),
    ])
      .then(([ccy, w, cust, parts]) => {
        setCurrencies(ccy.items);
        setWallets(w.items.filter((x) => x.type === "VAULT" || x.type === "TILL"));
        setCustomers(cust.items);
        setPartners(parts);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
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
        setCashWalletId(t.cashWalletId);
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
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
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
      payCcy !== trade.paymentCurrencyCode ||
      cashWalletId !== trade.cashWalletId
    );
  }, [trade, qty, rate, paymentAmount, invCcy, payCcy, cashWalletId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!trade || !session) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      if (financialChanged) {
        if (
          !window.confirm(
            t.desk.replaceTradeConfirm,
          )
        ) {
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
          cashWalletId,
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
        setOk(t.desk.replacedWith.replace("{reference}", posted.reference));
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
      setOk(t.common.saved);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onArchive() {
    if (!trade) return;
    if (
      !window.confirm(
        t.desk.archiveTradeConfirm.replace("{reference}", trade.reference),
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await archiveTrade(trade.id);
      navigate("/trading/history");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  if (!id) {
    return <Link to="/trading/history">{t.common.back}</Link>;
  }

  return (
    <div className="card stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h2 className="section-title" style={{ margin: 0 }}>
            {t.desk.editTrade.replace("{reference}", trade?.reference ?? "")}
          </h2>
          <p className="muted" style={{ margin: 0 }}>
            {t.desk.editTradeHint.replace("{direction}", trade?.direction ?? "…")}
          </p>
        </div>
        <Link className="button-link secondary" to="/trading/history">
          {t.common.back}
        </Link>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {ok ? <p className="ok">{ok}</p> : null}
      {busy && !trade ? <p className="muted">{t.common.loading}</p> : null}

      {trade ? (
        <form className="stack" onSubmit={(e) => void onSubmit(e)}>
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
              <input value={qty} onChange={(e) => setQty(e.target.value)} required />
            </label>
            <label>
              {t.desk.rate}
              <input value={rate} onChange={(e) => setRate(e.target.value)} required />
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
              <input
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
              />
            </label>
            <label>
              {t.common.cashWallet}
              <select
                value={cashWalletId}
                onChange={(e) => setCashWalletId(e.target.value)}
                required
              >
                {wallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.type})
                  </option>
                ))}
              </select>
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
    </div>
  );
}
