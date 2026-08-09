import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import {
  exchangeFunds,
  getExchangePnLSummary,
  listCurrenciesPage,
  listCustomersPage,
  listLatestExchangeRates,
  listWalletsPage,
  type CurrencyListItem,
  type CustomerListItem,
  type ExchangePnLSummary,
  type WalletListItem,
} from "@desktop/api";
import { useAuth } from "@desktop/auth";
import { useT } from "@desktop/i18n";
import { todayIso } from "@desktop/lib/datetime";

function parseNum(raw: string): number | null {
  const n = Number(String(raw).replace(/,/g, "").trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatAmount(n: number, places = 4): string {
  if (!Number.isFinite(n)) return "";
  const fixed = n.toFixed(Math.min(Math.max(places, 0), 8));
  return fixed.replace(/\.?0+$/, "") || "0";
}

/**
 * Rate is always quoted as: 1 highCurrency = rate lowCurrency.
 * High → low: multiply. Low → high: divide.
 */
function convertWithRate(
  amount: number,
  fromCode: string,
  toCode: string,
  highCode: string,
  rate: number,
): number | null {
  if (fromCode === toCode || rate <= 0) return null;
  const fromIsHigh = fromCode === highCode;
  const toIsHigh = toCode === highCode;
  if (!fromIsHigh && !toIsHigh) return null;
  if (fromIsHigh && !toIsHigh) return amount * rate;
  if (!fromIsHigh && toIsHigh) return amount / rate;
  return null;
}

function previewPnL(input: {
  fromCode: string;
  toCode: string;
  fromAmount: number;
  toAmount: number;
  highCode: string;
  dealRate: number;
  boardRate: number;
}): { side: string; lowCode: string; profit: number } | null {
  const { fromCode, toCode, fromAmount, toAmount, highCode, dealRate, boardRate } =
    input;
  if (highCode !== fromCode && highCode !== toCode) return null;
  const lowCode = highCode === fromCode ? toCode : fromCode;
  const shopBuysHigh = fromCode === highCode;
  const highAmount = shopBuysHigh ? fromAmount : toAmount;
  const profit = shopBuysHigh
    ? highAmount * (boardRate - dealRate)
    : highAmount * (dealRate - boardRate);
  return {
    side: shopBuysHigh ? "BUY_HIGH" : "SELL_HIGH",
    lowCode,
    profit,
  };
}

export function ExchangePage() {
  const { session } = useAuth();
  const t = useT();
  const [mode, setMode] = useState<"walkin" | "customer">("walkin");
  const [currencies, setCurrencies] = useState<CurrencyListItem[]>([]);
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [cashWallets, setCashWallets] = useState<WalletListItem[]>([]);
  const [customerWallets, setCustomerWallets] = useState<WalletListItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pnlSummary, setPnlSummary] = useState<ExchangePnLSummary | null>(null);

  const [reference, setReference] = useState(`FX-${Date.now()}`);
  const [fromWalletId, setFromWalletId] = useState("");
  const [toWalletId, setToWalletId] = useState("");
  const [fromCurrency, setFromCurrency] = useState("");
  const [toCurrency, setToCurrency] = useState("");
  const [amount, setAmount] = useState("");
  const [toAmount, setToAmount] = useState("");
  const [rate, setRate] = useState("");
  const [boardRate, setBoardRate] = useState("");
  const [highCurrency, setHighCurrency] = useState("");
  const [lastEdited, setLastEdited] = useState<"amount" | "toAmount" | "rate">(
    "amount",
  );
  const [customerId, setCustomerId] = useState("");
  const [walkInName, setWalkInName] = useState("");
  const [description, setDescription] = useState("");

  const reloadPnL = useCallback(() => {
    void getExchangePnLSummary(todayIso())
      .then(setPnlSummary)
      .catch(() => setPnlSummary(null));
  }, []);

  useEffect(() => {
    void Promise.all([
      listCurrenciesPage({ activeOnly: true, pageSize: 100 }),
      listCustomersPage({ archiveFilter: "active", page: 1, pageSize: 100 }),
      listWalletsPage({ pageSize: 200, activeOnly: true }),
      listLatestExchangeRates().catch(() => []),
    ])
      .then(([ccy, cust, wallets, rates]) => {
        setCurrencies(ccy.items);
        setCustomers(cust.items);
        const cash = wallets.items.filter(
          (w) => w.type === "TILL" || w.type === "VAULT",
        );
        const cw = wallets.items.filter((w) => w.type === "CUSTOMER");
        setCashWallets(cash);
        setCustomerWallets(cw);
        const from = ccy.items[0]?.code ?? "";
        const to = ccy.items[1]?.code ?? ccy.items[0]?.code ?? "";
        setFromCurrency(from);
        setToCurrency(to);
        setHighCurrency(from);
        if (cash[0]) {
          setFromWalletId(cash[0].id);
          setToWalletId(cash[0].id);
        }
        if (cust.items[0]) setCustomerId(cust.items[0].id);

        const match = rates.find(
          (r) =>
            (r.baseCode === from && r.quoteCode === to) ||
            (r.baseCode === to && r.quoteCode === from),
        );
        if (match) {
          if (match.baseCode === from) {
            setHighCurrency(from);
            setRate(match.rate);
            setBoardRate(match.rate);
          } else {
            setHighCurrency(to);
            setRate(match.rate);
            setBoardRate(match.rate);
          }
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      });
    reloadPnL();
  }, [reloadPnL]);

  useEffect(() => {
    if (!fromCurrency || !toCurrency) return;
    if (highCurrency !== fromCurrency && highCurrency !== toCurrency) {
      setHighCurrency(fromCurrency);
    }
  }, [fromCurrency, toCurrency, highCurrency]);

  const _lowCurrency = useMemo(() => {
    if (!fromCurrency || !toCurrency || !highCurrency) return "";
    if (highCurrency === fromCurrency) return toCurrency;
    if (highCurrency === toCurrency) return fromCurrency;
    return "";
  }, [fromCurrency, toCurrency, highCurrency]);
  void _lowCurrency;

  useEffect(() => {
    const rateN = parseNum(rate);
    if (!rateN || !fromCurrency || !toCurrency || !highCurrency) return;
    if (fromCurrency === toCurrency) return;

    if (lastEdited === "amount" || lastEdited === "rate") {
      const fromN = parseNum(amount);
      if (fromN == null) return;
      const next = convertWithRate(
        fromN,
        fromCurrency,
        toCurrency,
        highCurrency,
        rateN,
      );
      if (next != null) {
        const formatted = formatAmount(next);
        setToAmount((prev) => (prev === formatted ? prev : formatted));
      }
    } else if (lastEdited === "toAmount") {
      const toN = parseNum(toAmount);
      if (toN == null) return;
      const next = convertWithRate(
        toN,
        toCurrency,
        fromCurrency,
        highCurrency,
        rateN,
      );
      if (next != null) {
        const formatted = formatAmount(next);
        setAmount((prev) => (prev === formatted ? prev : formatted));
      }
    }
  }, [
    amount,
    toAmount,
    rate,
    fromCurrency,
    toCurrency,
    highCurrency,
    lastEdited,
  ]);

  const livePnL = useMemo(() => {
    const fromN = parseNum(amount);
    const toN = parseNum(toAmount);
    const dealN = parseNum(rate);
    const boardN = parseNum(boardRate);
    if (
      fromN == null ||
      toN == null ||
      dealN == null ||
      boardN == null ||
      !fromCurrency ||
      !toCurrency ||
      !highCurrency
    ) {
      return null;
    }
    return previewPnL({
      fromCode: fromCurrency,
      toCode: toCurrency,
      fromAmount: fromN,
      toAmount: toN,
      highCode: highCurrency,
      dealRate: dealN,
      boardRate: boardN,
    });
  }, [amount, toAmount, rate, boardRate, fromCurrency, toCurrency, highCurrency]);

  const walletOptions =
    mode === "walkin" ? cashWallets : [...customerWallets, ...cashWallets];

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!session) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const result = await exchangeFunds({
        reference,
        fromWalletId,
        toWalletId,
        fromCurrencyCode: fromCurrency,
        toCurrencyCode: toCurrency,
        amount,
        toAmount,
        dealRate: rate || undefined,
        boardRate: boardRate || undefined,
        highCurrencyCode: highCurrency || undefined,
        customerId: mode === "customer" ? customerId : null,
        walkInName: mode === "walkin" ? walkInName || null : null,
        valueDate: todayIso(),
        description: description || undefined,
        createdById: session.userId,
      });
      const pnlText =
        result.boardRate != null
          ? result.isProfit
            ? ` · ${t.desk.profit} ${result.profitAmount} ${result.profitCurrencyCode}`
            : ` · ${t.desk.loss} ${result.profitAmount.replace(/^-/, "")} ${result.profitCurrencyCode}`
          : "";
      setOk(
        `Posted ${result.fromAmount} ${result.fromCurrencyCode} → ${result.toAmount} ${result.toCurrencyCode} @ deal ${result.dealRate}${pnlText}`,
      );
      setReference(`FX-${Date.now()}`);
      setAmount("");
      setToAmount("");
      reloadPnL();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function swapCurrencies() {
    setFromCurrency(toCurrency);
    setToCurrency(fromCurrency);
    setAmount(toAmount);
    setToAmount(amount);
    setLastEdited("amount");
  }

  return (
    <div className="stack exchange-page">
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <h1 style={{ margin: "0 0 0.2rem" }}>{t.pages.exchange}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {t.desk.exchangeHint}
          </p>
        </div>
        <div className="hawala-mode-toggle" role="group" aria-label={t.common.customer}>
          <button
            type="button"
            className={mode === "walkin" ? "hawala-mode active" : "hawala-mode"}
            onClick={() => setMode("walkin")}
          >
            {t.desk.walkIn}
          </button>
          <button
            type="button"
            className={mode === "customer" ? "hawala-mode active" : "hawala-mode"}
            onClick={() => setMode("customer")}
          >
            {t.common.customer}
          </button>
        </div>
      </div>

      {pnlSummary && pnlSummary.totalDeals > 0 ? (
        <div className="exchange-pnl-strip">
          <span>
            <strong>{pnlSummary.totalDeals}</strong> {t.desk.dealsToday}
          </span>
          {pnlSummary.byCurrency.map((row) => {
            const n = Number(row.profitAmount);
            const positive = !Number.isNaN(n) && n >= 0;
            return (
              <span key={row.currencyCode}>
                {positive ? t.desk.profit : t.desk.loss}{" "}
                <strong style={{ color: positive ? undefined : "#a61b1b" }}>
                  {row.profitAmount} {row.currencyCode}
                </strong>
              </span>
            );
          })}
        </div>
      ) : null}

      <form className="exchange-layout" onSubmit={(e) => void handleSubmit(e)}>
        <div className="section-card stack exchange-form">
          <div className="exchange-fields-grid">
            <label>
              {t.common.reference} *
              <input
                required
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </label>
            {mode === "customer" ? (
              <label>
                {t.common.customer} *
                <select
                  required
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label>
                {t.exchange.walkInName}
                <input
                  value={walkInName}
                  onChange={(e) => setWalkInName(e.target.value)}
                />
              </label>
            )}
          </div>

          <div className="exchange-block">
            <h2 className="exchange-block-title">{t.desk.currenciesAmounts}</h2>
            <div className="exchange-amount-row">
              <label>
                Give *
                <input
                  required
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setLastEdited("amount");
                  }}
                />
              </label>
              <label>
                From *
                <select
                  required
                  value={fromCurrency}
                  onChange={(e) => {
                    setFromCurrency(e.target.value);
                    setLastEdited("rate");
                  }}
                >
                  {currencies.map((c) => (
                    <option key={c.id} value={c.code}>
                      {c.code}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="secondary exchange-swap"
                onClick={swapCurrencies}
                title={t.desk.swapCurrencies}
              >
                ⇄
              </button>
              <label>
                Receive *
                <input
                  required
                  inputMode="decimal"
                  value={toAmount}
                  onChange={(e) => {
                    setToAmount(e.target.value);
                    setLastEdited("toAmount");
                  }}
                />
              </label>
              <label>
                To *
                <select
                  required
                  value={toCurrency}
                  onChange={(e) => {
                    setToCurrency(e.target.value);
                    setLastEdited("rate");
                  }}
                >
                  {currencies.map((c) => (
                    <option key={c.id} value={c.code}>
                      {c.code}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>
              {fromCurrency && highCurrency
                ? fromCurrency === highCurrency
                  ? `${t.desk.buyHigh} (${highCurrency})`
                  : `${t.desk.sellHigh} (${highCurrency})`
                : null}
            </p>
          </div>

          <div className="exchange-block">
            <h2 className="exchange-block-title">{t.desk.rates}</h2>
            <div className="exchange-fields-grid exchange-fields-3">
              <label>
                High currency *
                <select
                  required
                  value={highCurrency}
                  onChange={(e) => {
                    setHighCurrency(e.target.value);
                    setLastEdited("rate");
                  }}
                >
                  {[fromCurrency, toCurrency]
                    .filter(Boolean)
                    .filter((c, i, arr) => arr.indexOf(c) === i)
                    .map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Deal rate * (1 {highCurrency || "…"} = ?)
                <input
                  required
                  inputMode="decimal"
                  value={rate}
                  onChange={(e) => {
                    setRate(e.target.value);
                    setLastEdited("rate");
                  }}
                  placeholder={t.desk.customerRate}
                />
              </label>
              <label>
                Board rate (1 {highCurrency || "…"} = ?)
                <input
                  inputMode="decimal"
                  value={boardRate}
                  onChange={(e) => setBoardRate(e.target.value)}
                  placeholder={t.desk.marketCost}
                />
              </label>
            </div>
          </div>

          <div className="exchange-fields-grid">
            <label>
              From wallet *
              <select
                required
                value={fromWalletId}
                onChange={(e) => setFromWalletId(e.target.value)}
              >
                {walletOptions.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.type})
                  </option>
                ))}
              </select>
            </label>
            <label>
              To wallet *
              <select
                required
                value={toWalletId}
                onChange={(e) => setToWalletId(e.target.value)}
              >
                {walletOptions.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.type})
                  </option>
                ))}
              </select>
            </label>
            <label className="exchange-span-2">
              {t.common.description}
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
          </div>

          {error ? <p className="error">{error}</p> : null}
          {ok ? <p className="ok">{ok}</p> : null}
        </div>

        <aside className="section-card stack exchange-summary">
          <h2 style={{ margin: 0 }}>{t.desk.thisDeal}</h2>
          <div>
            <div className="muted">Give → Receive</div>
            <div style={{ fontWeight: 700, fontSize: "1.15rem" }}>
              {amount || "0"} {fromCurrency || "—"} → {toAmount || "0"}{" "}
              {toCurrency || "—"}
            </div>
          </div>
          <div>
            <div className="muted">{t.desk.dealBoard}</div>
            <div>
              {rate || "—"} / {boardRate || "—"}
            </div>
          </div>
          {livePnL ? (
            <div
              className="exchange-live-pnl"
              data-positive={livePnL.profit >= 0 ? "1" : "0"}
            >
              <div className="muted">
                {livePnL.profit >= 0 ? t.desk.estimatedProfit : t.desk.estimatedLoss}
              </div>
              <div className="exchange-live-pnl-value">
                {formatAmount(Math.abs(livePnL.profit))} {livePnL.lowCode}
              </div>
              <div className="muted" style={{ fontSize: "0.8rem" }}>
                {livePnL.side === "BUY_HIGH"
                  ? `${t.desk.buyHigh} (${highCurrency})`
                  : `${t.desk.sellHigh} (${highCurrency})`}
                {" · "}
                Spread{" "}
                {formatAmount(
                  Math.abs((parseNum(rate) ?? 0) - (parseNum(boardRate) ?? 0)),
                )}{" "}
                / 1 {highCurrency}
              </div>
            </div>
          ) : (
            <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
              Enter deal and board rates to preview P/L.
            </p>
          )}
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? t.common.posting : t.exchange.newExchange}
          </button>
        </aside>
      </form>

      {pnlSummary && pnlSummary.recent.length > 0 ? (
        <div className="section-card stack">
          <h2 style={{ margin: 0 }}>{t.desk.recentDealsToday}</h2>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>{t.common.reference}</th>
                  <th>{t.desk.side}</th>
                  <th>{t.desk.give}</th>
                  <th>{t.desk.receive}</th>
                  <th>{t.desk.deal}</th>
                  <th>{t.desk.board}</th>
                  <th>P/L</th>
                </tr>
              </thead>
              <tbody>
                {pnlSummary.recent.map((row) => {
                  const pnl = Number(row.profitAmount);
                  const positive = !Number.isNaN(pnl) && pnl >= 0;
                  return (
                    <tr key={row.reference}>
                      <td>{row.reference}</td>
                      <td>
                        {row.side === "BUY_HIGH" ? t.desk.buyHigh : t.desk.sellHigh}
                      </td>
                      <td>
                        {row.fromAmount} {row.fromCurrency}
                      </td>
                      <td>
                        {row.toAmount} {row.toCurrency}
                      </td>
                      <td>{row.dealRate}</td>
                      <td>{row.boardRate ?? "—"}</td>
                      <td
                        style={{
                          color: positive ? undefined : "#a61b1b",
                          fontWeight: 600,
                        }}
                      >
                        {row.profitAmount} {row.profitCurrency}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
