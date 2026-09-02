import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import {
  createCurrency,
  listCurrenciesPage,
  updateCurrency,
  type CurrencyListItem,
} from "@desktop/api";
import { useLocale, useT } from "@desktop/i18n";
import {
  currencyDisplaySymbol,
  currencySearchHaystack,
  formatCurrencyLabel,
  localizedCurrencyName,
} from "@desktop/lib/currency-labels";
import { handleDeskCurrencyEnter } from "@desktop/lib/form-keyboard";
import { WORLD_CURRENCIES, type WorldCurrency } from "@desktop/lib/world-currencies";
import { CurrencyFlag } from "@desktop/ui/currency-flag";

type Props = {
  label: string;
  currencies: CurrencyListItem[];
  value: string;
  onChange: (code: string) => void;
  emptyLabel: string;
  searchPlaceholder?: string;
  required?: boolean;
  /** Hide the field label (useful inside amount/currency pairs). */
  hideLabel?: boolean;
  className?: string;
  /**
   * Allow adding world currencies / activating inactive ones from the dropdown
   * (same catalog as Settings → Currencies). Default true.
   */
  allowManage?: boolean;
  /** Called after a currency is created or activated so parents can refresh lists. */
  onCurrenciesChange?: (items: CurrencyListItem[]) => void;
  /** Open the suggestions menu above the field (useful near the bottom of the viewport). */
  menuPlacement?: "bottom" | "top";
};

type Row =
  | { kind: "active"; item: CurrencyListItem }
  | { kind: "inactive"; item: CurrencyListItem }
  | { kind: "world"; item: WorldCurrency };

function mergeByCode(
  ...lists: Array<CurrencyListItem[] | undefined>
): CurrencyListItem[] {
  const map = new Map<string, CurrencyListItem>();
  for (const list of lists) {
    for (const item of list ?? []) {
      map.set(item.code.toUpperCase(), item);
    }
  }
  return [...map.values()];
}

/** Searchable currency combobox — type to filter; add/activate missing currencies. */
export function CurrencyPicker({
  label,
  currencies,
  value,
  onChange,
  emptyLabel,
  searchPlaceholder = "Search…",
  required,
  hideLabel = false,
  className,
  allowManage = true,
  onCurrenciesChange,
  menuPlacement = "bottom",
}: Props) {
  const { locale } = useLocale();
  const t = useT();
  const wrapRef = useRef<HTMLLabelElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [catalog, setCatalog] = useState<CurrencyListItem[]>([]);
  const [manageBusy, setManageBusy] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);

  const known = useMemo(
    () => mergeByCode(currencies, catalog),
    [currencies, catalog],
  );

  const selected = useMemo(
    () => known.find((c) => c.code === value) ?? null,
    [known, value],
  );

  const rows = useMemo((): Row[] => {
    const q = query.trim().toLowerCase();
    const active = currencies.filter((c) => c.isActive !== false);
    const activeFiltered = !q
      ? active
      : active.filter((c) => currencySearchHaystack(c, locale).includes(q));

    const rank = (code: string) => {
      const u = code.trim().toUpperCase();
      if (u === "AF" || u === "AFN") return 0;
      return 1;
    };
    const sortCodes = <T extends { code: string }>(list: T[]) =>
      [...list].sort((a, b) => {
        const d = rank(a.code) - rank(b.code);
        return d !== 0 ? d : a.code.localeCompare(b.code);
      });

    const allRow = activeFiltered.find((c) => c.code === "ALL");
    const withoutAll = activeFiltered.filter((c) => c.code !== "ALL");
    const out: Row[] = [
      ...(allRow ? [{ kind: "active" as const, item: allRow }] : []),
      ...sortCodes(withoutAll).map((item) => ({
        kind: "active" as const,
        item,
      })),
    ];

    if (!allowManage) return out;

    const activeCodes = new Set(active.map((c) => c.code.toUpperCase()));
    const inactive = catalog.filter(
      (c) => !c.isActive && !activeCodes.has(c.code.toUpperCase()),
    );
    const inactiveFiltered = !q
      ? inactive
      : inactive.filter((c) => currencySearchHaystack(c, locale).includes(q));
    for (const item of sortCodes(inactiveFiltered)) {
      out.push({ kind: "inactive", item });
    }

    const systemCodes = new Set(known.map((c) => c.code.toUpperCase()));
    const worldFiltered = WORLD_CURRENCIES.filter((w) => {
      if (systemCodes.has(w.code.toUpperCase())) return false;
      if (!q) return false; // only suggest world adds when searching
      const hay = `${w.code} ${w.name} ${w.symbol}`.toLowerCase();
      return hay.includes(q);
    }).slice(0, 12);
    for (const item of sortCodes(worldFiltered)) {
      out.push({ kind: "world", item });
    }
    return out;
  }, [allowManage, catalog, currencies, known, locale, query]);

  useEffect(() => {
    if (!open || !allowManage) return;
    let cancelled = false;
    void listCurrenciesPage({ activeOnly: false, pageSize: 500 })
      .then((page) => {
        if (!cancelled) setCatalog(page.items);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, allowManage]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
        setManageError(null);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const idx = rows.findIndex(
      (r) =>
        (r.kind === "active" || r.kind === "inactive") &&
        r.item.code === value,
    );
    setHighlight(idx >= 0 ? idx : 0);
  }, [query, open, rows, value]);

  function notifyActive(nextKnown: CurrencyListItem[]) {
    const active = nextKnown.filter((c) => c.isActive);
    onCurrenciesChange?.(active.length ? active : nextKnown);
  }

  function pick(c: CurrencyListItem) {
    onChange(c.code);
    setQuery("");
    setOpen(false);
    setManageError(null);
  }

  async function activateInactive(item: CurrencyListItem) {
    if (manageBusy) return;
    setManageBusy(true);
    setManageError(null);
    try {
      const updated = await updateCurrency({
        id: item.id,
        name: item.name,
        symbol: item.symbol,
        decimalPlaces: item.decimalPlaces,
        isActive: true,
      });
      const next = mergeByCode(currencies, catalog, [updated]);
      setCatalog(next);
      notifyActive(next);
      pick(updated);
    } catch (err: unknown) {
      setManageError(err instanceof Error ? err.message : String(err));
    } finally {
      setManageBusy(false);
    }
  }

  async function addWorld(item: WorldCurrency) {
    if (manageBusy) return;
    setManageBusy(true);
    setManageError(null);
    try {
      const created = await createCurrency({
        code: item.code,
        name: item.name,
        symbol: item.symbol || null,
        decimalPlaces: item.decimalPlaces,
        isActive: true,
      });
      const next = mergeByCode(currencies, catalog, [created]);
      setCatalog(next);
      notifyActive(next);
      pick(created);
    } catch (err: unknown) {
      setManageError(err instanceof Error ? err.message : String(err));
    } finally {
      setManageBusy(false);
    }
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setQuery("");
        return;
      }
      if (rows.length === 0) return;
      setHighlight((i) => (i + 1) % rows.length);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open || rows.length === 0) return;
      setHighlight((i) => (i <= 0 ? rows.length - 1 : i - 1));
      return;
    }
    if (
      handleDeskCurrencyEnter(e, {
        open,
        pickHighlighted: () => {
          const row = rows[highlight] ?? (rows.length === 1 ? rows[0] : null);
          if (!row) return false;
          if (row.kind === "active") {
            pick(row.item);
            return true;
          }
          if (row.kind === "inactive") {
            void activateInactive(row.item);
            return true;
          }
          void addWorld(row.item);
          return true;
        },
        onCloseEmpty: () => {
          setOpen(false);
          setQuery("");
        },
      })
    ) {
      return;
    }
    if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        setQuery("");
        setManageError(null);
      }
    }
  }

  const display = open
    ? query
    : selected?.code === "ALL"
      ? selected.name
      : selected?.code ?? value;
  const selectedMeta = selected
    ? formatCurrencyLabel(selected, locale)
    : "";

  return (
    <label
      ref={wrapRef}
      className={["currency-picker-wrap", className].filter(Boolean).join(" ")}
    >
      {hideLabel ? (
        <span className="visually-hidden">{required ? `${label} *` : label}</span>
      ) : (
        <>{required ? `${label} *` : label}</>
      )}
      <div className="currency-picker-field">
        {!open && value && value !== "ALL" ? <CurrencyFlag code={value} /> : null}
        <input
          className="currency-picker-input"
          value={display}
          placeholder={selected?.code || searchPlaceholder}
          title={selectedMeta || undefined}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls="currency-picker-list"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      {open ? (
        <ul
          id="currency-picker-list"
          className={
            menuPlacement === "top"
              ? "currency-suggest is-open-up"
              : "currency-suggest"
          }
          role="listbox"
        >
          {rows.length === 0 ? (
            <li className="customer-suggest-empty muted">
              {allowManage && query.trim()
                ? emptyLabel
                : emptyLabel}
            </li>
          ) : null}
          {rows.map((row, idx) => {
            if (row.kind === "active") {
              const c = row.item;
              const name = localizedCurrencyName(c.code, locale, c.name);
              const sym = currencyDisplaySymbol(c.code, c.symbol);
              return (
                <li
                  key={`a-${c.id}`}
                  role="option"
                  aria-selected={idx === highlight || c.code === value}
                >
                  <button
                    type="button"
                    tabIndex={-1}
                    className={`customer-suggest-item${
                      idx === highlight || c.code === value ? " is-active" : ""
                    }`}
                    onMouseEnter={() => setHighlight(idx)}
                    onClick={() => pick(c)}
                  >
                  <span className="customer-suggest-name currency-suggest-name">
                    {c.code !== "ALL" ? <CurrencyFlag code={c.code} /> : null}
                    <span>
                      {c.code === "ALL" ? c.name : c.code}
                      {c.code !== "ALL" && sym ? ` ${sym}` : ""}
                    </span>
                  </span>
                  <span className="customer-suggest-meta muted">
                    {c.code === "ALL" ? "" : name}
                  </span>
                  </button>
                </li>
              );
            }
            if (row.kind === "inactive") {
              const c = row.item;
              const name = localizedCurrencyName(c.code, locale, c.name);
              return (
                <li key={`i-${c.id}`} role="option" aria-selected={idx === highlight}>
                  <button
                    type="button"
                    tabIndex={-1}
                    className={`customer-suggest-item currency-suggest-manage${
                      idx === highlight ? " is-active" : ""
                    }`}
                    disabled={manageBusy}
                    onMouseEnter={() => setHighlight(idx)}
                    onClick={() => void activateInactive(c)}
                  >
                    <span className="customer-suggest-name currency-suggest-name">
                      <CurrencyFlag code={c.code} />
                      <span>{c.code}</span>
                    </span>
                    <span className="customer-suggest-meta">
                      <span className="muted">{name}</span>
                      <span className="currency-suggest-action">{t.common.activate}</span>
                    </span>
                  </button>
                </li>
              );
            }
            const w = row.item;
            return (
              <li key={`w-${w.code}`} role="option" aria-selected={idx === highlight}>
                <button
                  type="button"
                  tabIndex={-1}
                  className={`customer-suggest-item currency-suggest-manage${
                    idx === highlight ? " is-active" : ""
                  }`}
                  disabled={manageBusy}
                  onMouseEnter={() => setHighlight(idx)}
                  onClick={() => void addWorld(w)}
                >
                  <span className="customer-suggest-name currency-suggest-name">
                    <CurrencyFlag code={w.code} />
                    <span>{w.code}</span>
                  </span>
                  <span className="customer-suggest-meta">
                    <span className="muted">{w.name}</span>
                    <span className="currency-suggest-action">
                      {t.currencies.addToSystem}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
          {manageError ? (
            <li className="customer-suggest-empty" style={{ color: "var(--danger, #b42318)" }}>
              {manageError}
            </li>
          ) : null}
          {allowManage && !query.trim() && rows.every((r) => r.kind === "active") ? (
            <li className="customer-suggest-empty muted" style={{ fontSize: "0.8rem" }}>
              {t.currencies.searchWorld}
            </li>
          ) : null}
        </ul>
      ) : null}
    </label>
  );
}
