import { type FormEvent, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import {
  getTransactionDetail,
  listCurrenciesPage,
  postMainVaultCashMove,
  type CurrencyListItem,
} from "@desktop/api";
import { AuthorizationPinModal } from "@desktop/components/authorization-pin-modal";
import { useAuth } from "@desktop/auth";
import { useT } from "@desktop/i18n";
import { pickDefaultCurrency } from "@desktop/lib/default-currency";
import {
  endSubmit,
  errorMessage,
  tryBeginSubmit,
} from "@desktop/lib/datetime";
import { handleDeskFormKeyDown } from "@desktop/lib/form-keyboard";
import { AmountInput } from "@desktop/ui/amount-input";
import { CurrencyPicker } from "@desktop/ui/currency-picker";
import { appendEmployeeLine, EmployeeField } from "@desktop/ui/employee-field";
import { Modal } from "@desktop/ui/modal";
import { ModalErrorBanner } from "@desktop/ui/modal-error-banner";

export type VaultCashDirection = "CASH_IN" | "CASH_OUT";

type PendingCash = {
  direction: VaultCashDirection;
  currencyCode: string;
  amount: string;
  costRate?: string;
  reference?: string;
  notes?: string;
  replaceTransactionId?: string;
};

function parseAmount(raw: string): number | null {
  const n = Number(String(raw).replace(/,/g, "").trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Notes stored as "Cash in X Y to Main Vault — note" */
function notesFromDescription(description: string | null | undefined): string {
  const d = (description ?? "").trim();
  const sep = " — ";
  const idx = d.lastIndexOf(sep);
  if (idx < 0) return "";
  return d.slice(idx + sep.length).trim();
}

export function vaultCashDirectionFromTx(
  type: string,
  reference?: string | null,
): VaultCashDirection | null {
  const t = type.trim().toUpperCase();
  if (t === "VAULT_CASH_IN") return "CASH_IN";
  if (t === "VAULT_CASH_OUT") return "CASH_OUT";
  if (t === "ADJUSTMENT") {
    const r = (reference ?? "").trim().toUpperCase();
    if (r.startsWith("CASH-IN")) return "CASH_IN";
    if (r.startsWith("CASH-OUT")) return "CASH_OUT";
  }
  return null;
}

export function isVaultCashMovement(
  type: string,
  reference?: string | null,
): boolean {
  return vaultCashDirectionFromTx(type, reference) != null;
}

type Props = {
  open: boolean;
  direction: VaultCashDirection;
  editTransactionId?: string | null;
  onClose: () => void;
  onSaved?: () => void;
};

/** Main Vault Cash In / Cash Out — create or replace (edit) with Authorization PIN. */
export function VaultCashFormModal({
  open,
  direction,
  editTransactionId = null,
  onClose,
  onSaved,
}: Props) {
  const t = useT();
  const { session } = useAuth();
  const [currencies, setCurrencies] = useState<CurrencyListItem[]>([]);
  const [currencyCode, setCurrencyCode] = useState("AFN");
  const [amount, setAmount] = useState("");
  const [costRate, setCostRate] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingCash, setPendingCash] = useState<PendingCash | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinBusy, setPinBusy] = useState(false);
  const [replaceId, setReplaceId] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  const editing = Boolean(editTransactionId);
  const title = direction === "CASH_IN" ? t.desk.cashIn : t.desk.cashOut;
  const hint = direction === "CASH_IN" ? t.desk.cashInHint : t.desk.cashOutHint;
  const currencyUpper = currencyCode.trim().toUpperCase();
  const showCostRate =
    direction === "CASH_IN" &&
    currencyUpper.length > 0 &&
    currencyUpper !== "AFN" &&
    currencyUpper !== "AF";

  useEffect(() => {
    if (!open) {
      setAmount("");
      setCostRate("");
      setReference("");
      setNotes("");
      setEmployeeId("");
      setEmployeeName("");
      setError(null);
      setPendingCash(null);
      setPinError(null);
      setReplaceId(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const page = await listCurrenciesPage({ page: 1, pageSize: 200 });
        const active = page.items.filter((x) => x.isActive);
        if (cancelled) return;
        setCurrencies(active);

        if (editTransactionId) {
          const detail = await getTransactionDetail(editTransactionId);
          if (cancelled) return;
          const cashLine =
            detail.lines.find((l) =>
              (l.memo ?? "").toLowerCase().includes("main vault"),
            ) ??
            detail.lines.find((l) =>
              direction === "CASH_IN"
                ? l.direction.toUpperCase() === "DEBIT"
                : l.direction.toUpperCase() === "CREDIT",
            ) ??
            detail.lines[0];
          setAmount(cashLine?.amount?.replace(/,/g, "") ?? "");
          setCurrencyCode(
            cashLine?.currencyCode || pickDefaultCurrency(active),
          );
          setCostRate("");
          setReference(detail.reference ?? "");
          setNotes(notesFromDescription(detail.description));
          setEmployeeId("");
          setEmployeeName("");
          setReplaceId(detail.id);
        } else {
          setCurrencyCode((prev) => prev || pickDefaultCurrency(active));
          setAmount("");
          setCostRate("");
          setReference("");
          setNotes("");
          setEmployeeId("");
          setEmployeeName("");
          setReplaceId(null);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(errorMessage(err, t.errors.vaultSave));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, editTransactionId, direction, t.errors.vaultSave]);

  if (!open) return null;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!session?.userId || saving || loading) return;
    if (!parseAmount(amount)) {
      setError(t.errors.vaultSave);
      return;
    }
    const rateTrim = costRate.trim().replace(/,/g, "");
    if (showCostRate && rateTrim && !parseAmount(rateTrim)) {
      setError(t.desk.cashInCostRateHint);
      return;
    }
    setError(null);
    setPinError(null);
    setPendingCash({
      direction,
      currencyCode,
      amount,
      costRate: showCostRate && rateTrim ? rateTrim : undefined,
      reference: reference.trim() || undefined,
      notes: appendEmployeeLine(notes, employeeName, t.employees.employee),
      replaceTransactionId: replaceId || undefined,
    });
  }

  async function confirmWithPin(pin: string) {
    if (!session?.userId || !pendingCash) return;
    if (!tryBeginSubmit(submittingRef)) return;
    setPinBusy(true);
    setSaving(true);
    setPinError(null);
    setError(null);
    try {
      await postMainVaultCashMove({
        direction: pendingCash.direction,
        currencyCode: pendingCash.currencyCode,
        amount: pendingCash.amount,
        costRate: pendingCash.costRate,
        costCurrencyCode: pendingCash.costRate ? "AFN" : undefined,
        reference: pendingCash.reference,
        notes: pendingCash.notes,
        createdById: session.userId,
        authorizationPin: pin,
        replaceTransactionId: pendingCash.replaceTransactionId,
      });
      setPendingCash(null);
      onSaved?.();
      onClose();
    } catch (err: unknown) {
      setPinError(errorMessage(err, t.errors.vaultSave));
    } finally {
      endSubmit(submittingRef);
      setPinBusy(false);
      setSaving(false);
    }
  }

  const formBusy = saving || loading || pinBusy;

  return (
    <>
      <Modal
        title={editing ? `${t.common.editAction} — ${title}` : title}
        onClose={formBusy ? () => undefined : onClose}
      >
        <p className="muted" style={{ margin: 0 }}>
          {hint}
        </p>
        {loading ? (
          <p className="muted">{t.common.loading}</p>
        ) : (
          <form
            ref={formRef}
            className="stack"
            data-desk-form
            onKeyDown={(e: ReactKeyboardEvent<HTMLFormElement>) =>
              handleDeskFormKeyDown(e, {
                busy: formBusy,
                onSubmit: () => formRef.current?.requestSubmit(),
              })
            }
            onSubmit={(e) => void onSubmit(e)}
          >
            <div className="money-ccy-row">
              <label className="money-ccy-amount">
                {t.common.amount} *
                <AmountInput
                  value={amount}
                  onValueChange={setAmount}
                  required
                  disabled={formBusy}
                />
              </label>
              <CurrencyPicker
                label={t.common.currency}
                required
                currencies={currencies}
                value={currencyCode}
                onCurrenciesChange={setCurrencies}
                onChange={(code) => {
                  setCurrencyCode(code);
                  const u = code.trim().toUpperCase();
                  if (u === "AFN" || u === "AF") setCostRate("");
                }}
                emptyLabel={t.common.noData}
                searchPlaceholder={t.common.search}
              />
            </div>
            {showCostRate ? (
              <label>
                {t.desk.cashInCostRate.replace("{currency}", currencyCode || "—")}
                <AmountInput
                  value={costRate}
                  onValueChange={setCostRate}
                  placeholder={t.desk.referenceOptional}
                  disabled={formBusy}
                />
                <span className="muted" style={{ display: "block", marginTop: "0.25rem", fontSize: "0.85rem" }}>
                  {t.desk.cashInCostRateHint}
                </span>
              </label>
            ) : null}
            <label>
              {t.common.reference}
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder={t.desk.referenceOptional}
                disabled={formBusy}
              />
            </label>
            <label>
              {t.common.notes}
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                disabled={formBusy}
              />
            </label>
            <EmployeeField
              valueId={employeeId}
              onChange={(id, name) => {
                setEmployeeId(id);
                setEmployeeName(name);
              }}
              disabled={formBusy}
            />
            <ModalErrorBanner message={error} />
            <div className="modal-actions">
              <button
                type="button"
                className="btn"
                onClick={onClose}
                disabled={formBusy}
              >
                {t.common.cancel}
              </button>
              <button
                type="submit"
                className="btn primary"
                data-desk-action="save"
                disabled={formBusy}
              >
                {saving ? t.common.saving : editing ? t.common.save : title}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <AuthorizationPinModal
        open={Boolean(pendingCash)}
        title={title}
        summary={
          pendingCash
            ? pendingCash.costRate
              ? `${pendingCash.amount} ${pendingCash.currencyCode} · ${pendingCash.costRate} AFN`
              : `${pendingCash.amount} ${pendingCash.currencyCode}`
            : ""
        }
        busy={pinBusy}
        error={pinError}
        onCancel={() => {
          if (!pinBusy) {
            setPendingCash(null);
            setPinError(null);
          }
        }}
        onConfirm={(pin) => void confirmWithPin(pin)}
      />
    </>
  );
}
