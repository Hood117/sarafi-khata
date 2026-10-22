import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  getCustomer,
  getCustomerBalances,
  identifyFingerprint,
  listCustomerLedger,
  type CustomerBalanceRow,
  type CustomerDetail,
  type CustomerLedgerRow,
} from "@desktop/api";
import { useAuth } from "@desktop/auth";
import { LedgerAmount } from "@desktop/components/ledger-amount";
import { IconCustomers, IconOk } from "@desktop/icons";
import { useT } from "@desktop/i18n";
import { technicalErrorText } from "@desktop/lib/app-error";
import { moneyToneClass } from "@desktop/lib/currency-labels";
import {
  isFingerprintIdentifyPaused,
  pauseFingerprintIdentify,
  resumeFingerprintIdentify,
} from "@desktop/lib/fingerprint-identify-gate";
import {
  isUnmatchedFingerprint,
  notifyWrongFingerprint,
  playFingerprintSound,
} from "@desktop/lib/fingerprint-sounds";
import { amountPartsFromDebitCredit } from "@desktop/lib/format-transaction-line";
import { transactionTypeLabel } from "@desktop/lib/i18n-labels";
import { canAccessPath } from "@desktop/lib/permissions";
import { txDisplayRef } from "@desktop/lib/tx-ref";
import { Modal } from "@desktop/ui/modal";

const MATCH_COOLDOWN_MS = 2500;
/** After a placed finger that did not match — brief pause before listening again. */
const RETRY_MS = 700;
/** After idle timeout — tiny gap only; long gaps made finger feel 2–3s late. */
const IDLE_RETRY_MS = 300;
const BACKOFF_MS = 4000;
/** While enroll/verify holds the reader — poll pause flag gently. */
const PAUSED_POLL_MS = 300;
const BALANCE_CODES = ["AFN", "USD", "PKR", "EUR"] as const;

type MatchToast = {
  customer: CustomerDetail;
  matchScore: number | null;
  balances: CustomerBalanceRow[];
  recent: CustomerLedgerRow[];
};

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const id = window.setTimeout(() => resolve(), ms);
    const onAbort = () => {
      window.clearTimeout(id);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function present(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function balanceFor(
  rows: CustomerBalanceRow[],
  code: string,
): { display: string; toneSource: string } {
  const found = rows.find(
    (r) => r.currencyCode.trim().toUpperCase() === code,
  );
  if (found && present(found.balanceDisplay)) {
    return { display: found.balanceDisplay.trim(), toneSource: found.balanceDisplay };
  }
  return { display: "0", toneSource: "0" };
}

function debitCreditLabel(
  row: CustomerLedgerRow,
  debitLabel: string,
  creditLabel: string,
): string | null {
  if (present(row.debit)) return debitLabel;
  if (present(row.credit)) return creditLabel;
  return null;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="fp-identify-info-row">
      <span className="fp-identify-info-label">{label}</span>
      <span className="fp-identify-info-value">{value}</span>
    </div>
  );
}

/**
 * App-shell fingerprint identify loop. Runs while the desk is open and the
 * user can access customers. Reuses `identify_fingerprint` (owner thread).
 */
export function GlobalFingerprintListener() {
  const { session } = useAuth();
  const t = useT();
  const navigate = useNavigate();
  const [windowActive, setWindowActive] = useState(
    () => typeof document !== "undefined" && document.hasFocus(),
  );
  const enabled = Boolean(
    session && canAccessPath(session, "/customers") && windowActive,
  );
  const [match, setMatch] = useState<MatchToast | null>(null);
  const matchOpen = Boolean(match);
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function onFocus() {
      setWindowActive(true);
    }
    function onBlur() {
      setWindowActive(false);
    }
    function onVisibility() {
      setWindowActive(document.visibilityState === "visible" && document.hasFocus());
    }
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const closeMatch = useCallback(() => {
    setMatch(null);
  }, []);

  useEffect(() => {
    if (!match) return;
    pauseFingerprintIdentify();
    okRef.current?.focus();
    return () => resumeFingerprintIdentify();
  }, [match]);

  useEffect(() => {
    if (!match) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Enter" || e.isComposing) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "TEXTAREA") return;
      e.preventDefault();
      closeMatch();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [match, closeMatch]);

  useEffect(() => {
    if (!enabled) return;

    const ac = new AbortController();
    const { signal } = ac;

    void (async () => {
      while (!signal.aborted) {
        try {
          while (isFingerprintIdentifyPaused() && !signal.aborted) {
            await sleep(PAUSED_POLL_MS, signal);
          }
          if (signal.aborted) break;

          const result = await identifyFingerprint();
          if (signal.aborted) break;

          if (result.ok && result.customerId) {
            playFingerprintSound("success");
            try {
              const customerId = result.customerId;
              const [customer, balances, ledger] = await Promise.all([
                getCustomer(customerId),
                getCustomerBalances(customerId),
                listCustomerLedger({
                  customerId,
                  page: 1,
                  pageSize: 5,
                }),
              ]);
              if (signal.aborted) break;
              setMatch({
                customer,
                matchScore: result.matchScore,
                balances,
                recent: ledger.items,
              });
            } catch {
              setMatch(null);
            }
            await sleep(MATCH_COOLDOWN_MS, signal);
            continue;
          }

          const msg = (result.message || "").toLowerCase();
          if (
            msg.includes("no enrolled") ||
            msg.includes("no fingerprint reader") ||
            msg.includes("could not load libzkfp")
          ) {
            await sleep(BACKOFF_MS, signal);
          } else if (
            msg.includes("timed out") ||
            msg.includes("capture failed: timed out")
          ) {
            // Idle window ended with no finger — rest the CPU/driver.
            await sleep(IDLE_RETRY_MS, signal);
          } else {
            // Finger captured but unidentified / no match — not idle timeout.
            if (isUnmatchedFingerprint(result.message)) {
              notifyWrongFingerprint();
            }
            await sleep(RETRY_MS, signal);
          }
        } catch (err: unknown) {
          if (signal.aborted) break;
          const text = technicalErrorText(err);
          if (/ACCESS_DENIED|not allowed|Command not found/i.test(text)) {
            break;
          }
          try {
            await sleep(BACKOFF_MS, signal);
          } catch {
            break;
          }
        }
      }
    })();

    return () => ac.abort();
  }, [enabled]);

  if (!matchOpen || !match) return null;

  const { customer, matchScore, balances, recent } = match;
  const code = present(customer.code);
  const phone = present(customer.phone);
  const nationalId = present(customer.nationalId);
  const address = present(customer.address);
  const typeRaw = present(customer.customerType)?.toUpperCase() ?? null;
  const typeLabel =
    typeRaw === "TEMPORARY"
      ? t.customers.temporary
      : typeRaw === "PERMANENT"
        ? t.customers.permanent
        : null;
  const infoRows: { label: string; value: string }[] = [];
  if (phone) infoRows.push({ label: t.common.phone, value: phone });
  if (nationalId) infoRows.push({ label: t.customers.idNumber, value: nationalId });
  if (address) infoRows.push({ label: t.common.address, value: address });
  if (typeLabel) infoRows.push({ label: t.customers.customerType, value: typeLabel });

  return (
    <Modal
      title={t.customers.identifyMatchTitle}
      size="lg"
      onClose={closeMatch}
    >
      <div className="fp-identify-modal-body">
        <header className="fp-identify-header">
          <div className="fp-identify-verified" aria-hidden="true">
            <div className="success-check">
              <svg viewBox="0 0 52 52" width="48" height="48">
                <circle
                  className="success-check-circle"
                  cx="26"
                  cy="26"
                  r="24"
                  fill="none"
                />
                <path
                  className="success-check-mark"
                  fill="none"
                  d="M14.5 27.2l7.2 7.2 15.8-16.4"
                />
              </svg>
            </div>
            <span className="fp-identify-verified-label">
              {t.customers.identifyVerified}
            </span>
          </div>
          <div className="fp-identify-header-text">
            <h3 className="fp-identify-hero-name">{customer.fullName}</h3>
            {code ? (
              <p className="fp-identify-hero-code muted">
                {t.customers.codePrefix.replace("{code}", code)}
              </p>
            ) : null}
            {matchScore != null ? (
              <p className="fp-identify-score muted">
                {t.customers.identifyScore}: {matchScore}
              </p>
            ) : null}
          </div>
        </header>

        {infoRows.length > 0 ? (
          <div className="fp-identify-info">
            {infoRows.map((row) => (
              <InfoRow key={row.label} label={row.label} value={row.value} />
            ))}
          </div>
        ) : null}

        <section
          className="fp-identify-balances"
          aria-label={t.customers.currentBalances}
        >
          <h4 className="fp-identify-section-title">
            {t.customers.currentBalances}
          </h4>
          <div className="fp-identify-balance-grid">
            {BALANCE_CODES.map((codeKey) => {
              const bal = balanceFor(balances, codeKey);
              return (
                <div key={codeKey} className="fp-identify-balance-card">
                  <span className="fp-identify-balance-ccy">{codeKey}</span>
                  <span
                    className={`fp-identify-balance-amt ${moneyToneClass(bal.toneSource)}`}
                  >
                    {bal.display}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section
          className="fp-identify-tx"
          aria-label={t.customers.identifyRecentTransactions}
        >
          <h4 className="fp-identify-section-title">
            {t.customers.identifyRecentTransactions}
          </h4>
          {recent.length === 0 ? (
            <p className="fp-identify-empty muted">
              {t.customers.identifyNoTransactions}
            </p>
          ) : (
            <ul className="fp-identify-tx-list">
              {recent.map((row) => {
                const side = debitCreditLabel(
                  row,
                  t.common.debit,
                  t.common.credit,
                );
                const ref = txDisplayRef(row);
                return (
                  <li
                    key={`${row.id}-${row.currencyCode}-${row.valueDate}`}
                    className="fp-identify-tx-item"
                  >
                    <div className="fp-identify-tx-top">
                      <span className="fp-identify-tx-date">{row.valueDate}</span>
                      <span className="fp-identify-tx-type">
                        {transactionTypeLabel(t, row.type)}
                      </span>
                      {side ? (
                        <span className="fp-identify-tx-side muted">{side}</span>
                      ) : null}
                    </div>
                    <div className="fp-identify-tx-bottom">
                      <LedgerAmount parts={amountPartsFromDebitCredit(row)} />
                      <span className="fp-identify-tx-ccy muted">
                        {row.currencyCode}
                      </span>
                      {present(ref) ? (
                        <span className="fp-identify-tx-ref col-ref">{ref}</span>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <div className="modal-actions" style={{ justifyContent: "center" }}>
        <button
          type="button"
          className="btn secondary"
          onClick={() => {
            const id = customer.id;
            closeMatch();
            navigate(`/customers/${id}`);
          }}
        >
          <IconCustomers />
          <span>{t.customers.identifyOpenCustomer}</span>
        </button>
        <button
          ref={okRef}
          type="button"
          className="btn btn-action btn-action--ok"
          data-desk-action="ok"
          onClick={closeMatch}
        >
          <IconOk />
          <span>{t.customers.identifyDismiss}</span>
        </button>
      </div>
    </Modal>
  );
}
