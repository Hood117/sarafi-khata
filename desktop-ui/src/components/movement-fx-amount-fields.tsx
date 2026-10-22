import type { RefObject } from "react";

import type { CurrencyListItem } from "@desktop/api";
import type { MovementRateBase } from "@desktop/lib/movement-fx";
import { currenciesDiffer } from "@desktop/lib/movement-fx";
import { AmountInput } from "@desktop/ui/amount-input";
import { CurrencyPicker } from "@desktop/ui/currency-picker";

type Labels = {
  leftAmount: string;
  rightAmount: string;
  /** Label for the editable post-rate result (when converting). */
  resultAmount?: string;
  rateDirectionOption: (base: string, quote: string) => string;
  rateOpLabel: string;
  exchangeRate: string;
  marketCost?: string;
  amountPlaceholder: string;
  currency: string;
  noData: string;
  search: string;
};

type Props = {
  currencies: CurrencyListItem[];
  leftAmount: string;
  leftCurrency: string;
  rightAmount: string;
  rightCurrency: string;
  rate: string;
  rateBase: MovementRateBase;
  boardRate?: string;
  amountRef?: RefObject<HTMLInputElement | null>;
  labels: Labels;
  onLeftAmount: (v: string) => void;
  onLeftCurrency: (code: string) => void;
  onRightAmount: (v: string) => void;
  onRightCurrency: (code: string) => void;
  onRate: (v: string) => void;
  onRateBase: (base: MovementRateBase) => void;
  onBoardRate?: (v: string) => void;
  onCurrenciesChange?: (items: CurrencyListItem[]) => void;
};

export function MovementFxAmountFields({
  currencies,
  leftAmount,
  leftCurrency,
  rightAmount,
  rightCurrency,
  rate,
  rateBase,
  boardRate = "",
  amountRef,
  labels,
  onLeftAmount,
  onLeftCurrency,
  onRightAmount,
  onRightCurrency,
  onRate,
  onRateBase,
  onBoardRate,
  onCurrenciesChange,
}: Props) {
  const converting = currenciesDiffer(leftCurrency, rightCurrency);
  const rateHint =
    rateBase === "left"
      ? labels.rateDirectionOption(leftCurrency || "—", rightCurrency || "—")
      : labels.rateDirectionOption(rightCurrency || "—", leftCurrency || "—");
  const resultLabel = labels.resultAmount ?? labels.rightAmount;

  return (
    <div className={`movement-fx${converting ? " is-converting" : ""}`}>
      {converting ? (
        <>
          <div className="movement-fx-pair">
            <div className="money-ccy-row">
              <label className="money-ccy-amount">
                {labels.leftAmount} *
                <AmountInput
                  ref={amountRef}
                  value={leftAmount}
                  placeholder={labels.amountPlaceholder}
                  onValueChange={onLeftAmount}
                />
              </label>
              <CurrencyPicker
                label={labels.currency}
                required
                currencies={currencies}
                value={leftCurrency}
                onChange={onLeftCurrency}
                onCurrenciesChange={onCurrenciesChange}
                emptyLabel={labels.noData}
                searchPlaceholder={labels.search}
              />
            </div>
            <div className="money-ccy-row">
              <label className="money-ccy-amount">
                {resultLabel} *
                <AmountInput
                  value={rightAmount}
                  placeholder={labels.amountPlaceholder}
                  onValueChange={onRightAmount}
                />
              </label>
              <CurrencyPicker
                label={labels.currency}
                required
                currencies={currencies}
                value={rightCurrency}
                onChange={onRightCurrency}
                onCurrenciesChange={onCurrenciesChange}
                emptyLabel={labels.noData}
                searchPlaceholder={labels.search}
              />
            </div>
          </div>

          <div className="fx-simple-rate-row hawala-fx-ops movement-fx-rate-compact">
            <div
              className="hawala-mode-toggle"
              role="group"
              aria-label={labels.rateOpLabel}
              data-desk-choice-group
            >
              <button
                type="button"
                className={rateBase === "left" ? "hawala-mode active" : "hawala-mode"}
                title={rateHint}
                aria-pressed={rateBase === "left"}
                onClick={() => onRateBase("left")}
              >
                ×
              </button>
              <button
                type="button"
                className={rateBase === "right" ? "hawala-mode active" : "hawala-mode"}
                title={rateHint}
                aria-pressed={rateBase === "right"}
                onClick={() => onRateBase("right")}
              >
                ÷
              </button>
            </div>
            <label>
              <span>{labels.exchangeRate}</span>
              <AmountInput
                value={rate}
                placeholder="0"
                onValueChange={onRate}
              />
            </label>
            {onBoardRate && labels.marketCost ? (
              <label>
                <span>{labels.marketCost}</span>
                <AmountInput
                  value={boardRate}
                  placeholder="0"
                  onValueChange={onBoardRate}
                />
              </label>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <div className="money-ccy-row">
            <label className="money-ccy-amount">
              {labels.leftAmount} *
              <AmountInput
                ref={amountRef}
                value={leftAmount}
                placeholder={labels.amountPlaceholder}
                onValueChange={onLeftAmount}
              />
            </label>
            <CurrencyPicker
              label={labels.currency}
              required
              currencies={currencies}
              value={leftCurrency}
              onChange={onLeftCurrency}
              onCurrenciesChange={onCurrenciesChange}
              emptyLabel={labels.noData}
              searchPlaceholder={labels.search}
            />
          </div>

          <div className="money-ccy-row">
            <label className="money-ccy-amount">
              {labels.rightAmount} *
              <AmountInput
                value={rightAmount}
                placeholder={labels.amountPlaceholder}
                onValueChange={onRightAmount}
              />
            </label>
            <CurrencyPicker
              label={labels.currency}
              required
              currencies={currencies}
              value={rightCurrency}
              onChange={onRightCurrency}
              onCurrenciesChange={onCurrenciesChange}
              emptyLabel={labels.noData}
              searchPlaceholder={labels.search}
            />
          </div>
        </>
      )}
    </div>
  );
}
