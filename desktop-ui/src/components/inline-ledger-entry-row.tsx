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
import { localizedCurrencyName } from "@desktop/lib/currency-labels";
import { errorMessage, nowTime, todayIso } from "@desktop/lib/datetime";
import { pickDefaultCurrency } from "@desktop/lib/default-currency";
import {
  buildDepositDescription,
  buildWithdrawDescription,
} from "@desktop/lib/movement-description";
import { currenciesDiffer, formatFxAmount } from "@desktop/lib/movement-fx";
import { newInternalRef } from "@desktop/lib/tx-ref";
import { normalizeAmountInput } from "@desktop/lib/western-digits";
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
  return Number(normalizeAmountInput(value));
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
  const savingRef = useRef(false);

  const [currencies, setCurrencies] = useState<CurrencyListItem[]>([]);
  const [shopDefaultCode, setShopDefaultCode] = useState("AFN");
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
        const active = page.items.filter((c) => c.isActive !== false);
        const code = pickDefaultCurrency(active);
        setCurrencies(active);
        setShopDefaultCode(code);
        setCurrency(code);
      })
      .catch((err: unknown) => setError(errorMessage(err)));
  }, []);

  const foreign =
    currency !== "" && currenciesDiffer(currency, shopDefaultCode);
  const rateNum = toNumber(rate);
  const converting = foreign && rate.trim() !== "" && rateNum > 0;
  const accountAmount = converting
    ? formatFxAmount(toNumber(amount) * rateNum)
    : "";

  function autoNote(
    nextSide: Side,
    nextAmount: string,
    nextCurrency: string,
    nextRate: string,
  ) {
    if (!(toNumber(nextAmount) > 0)) return "";
    const fxRate =
      currenciesDiffer(nextCurrency, shopDefaultCode) && nextRate.trim() !== ""
        ? toNumber(nextRate)
        : 0;
    const useFx = fxRate > 0;
    // Same as deposit/withdraw: account currency is selected currency unless FX rate converts to shop default.
    const ledgerCurrency = useFx ? shopDefaultCode : nextCurrency;
    const opts = {
      customerName,
      amount: useFx
        ? formatFxAmount(toNumber(nextAmount) * fxRate)
        : normalizeAmountInput(nextAmount),
      currency: ledgerCurrency,
      cashAmount: useFx ? normalizeAmountInput(nextAmount) : null,
      cashCurrency: useFx ? nextCurrency : null,
      locale,
    };
    if (nextSide === "debit") return buildWithdrawDescription(t.desk, opts);
    const bal = balances.find(
      (b) => b.currencyCode.toUpperCase() === ledgerCurrency.toUpperCase(),
    );
    return buildDepositDescription(t.desk, {
      ...opts,
      isDebtRepayment: bal ? toNumber(bal.balanceDisplay) < 0 : false,
    });
  }

  function typeAmount(nextSide: Side, value: string) {
    const cleaned = normalizeAmountInput(value);
    setSide(nextSide);
    setAmount(cleaned);
    setNote(autoNote(nextSide, cleaned, currency, rate));
    setError(null);
  }

  async function save() {
    if (!session || savingRef.current) return;
    const amountClean = normalizeAmountInput(amount);
    if (!(Number(amountClean) > 0)) {
      setError(t.desk.enterAmount);
      return;
    }
    if (!currency.trim()) {
      setError(t.common.currency);
      return;
    }

    const foreignNow = currenciesDiffer(currency, shopDefaultCode);
    const rateClean = normalizeAmountInput(rate);
    const rateN = Number(rateClean);
    // Optional FX: only when a positive rate is entered for a non-default currency.
    // Otherwise post the selected currency to the customer account (same as deposit/withdraw).
    if (foreignNow && rate.trim() !== "" && !(rateN > 0)) {
      setError(t.desk.rateRequired);
      return;
    }
    const useFx = foreignNow && rateN > 0;
    const accountAmt = useFx
      ? formatFxAmount(Number(amountClean) * rateN)
      : amountClean;
    if (!(Number(accountAmt) > 0)) {
      setError(t.desk.enterAmount);
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setError(null);
    const input = {
      customerId,
      currencyCode: useFx ? shopDefaultCode : currency.trim().toUpperCase(),
      amount: accountAmt,
      cashCurrencyCode: useFx ? currency.trim().toUpperCase() : undefined,
      cashAmount: useFx ? amountClean : undefined,
      highCurrencyCode: useFx ? currency.trim().toUpperCase() : undefined,
      boardRate: useFx ? rateClean : undefined,
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
      savingRef.current = false;
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
                const code = e.target.value;
                setCurrency(code);
                setRate("");
                setNote(autoNote(side, amount, code, ""));
                setError(null);
              }}
            >
              {currencies.map((c) => (
                <option key={c.id || c.code} value={c.code}>
                  {localizedCurrencyName(c.code, locale, c.name)}
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
                const cleaned = normalizeAmountInput(e.target.value);
                setRate(cleaned);
                setNote(autoNote(side, amount, currency, cleaned));
                setError(null);
              }}
            />
          ) : null}
          {converting && accountAmount ? (
            <small className="ledger-draft-preview">
              = {accountAmount}{" "}
              {localizedCurrencyName(shopDefaultCode, locale, shopDefaultCode)}
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
