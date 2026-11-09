import { useEffect, useRef, useState } from "react";

import {
  customerAddMoney,
  customerTakeMoney,
  listCurrenciesPage,
  type CurrencyListItem,
  type CustomerBalanceRow,
} from "@desktop/api";
import { useAuth } from "@desktop/auth";
import { useLocale, useT } from "@desktop/i18n";
import { errorMessage, nowTime, todayIso } from "@desktop/lib/datetime";
import { pickDefaultCurrency } from "@desktop/lib/default-currency";
import {
  buildDepositDescription,
  buildWithdrawDescription,
} from "@desktop/lib/movement-description";
import { currenciesDiffer, formatFxAmount } from "@desktop/lib/movement-fx";
import { newInternalRef } from "@desktop/lib/tx-ref";
import { CurrencyFlag } from "@desktop/ui/currency-flag";

type Side = "debit" | "credit";

type Props = {
  customerId: string;
  customerName: string;
  balances: CustomerBalanceRow[];
  onSaved: () => void;
  onCancel: () => void;
};

function toNumber(value: string): number {
  return Number(value.replace(/,/g, ""));
}

export function InlineLedgerEntryRow({
  customerId,
  customerName,
  balances,
  onSaved,
  onCancel,
}: Props) {
  const t = useT();
  const { locale } = useLocale();
  const { session } = useAuth();
  const rowRef = useRef<HTMLTableRowElement>(null);
  const creditRef = useRef<HTMLInputElement>(null);

  const [currencies, setCurrencies] = useState<CurrencyListItem[]>([]);
  const [afnCode, setAfnCode] = useState("AFN");
  const [note, setNote] = useState("");
  const [side, setSide] = useState<Side>("credit");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("");
  const [rate, setRate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    rowRef.current?.scrollIntoView({ block: "nearest" });
    creditRef.current?.focus();
    listCurrenciesPage({ activeOnly: true, pageSize: 100 })
      .then((page) => {
        const code = pickDefaultCurrency(page.items);
        setCurrencies(page.items);
        setAfnCode(code);
        setCurrency(code);
      })
      .catch((err: unknown) => setError(errorMessage(err)));
  }, []);

  const foreign = currency !== "" && currenciesDiffer(currency, afnCode);
  const rateNum = toNumber(rate);
  const useRate = foreign && rateNum > 0;
  const afnAmount = useRate ? formatFxAmount(toNumber(amount) * rateNum) : "";

  function autoNote(nextSide: Side, nextAmount: string, nextCurrency: string, nextRate: string) {
    if (!(toNumber(nextAmount) > 0)) return "";
    const fxRate = currenciesDiffer(nextCurrency, afnCode) ? toNumber(nextRate) : 0;
    const ledgerCurrency = fxRate > 0 ? afnCode : nextCurrency;
    const opts = {
      customerName,
      amount: fxRate > 0 ? formatFxAmount(toNumber(nextAmount) * fxRate) : nextAmount,
      currency: ledgerCurrency,
      cashAmount: fxRate > 0 ? nextAmount : null,
      cashCurrency: fxRate > 0 ? nextCurrency : null,
      locale,
    };
    if (nextSide === "debit") return buildWithdrawDescription(t.desk, opts);
    const bal = balances.find((b) => b.currencyCode.toUpperCase() === ledgerCurrency.toUpperCase());
    return buildDepositDescription(t.desk, {
      ...opts,
      isDebtRepayment: bal ? toNumber(bal.balanceDisplay) < 0 : false,
    });
  }

  function typeAmount(nextSide: Side, value: string) {
    setSide(nextSide);
    setAmount(value);
    setNote(autoNote(nextSide, value, currency, rate));
    setError(null);
  }

  async function save() {
    if (!session || saving) return;
    if (!(toNumber(amount) > 0)) {
      setError(t.desk.enterAmount);
      return;
    }
    setSaving(true);
    setError(null);
    const input = {
      customerId,
      currencyCode: useRate ? afnCode : currency,
      amount: useRate ? afnAmount : amount.trim(),
      cashCurrencyCode: useRate ? currency : undefined,
      cashAmount: useRate ? amount.trim() : undefined,
      highCurrencyCode: useRate ? currency : undefined,
      valueDate: `${todayIso()} ${nowTime()}:00`,
      reference: newInternalRef(side === "credit" ? "DEP" : "WD"),
      description: note.trim() || undefined,
      paymentMethod: "Cash",
      createdById: session.userId,
    };
    try {
      if (side === "credit") await customerAddMoney(input);
      else await customerTakeMoney(input);
      onSaved();
    } catch (err: unknown) {
      setError(errorMessage(err, t.errors.genericTryAgain));
      setSaving(false);
    }
  }

  function amountCell(cellSide: Side) {
    const active = side === cellSide && amount !== "";
    const label = cellSide === "credit" ? t.common.credit : t.common.debit;
    return (
      <td className={`col-amount col-${cellSide}`}>
        <input
          ref={cellSide === "credit" ? creditRef : undefined}
          className={`ledger-draft-amount is-${cellSide}${active ? " is-active" : ""}`}
          inputMode="decimal"
          placeholder={label}
          aria-label={label}
          value={side === cellSide ? amount : ""}
          onChange={(e) => typeAmount(cellSide, e.target.value)}
        />
      </td>
    );
  }

  return (
    <>
      <tr
        ref={rowRef}
        className="ledger-draft-row"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void save();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
      >
        <td className="col-when muted">{todayIso()}</td>
        <td className="col-description">
          <input
            value={note}
            placeholder={t.customers.ledgerNotesPlaceholder}
            onChange={(e) => setNote(e.target.value)}
          />
        </td>
        {amountCell("credit")}
        {amountCell("debit")}
        <td className="col-currency">
          <span className="ledger-currency-cell">
            {currency ? <CurrencyFlag code={currency} size="sm" /> : null}
            <select
              aria-label={t.common.currency}
              value={currency}
              onChange={(e) => {
                setCurrency(e.target.value);
                setRate("");
                setNote(autoNote(side, amount, e.target.value, ""));
              }}
            >
              {currencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
            </select>
          </span>
          {foreign ? (
            <input
              className="ledger-draft-rate"
              inputMode="decimal"
              placeholder={t.customers.ledgerRateToAfn}
              title={t.customers.ledgerRateToAfn}
              value={rate}
              onChange={(e) => {
                setRate(e.target.value);
                setNote(autoNote(side, amount, currency, e.target.value));
              }}
            />
          ) : null}
          {afnAmount ? (
            <small className="ledger-draft-preview">
              = {afnAmount} {afnCode}
            </small>
          ) : null}
        </td>
        <td className="col-amount col-balance">
          <span className="ledger-draft-actions">
            <button
              type="button"
              className="ledger-draft-save"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? t.common.saving : t.common.save}
            </button>
            <button
              type="button"
              className="ledger-draft-cancel"
              disabled={saving}
              title={t.common.cancel}
              aria-label={t.common.cancel}
              onClick={onCancel}
            >
              ✕
            </button>
          </span>
        </td>
      </tr>
      {error ? (
        <tr className="ledger-draft-row">
          <td colSpan={6} className="ledger-draft-error">
            {error}
          </td>
        </tr>
      ) : null}
    </>
  );
}
