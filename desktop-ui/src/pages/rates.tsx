import { useCallback, useEffect, useMemo, useState } from "react";

import {
  getCachedMarketRates,
  getMarketRatesConfig,
  listCurrenciesPage,
  saveMarketRatesCache,
  type CurrencyListItem,
  type MarketRatesSnapshot,
} from "@desktop/api";
import { useT } from "@desktop/i18n";
import { useSuccessModal } from "@desktop/ui/use-success-modal";

/**
 * Rates screen only. Market internet fetch is opt-in (Refresh button) and never
 * runs from dashboard / exchange / other screens. HTTP runs in the WebView so
 * Rust never pulls rustls/ring (Windows MSVC build-script exit 259).
 */

function currencyMark(c: Pick<CurrencyListItem, "code" | "symbol"> | undefined, code: string) {
  const sym = c?.symbol?.trim();
  return sym || code;
}

function formatFxRate(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 100) return n.toFixed(2).replace(/\.?0+$/, "");
  if (n >= 1) return n.toFixed(4).replace(/\.?0+$/, "");
  return n.toFixed(6).replace(/\.?0+$/, "");
}

function parseRate(raw: string): number | null {
  const n = Number(String(raw).replace(/,/g, "").trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function RatesPage() {
  const t = useT();
  const { showSuccess, successModal } = useSuccessModal();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const [currencies, setCurrencies] = useState<CurrencyListItem[]>([]);
  const [market, setMarket] = useState<MarketRatesSnapshot | null>(null);
  const [marketBusy, setMarketBusy] = useState(false);
  const [marketMsg, setMarketMsg] = useState<string | null>(null);
  const [selectedCode, setSelectedCode] = useState<string>("");

  const currencyByCode = useMemo(() => {
    const map = new Map<string, CurrencyListItem>();
    for (const c of currencies) {
      map.set(c.code.toUpperCase(), c);
    }
    return map;
  }, [currencies]);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    void listCurrenciesPage({ activeOnly: true, pageSize: 200 })
      .then((currencyPage) => {
        if (cancelled) return;
        setCurrencies(currencyPage.items);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Cache-only load — no network.
  useEffect(() => {
    let cancelled = false;
    void getCachedMarketRates()
      .then((snap) => {
        if (!cancelled) setMarket(snap);
      })
      .catch(() => {
        // Ignore cache errors; market refresh can still load rates.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const marketCodes = useMemo(() => {
    if (!market?.rates.length) return [] as string[];
    const codes = new Set(market.rates.map((r) => r.code.toUpperCase()));
    codes.add(market.baseCode.toUpperCase());
    return [...codes].sort();
  }, [market]);

  useEffect(() => {
    if (!marketCodes.length) {
      setSelectedCode("");
      return;
    }
    setSelectedCode((prev) => {
      if (prev && marketCodes.includes(prev.toUpperCase())) return prev.toUpperCase();
      const prefer =
        marketCodes.find((c) => c === "USD") ??
        marketCodes.find((c) => c === market?.baseCode.toUpperCase()) ??
        marketCodes[0];
      return prefer ?? "";
    });
  }, [marketCodes, market?.baseCode]);

  /** Units of CODE per 1 API base. */
  const perBase = useMemo(() => {
    const map = new Map<string, number>();
    if (!market) return map;
    map.set(market.baseCode.toUpperCase(), 1);
    for (const row of market.rates) {
      const n = parseRate(row.rate);
      if (n != null) map.set(row.code.toUpperCase(), n);
    }
    return map;
  }, [market]);

  const selectedPairs = useMemo(() => {
    const from = selectedCode.toUpperCase();
    const fromPerBase = perBase.get(from);
    if (!from || fromPerBase == null) return [];

    return marketCodes
      .filter((code) => code !== from)
      .map((to) => {
        const toPerBase = perBase.get(to);
        if (toPerBase == null) return null;
        const rate = toPerBase / fromPerBase;
        return {
          to,
          rate,
          label: `1 ${currencyMark(currencyByCode.get(from), from)} = ${formatFxRate(rate)} ${currencyMark(currencyByCode.get(to), to)}`,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null);
  }, [selectedCode, perBase, marketCodes, currencyByCode]);

  const onRefreshMarket = useCallback(async () => {
    setMarketBusy(true);
    setMarketMsg(null);
    try {
      const config = await getMarketRatesConfig();
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 5000);
      let payload: unknown;
      try {
        const res = await fetch(config.fetchUrl, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        payload = await res.json();
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.name === "AbortError"
              ? "Request timed out"
              : err.message
            : String(err);
        const snap = await saveMarketRatesCache({
          baseCode: config.baseCode,
          payload: {},
          lastError: msg,
        });
        setMarket(snap);
        setMarketMsg(t.exchangeRates.marketOfflineHint);
        return;
      } finally {
        window.clearTimeout(timeout);
      }

      const snap = await saveMarketRatesCache({
        baseCode: config.baseCode,
        payload,
      });
      setMarket(snap);
      if (snap.refreshed) {
        showSuccess(t.exchangeRates.marketUpdated);
      } else if (snap.lastError) {
        setMarketMsg(t.exchangeRates.marketOfflineHint);
      }
    } catch (err: unknown) {
      setMarketMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setMarketBusy(false);
    }
  }, [t, showSuccess]);

  return (
    <div className="stack rates-page">
      <div className="card stack">
        <div
          className="row"
          style={{ justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem" }}
        >
          <h2 style={{ margin: 0 }}>{t.exchangeRates.marketRatesTitle}</h2>
          <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn primary"
              disabled={marketBusy}
              onClick={() => void onRefreshMarket()}
            >
              {marketBusy ? t.exchangeRates.refreshingMarket : t.exchangeRates.refreshMarket}
            </button>
          </div>
        </div>

        {error ? <p className="error">{error}</p> : null}
        {busy ? <p className="muted">{t.common.loading}</p> : null}

        {marketMsg ? (
          <p className={market?.lastError && !market.refreshed ? "error" : "muted"}>{marketMsg}</p>
        ) : null}
        {market?.lastError && !marketMsg ? <p className="error">{market.lastError}</p> : null}

        {market?.hasCache ? (
          <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
            {market.fetchedAt
              ? t.exchangeRates.marketFetchedAt.replace("{time}", market.fetchedAt.slice(0, 19))
              : ""}
            {market.providerTime
              ? `${market.fetchedAt ? " · " : ""}${t.exchangeRates.marketProviderTime.replace("{time}", market.providerTime)}`
              : ""}
          </p>
        ) : null}

        {!market?.hasCache && !marketBusy ? (
          <p className="muted">{t.exchangeRates.marketEmpty}</p>
        ) : null}

        {market && marketCodes.length > 0 ? (
          <>
            <label className="stack" style={{ gap: "0.35rem", maxWidth: "22rem" }}>
              <span>{t.exchangeRates.selectCurrency}</span>
              <select
                value={selectedCode}
                onChange={(e) => setSelectedCode(e.target.value)}
              >
                {marketCodes.map((code) => {
                  const c = currencyByCode.get(code);
                  const mark = currencyMark(c, code);
                  const name = c?.name;
                  return (
                    <option key={code} value={code}>
                      {name ? `${code} — ${name} (${mark})` : `${code} (${mark})`}
                    </option>
                  );
                })}
              </select>
            </label>

            <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
              {t.exchangeRates.marketAgainstHint.replace(
                "{currency}",
                currencyMark(currencyByCode.get(selectedCode), selectedCode || "—"),
              )}
            </p>

            {selectedPairs.length > 0 ? (
              <div style={{ overflowX: "auto" }}>
                <table>
                  <thead>
                    <tr>
                      <th>{t.exchangeRates.rate}</th>
                      <th>{t.exchangeRates.marketName}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedPairs.map((row) => (
                      <tr key={row.to}>
                        <td>
                          <strong>{row.label}</strong>
                        </td>
                        <td>{currencyByCode.get(row.to)?.name ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">{t.exchangeRates.marketNoPairs}</p>
            )}
          </>
        ) : null}

        <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>
          {t.exchangeRates.marketAttribution}
        </p>
      </div>
      {successModal}
    </div>
  );
}
