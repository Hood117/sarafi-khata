import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";

import {
  listCustomersPage,
  listTransactionsPage,
  type CustomerListItem,
  type TransactionListItem,
} from "@desktop/api";
import { useT } from "@desktop/i18n";
import { transactionTypeLabel } from "@desktop/lib/i18n-labels";
import { registerOverlayClose } from "@desktop/lib/overlay-stack";
import { txDisplayRef } from "@desktop/lib/tx-ref";
import { useOverlayMotion } from "@desktop/lib/use-overlay-motion";

type ResultKind = "customer" | "account" | "transaction";

type SearchHit = {
  key: string;
  kind: ResultKind;
  title: string;
  subtitle: string;
  customerId?: string;
  transactionId?: string;
};

function formatWhen(value: string | null | undefined): string {
  if (!value) return "";
  return value.length >= 16 ? value.slice(0, 16).replace("T", " ") : value.slice(0, 10);
}

export function GlobalSearchOverlay({
  onClose,
  onOpenTransaction,
}: {
  onClose: () => void;
  onOpenTransaction: (transactionId: string) => void;
}) {
  const t = useT();
  const navigate = useNavigate();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { backdropRef, panelRef, requestClose } = useOverlayMotion(onClose);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [transactions, setTransactions] = useState<TransactionListItem[]>([]);
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query.trim()), 200);
    return () => window.clearTimeout(id);
  }, [query]);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  useEffect(() => {
    if (!debounced) {
      setCustomers([]);
      setTransactions([]);
      setBusy(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setBusy(true);
    void Promise.all([
      listCustomersPage({
        search: debounced,
        archiveFilter: "active",
        page: 1,
        pageSize: 8,
      }),
      listTransactionsPage({
        search: debounced,
        page: 1,
        pageSize: 8,
      }),
    ])
      .then(([custPage, txPage]) => {
        if (cancelled) return;
        setCustomers(custPage.items);
        setTransactions(txPage.items);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setCustomers([]);
        setTransactions([]);
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debounced]);

  const hits = useMemo(() => {
    const out: SearchHit[] = [];

    for (const c of customers) {
      out.push({
        key: `customer:${c.id}`,
        kind: "customer",
        title: c.fullName,
        subtitle: [c.phone, c.code || null].filter(Boolean).join(" · "),
        customerId: c.id,
      });
    }

    for (const c of customers) {
      const code = (c.code ?? "").trim();
      if (!code) continue;
      out.push({
        key: `account:${c.id}`,
        kind: "account",
        title: code,
        subtitle: c.fullName,
        customerId: c.id,
      });
    }

    for (const tx of transactions) {
      out.push({
        key: `tx:${tx.id}`,
        kind: "transaction",
        title: txDisplayRef(tx),
        subtitle: [
          transactionTypeLabel(t, tx.type),
          tx.customerName,
          tx.amountSummary,
          formatWhen(tx.valueDate || tx.createdAt),
        ]
          .filter(Boolean)
          .join(" · "),
        transactionId: tx.id,
      });
    }

    return out;
  }, [customers, transactions, t]);

  useEffect(() => {
    setHighlight(0);
  }, [hits]);

  const openHit = useCallback(
    (hit: SearchHit) => {
      if (hit.kind === "customer" || hit.kind === "account") {
        if (!hit.customerId) return;
        onClose();
        navigate(`/customers/${hit.customerId}`);
        return;
      }
      if (hit.kind === "transaction" && hit.transactionId) {
        const id = hit.transactionId;
        onClose();
        onOpenTransaction(id);
      }
    },
    [navigate, onClose, onOpenTransaction],
  );

  useEffect(() => registerOverlayClose(requestClose), [requestClose]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowDown") {
        if (hits.length === 0) return;
        event.preventDefault();
        setHighlight((i) => (i + 1) % hits.length);
        return;
      }
      if (event.key === "ArrowUp") {
        if (hits.length === 0) return;
        event.preventDefault();
        setHighlight((i) => (i - 1 + hits.length) % hits.length);
        return;
      }
      if (event.key === "Enter") {
        const hit = hits[highlight];
        if (!hit) return;
        event.preventDefault();
        openHit(hit);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hits, highlight, openHit]);

  function onInputKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter") {
      e.preventDefault();
    }
  }

  const grouped = useMemo(() => {
    return {
      customer: hits.filter((h) => h.kind === "customer"),
      account: hits.filter((h) => h.kind === "account"),
      transaction: hits.filter((h) => h.kind === "transaction"),
    };
  }, [hits]);

  function kindLabel(kind: ResultKind): string {
    if (kind === "customer") return t.globalSearch.customers;
    if (kind === "account") return t.globalSearch.accounts;
    return t.globalSearch.transactions;
  }

  let flatIndex = -1;

  return createPortal(
    <div
      ref={backdropRef}
      className="global-search-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        ref={panelRef}
        className="global-search-panel card"
        role="dialog"
        aria-modal="true"
        aria-label={t.globalSearch.title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="global-search-header">
          <input
            ref={inputRef}
            type="search"
            className="global-search-input"
            value={query}
            placeholder={t.globalSearch.placeholder}
            aria-controls={listId}
            aria-autocomplete="list"
            autoComplete="off"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
          />
          <button type="button" className="btn secondary" onClick={requestClose}>
            {t.common.close}
          </button>
        </div>
        <p className="muted global-search-hint">{t.globalSearch.hint}</p>

        <div id={listId} className="global-search-results" role="listbox">
          {error ? <p className="error">{error}</p> : null}
          {!debounced ? (
            <p className="muted global-search-empty">{t.globalSearch.noQuery}</p>
          ) : null}
          {debounced && busy ? (
            <p className="muted global-search-empty">{t.common.loading}</p>
          ) : null}
          {debounced && !busy && hits.length === 0 && !error ? (
            <p className="muted global-search-empty">{t.globalSearch.empty}</p>
          ) : null}

          {(["customer", "account", "transaction"] as const).map((kind) => {
            const items = grouped[kind];
            if (items.length === 0) return null;
            return (
              <div key={kind} className="global-search-group">
                <div className="global-search-group-label">{kindLabel(kind)}</div>
                {items.map((hit) => {
                  flatIndex += 1;
                  const index = flatIndex;
                  const active = index === highlight;
                  return (
                    <button
                      key={hit.key}
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={`global-search-item${active ? " is-active" : ""}`}
                      onMouseEnter={() => setHighlight(index)}
                      onClick={() => openHit(hit)}
                    >
                      <span className="global-search-item-title">
                        {hit.kind === "account" ? (
                          <strong className="customer-list-code">{hit.title}</strong>
                        ) : (
                          hit.title
                        )}
                      </span>
                      {hit.subtitle ? (
                        <span className="global-search-item-meta muted">{hit.subtitle}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
