import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";

import {
  listCurrenciesPage,
  listCustomersPage,
  listPartners,
  tradeBuy,
  tradeSell,
  type CurrencyListItem,
  type CustomerListItem,
  type PartnerListItem,
} from "@desktop/api";
import { useAuth } from "@desktop/auth";
import { useT } from "@desktop/i18n";
import {
  endSubmit,
  errorMessage,
  tryBeginSubmit,
} from "@desktop/lib/datetime";
import {
  pickDefaultCurrency,
  pickSecondaryCurrency,
} from "@desktop/lib/default-currency";
import { handleDeskFormKeyDown } from "@desktop/lib/form-keyboard";
import { ModalErrorBanner } from "@desktop/ui/modal-error-banner";
import { useSuccessModal } from "@desktop/ui/use-success-modal";
import { COUNTERPARTIES, CP_LABELS } from "./constants";

type Mode = "buy" | "sell";

export function TradingTradeFormPage({ mode }: { mode: Mode }) {
  const { session } = useAuth();
  const t = useT();
  const { showSuccess, successModal } = useSuccessModal();
  const [currencies, setCurrencies] = useState<CurrencyListItem[]>([]);
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [partners, setPartners] = useState<PartnerListItem[]>([]);
  const [invCcy, setInvCcy] = useState("");
  const [payCcy, setPayCcy] = useState("");
  const [qty, setQty] = useState("");
  const [rate, setRate] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [cpType, setCpType] = useState<(typeof COUNTERPARTIES)[number]>("WALK_IN");
  const [customerId, setCustomerId] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [cpName, setCpName] = useState("");
  const [walkInPhone, setWalkInPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const submittingRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);

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
        if (ccy.items.length) {
          const inv = pickDefaultCurrency(ccy.items);
          setInvCcy(inv);
          setPayCcy(pickSecondaryCurrency(ccy.items, inv));
        }
      })
      .catch((err: unknown) => {
        setError(errorMessage(err, t.errors.loadGeneric));
      });
  }, []);

  const suggestedPayment = useMemo(() => {
    const q = Number(qty);
    const r = Number(rate);
    if (!Number.isFinite(q) || !Number.isFinite(r) || q <= 0 || r <= 0) return "";
    return (q * r).toFixed(4).replace(/\.?0+$/, "");
  }, [qty, rate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    if (!tryBeginSubmit(submittingRef)) return;
    setBusy(true);
    setError(null);
    const input = {
      inventoryCurrencyCode: invCcy,
      quantity: qty,
      rate,
      paymentCurrencyCode: payCcy,
      paymentAmount: paymentAmount || suggestedPayment || undefined,
      counterpartyType: cpType,
      customerId: cpType === "CUSTOMER" ? customerId : null,
      partnerSarafiId: cpType === "PARTNER" ? partnerId : null,
      counterpartyName:
        cpType === "CUSTOMER" || cpType === "PARTNER" ? null : cpName || null,
      walkInPhone: cpType === "WALK_IN" ? walkInPhone || null : null,
      notes: notes || null,
      createdById: session.userId,
    };
    try {
      const res = mode === "buy" ? await tradeBuy(input) : await tradeSell(input);
      showSuccess(
        `${t.desk.tradePosted.replace("{reference}", res.reference)} · ${t.desk.inventoryAfter.replace("{quantity}", res.inventoryQtyAfter)}${
          res.grossProfit
            ? ` · ${t.desk.profitLoss.replace("{amount}", res.grossProfit)}`
            : ""
        }`,
      );
      setQty("");
      setRate("");
      setPaymentAmount("");
      setNotes("");
      if (cpType === "WALK_IN") {
        setCpName("");
        setWalkInPhone("");
      }
    } catch (err: unknown) {
      setError(errorMessage(err, t.errors.tradingSave));
    } finally {
      endSubmit(submittingRef);
      setBusy(false);
    }
  }

  return (
    <div className="card stack page-column">
      <h2 className="section-title">
        {mode === "buy" ? t.desk.newPurchase : t.desk.newSale}
      </h2>
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
              placeholder={suggestedPayment || t.desk.automatic}
            />
          </label>
        </div>

        <fieldset className="stack" style={{ border: "none", padding: 0, margin: 0, gap: "0.65rem" }}>
          <legend style={{ fontWeight: 600, padding: 0 }}>{t.desk.party}</legend>
          <div className="nav-row" style={{ flexWrap: "wrap" }}>
            {(["WALK_IN", "CUSTOMER", "PARTNER"] as const).map((t) => (
              <button
                key={t}
                type="button"
                className={cpType === t ? "nav-link active" : "nav-link"}
                onClick={() => setCpType(t)}
              >
                {CP_LABELS[t]}
              </button>
            ))}
          </div>
          <label>
            {t.desk.otherPartyType}
            <select
              value={["WALK_IN", "CUSTOMER", "PARTNER"].includes(cpType) ? "" : cpType}
              onChange={(e) => {
                const v = e.target.value;
                if (v) setCpType(v as (typeof COUNTERPARTIES)[number]);
              }}
            >
              <option value="">{t.desk.chooseOther}</option>
              {(["BANK", "BUSINESS", "SUPPLIER", "OTHER"] as const).map((t) => (
                <option key={t} value={t}>
                  {CP_LABELS[t]}
                </option>
              ))}
            </select>
          </label>

          {cpType === "WALK_IN" ? (
            <div className="row" style={{ flexWrap: "wrap" }}>
              <label style={{ flex: 1, minWidth: 180 }}>
                {t.desk.walkInName} *
                <input
                  value={cpName}
                  onChange={(e) => setCpName(e.target.value)}
                  required
                  placeholder={t.common.customerName}
                />
              </label>
              <label style={{ flex: 1, minWidth: 140 }}>
                {t.common.phone}
                <input
                  value={walkInPhone}
                  onChange={(e) => setWalkInPhone(e.target.value)}
                  placeholder={t.common.optional}
                />
              </label>
            </div>
          ) : null}
          {cpType === "CUSTOMER" ? (
            <label>
            {t.common.customer} *
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
            <label>
              {t.desk.partnerSarafi} *
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
          {cpType !== "CUSTOMER" && cpType !== "PARTNER" && cpType !== "WALK_IN" ? (
            <label>
            {t.common.name}
              <input value={cpName} onChange={(e) => setCpName(e.target.value)} />
            </label>
          ) : null}
        </fieldset>

        <label>
          {t.common.notes}
          <input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <ModalErrorBanner message={error} />
        <button type="submit" disabled={busy}>
          {busy ? t.common.posting : mode === "buy" ? t.desk.tradingBuy : t.desk.tradingSell}
        </button>
      </form>
      {successModal}
    </div>
  );
}
