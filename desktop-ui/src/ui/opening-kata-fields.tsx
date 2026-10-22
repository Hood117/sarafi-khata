import { type ReactNode } from "react";

import type { CurrencyListItem } from "@desktop/api";
import { useT } from "@desktop/i18n";
import { todayIso } from "@desktop/lib/datetime";
import { CurrencyPicker } from "@desktop/ui/currency-picker";

export type OpeningLine = {
  transactionId?: string;
  currencyCode: string;
  amount: string;
  direction: "GIVE" | "TAKE";
  description: string;
  notes: string;
  valueDate: string;
};

export function emptyOpeningLine(
  defaultCurrency: string,
  description = "Opening customer balance",
): OpeningLine {
  return {
    currencyCode: defaultCurrency || "AFN",
    amount: "",
    direction: "GIVE",
    description,
    notes: "",
    valueDate: todayIso(),
  };
}

export function OpeningKataFields({
  currencies,
  lines,
  onChange,
  onAdd,
  onRemove,
  helper,
  giveLabel,
  takeLabel,
  onCurrenciesChange,
  allowAdd = true,
  showLineNotes = true,
}: {
  currencies: CurrencyListItem[];
  lines: OpeningLine[];
  onChange: (index: number, patch: Partial<OpeningLine>) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  helper?: ReactNode;
  giveLabel?: string;
  takeLabel?: string;
  onCurrenciesChange?: (items: CurrencyListItem[]) => void;
  /** When false, hide “Add currency” (single-line journal edit). */
  allowAdd?: boolean;
  /** When false, hide the line notes field. Description still covers the memo. */
  showLineNotes?: boolean;
}) {
  const t = useT();
  const helperText =
    typeof helper === "string" ? helper.trim() : helper != null ? helper : null;
  return (
    <div className="opening-kata-fields">
      <div className="opening-kata-fields-head">
        <strong>{t.openingKata.title}</strong>
        {helperText ? <p className="muted opening-kata-fields-helper">{helperText}</p> : null}
      </div>
      {lines.map((line, index) => (
        <div key={index} className="customer-opening-block">
          <div className="customer-form-grid">
            <div className="money-ccy-row customer-form-span">
              <label className="money-ccy-amount">
                {t.openingKata.amount}
                <input
                  className="deposit-amount-input"
                  value={line.amount}
                  placeholder="0.00"
                  inputMode="decimal"
                  onChange={(e) => onChange(index, { amount: e.target.value })}
                />
              </label>
              <CurrencyPicker
                label={t.openingKata.currency}
                currencies={currencies}
                value={line.currencyCode}
                onChange={(code) => onChange(index, { currencyCode: code })}
                onCurrenciesChange={onCurrenciesChange}
                emptyLabel={t.common.noData}
                searchPlaceholder={t.common.search}
              />
            </div>
            <label>
              {t.openingKata.direction}
              <select
                value={line.direction}
                onChange={(e) =>
                  onChange(index, { direction: e.target.value as OpeningLine["direction"] })
                }
              >
                <option value="GIVE">{giveLabel ?? t.openingKata.customerGives}</option>
                <option value="TAKE">{takeLabel ?? t.openingKata.customerTakes}</option>
              </select>
            </label>
            <label>
              {t.openingKata.date}
              <input
                type="date"
                value={line.valueDate}
                onChange={(e) => onChange(index, { valueDate: e.target.value })}
              />
            </label>
            <label className="customer-form-span">
              {t.openingKata.description}
              <input
                value={line.description}
                onChange={(e) => onChange(index, { description: e.target.value })}
              />
            </label>
            {showLineNotes ? (
              <label className="customer-form-span">
                {t.openingKata.notes}
                <input
                  value={line.notes}
                  onChange={(e) => onChange(index, { notes: e.target.value })}
                />
              </label>
            ) : null}
          </div>
          {lines.length > 1 ? (
            <button type="button" className="secondary" onClick={() => onRemove(index)}>
              {t.openingKata.removeCurrency}
            </button>
          ) : null}
        </div>
      ))}
      {allowAdd ? (
        <button type="button" className="secondary" onClick={onAdd}>
          {t.openingKata.addCurrency}
        </button>
      ) : null}
    </div>
  );
}
