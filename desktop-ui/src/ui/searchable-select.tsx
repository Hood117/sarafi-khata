import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import { useT } from "@desktop/i18n";
import { advanceFromElement } from "@desktop/lib/form-keyboard";

export type SearchableSelectOption = {
  value: string;
  label: string;
  /** Extra text matched by search (codes, phones, etc.). */
  keywords?: string;
};

type Props = {
  label: string;
  value: string;
  options: SearchableSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  className?: string;
  /** Hide the field label. */
  hideLabel?: boolean;
  disabled?: boolean;
};

/**
 * Compact searchable dropdown for report filters (customers, partners, enums).
 */
export function SearchableSelect({
  label,
  value,
  options,
  onChange,
  placeholder,
  emptyLabel,
  className,
  hideLabel = false,
  disabled = false,
}: Props) {
  const t = useT();
  const wrapRef = useRef<HTMLLabelElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);

  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => {
      const hay = `${o.label} ${o.keywords ?? ""} ${o.value}`.toLowerCase();
      return hay.includes(q);
    });
  }, [options, query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setHighlight(0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    setHighlight(0);
  }, [query]);

  function pick(next: string) {
    if (disabled) return;
    onChange(next);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (disabled) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setHighlight((h) => Math.min(h + 1, Math.max(0, filtered.length - 1)));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      if (open) {
        const row = filtered[highlight];
        if (row?.value) {
          pick(row.value);
          return;
        }
        setOpen(false);
      }
      advanceFromElement(e.currentTarget);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

  const display = open ? query : selected?.label ?? "";

  return (
    <label
      ref={wrapRef}
      className={["stack customer-search-wrap", className].filter(Boolean).join(" ")}
    >
      {hideLabel ? null : <span>{label}</span>}
      <input
        value={display}
        placeholder={placeholder ?? t.common.search}
        autoComplete="off"
        aria-label={label}
        aria-expanded={open}
        aria-autocomplete="list"
        disabled={disabled}
        onChange={(e) => {
          if (disabled) return;
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (disabled) return;
          setOpen(true);
          setQuery("");
        }}
        onKeyDown={onKeyDown}
      />
      {open && !disabled ? (
        <ul className="customer-suggest" role="listbox">
          {filtered.length === 0 ? (
            <li className="customer-suggest-empty muted">
              {emptyLabel ?? t.common.noData}
            </li>
          ) : (
            filtered.map((o, idx) => (
              <li key={o.value} role="option" aria-selected={o.value === value}>
                <button
                  type="button"
                  tabIndex={-1}
                  className={`customer-suggest-item${idx === highlight ? " is-active" : ""}`}
                  onMouseEnter={() => setHighlight(idx)}
                  onClick={() => pick(o.value)}
                >
                  <span className="customer-suggest-name">{o.label}</span>
                  {o.keywords ? (
                    <span className="customer-suggest-meta muted">{o.keywords}</span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </label>
  );
}
