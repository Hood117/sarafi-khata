import { type ReactNode } from "react";
import { todayIso } from "@desktop/lib/datetime";

export type OpeningLine = {
  currencyCode: string;
  amount: string;
  direction: "GIVE" | "TAKE";
  description: string;
  notes: string;
  valueDate: string;
};

export function emptyOpeningLine(defaultCurrency: string): OpeningLine {
  return {
    currencyCode: defaultCurrency,
    amount: "",
    direction: "GIVE",
    description: "Opening customer balance",
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
}: {
  currencies: Array<{ id: string; code: string }>;
  lines: OpeningLine[];
  onChange: (index: number, patch: Partial<OpeningLine>) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  helper: ReactNode;
}) {
  return (
    <div className="stack" style={{ gap: "0.75rem" }}>
      <div>
        <strong>Opening balance</strong>
        <p className="muted" style={{ margin: "0.25rem 0 0" }}>
          {helper}
        </p>
      </div>
      {lines.map((line, index) => (
        <div key={index} className="customer-opening-block stack">
          <div className="customer-form-grid">
            <label>
              Currency
              <select
                value={line.currencyCode}
                onChange={(e) => onChange(index, { currencyCode: e.target.value })}
              >
                {currencies.map((c) => (
                  <option key={c.id} value={c.code}>
                    {c.code}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Amount
              <input
                value={line.amount}
                placeholder="0.00"
                onChange={(e) => onChange(index, { amount: e.target.value })}
              />
            </label>
            <label>
              Direction
              <select
                value={line.direction}
                onChange={(e) =>
                  onChange(index, { direction: e.target.value as OpeningLine["direction"] })
                }
              >
                <option value="GIVE">Customer Gives Money</option>
                <option value="TAKE">Customer Takes Money</option>
              </select>
            </label>
            <label>
              Date
              <input
                type="date"
                value={line.valueDate}
                onChange={(e) => onChange(index, { valueDate: e.target.value })}
              />
            </label>
            <label className="customer-form-span">
              Description
              <input
                value={line.description}
                onChange={(e) => onChange(index, { description: e.target.value })}
              />
            </label>
            <label className="customer-form-span">
              Notes
              <input
                value={line.notes}
                onChange={(e) => onChange(index, { notes: e.target.value })}
              />
            </label>
          </div>
          {lines.length > 1 ? (
            <button type="button" className="secondary" onClick={() => onRemove(index)}>
              Remove currency
            </button>
          ) : null}
        </div>
      ))}
      <button type="button" className="secondary" onClick={onAdd}>
        Add Currency
      </button>
    </div>
  );
}
