import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import {
  customerAddMoney,
  getCustomerBalances,
  getMovementForEdit,
  getPreviousMovement,
  listCurrenciesPage,
  listCustomersPage,
  previewDisplayRef,
  type CurrencyListItem,
  type CustomerListItem,
  type MovementEditSnapshot,
} from "@desktop/api";
import { ModalFormActions } from "@desktop/components/modal-form-actions";
import { MovementFxAmountFields } from "@desktop/components/movement-fx-amount-fields";
import { useAuth } from "@desktop/auth";
import { useT } from "@desktop/i18n";
import {
  endSubmit,
  errorMessage,
  nowTime,
  todayIso,
  tryBeginSubmit,
} from "@desktop/lib/datetime";
import { pickDefaultCurrency } from "@desktop/lib/default-currency";
import { buildDepositDescription } from "@desktop/lib/movement-description";
import {
  currenciesDiffer,
  formatFxAmount,
  leftToRight,
  type MovementRateBase,
} from "@desktop/lib/movement-fx";
import {
  handleDeskFormKeyDown,
  handleDeskSearchEnter,
} from "@desktop/lib/form-keyboard";
import { appendEmployeeLine, EmployeeField } from "@desktop/ui/employee-field";
import { Modal } from "@desktop/ui/modal";
import { SuccessModal } from "@desktop/ui/success-modal";
import {
  loadDeskVoucher,
  newInternalRef,
  txDisplayRef,
} from "@desktop/lib/tx-ref";

type PayerType = "self" | "other";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  /** Open in edit mode for this transaction id */
  editTransactionId?: string | null;
};

function emptyForm(defaultCurrency = "") {
  return {
    cashAmount: "",
    cashCurrencyCode: defaultCurrency,
    amount: "",
    currencyCode: defaultCurrency,
    rate: "",
    rateBase: "left" as MovementRateBase,
    boardRate: "",
    customerId: "",
    customerLabel: "",
    payerType: "self" as PayerType,
    payerName: "",
    reference: "",
    valueDate: todayIso(),
    description: "",
  };
}

function extractTimeSuffix(valueDate: string): string | null {
  const m = valueDate.match(/\d{2}:\d{2}(?::\d{2})?/);
  if (!m) return null;
  return m[0].length === 5 ? `${m[0]}:00` : m[0];
}

export function DepositFormModal({
  open,
  onClose,
  onSaved,
  editTransactionId = null,
}: Props) {
  const t = useT();
  const { session } = useAuth();
  const searchWrapRef = useRef<HTMLLabelElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);
  /** Cursor for Previous cycling — never used as replaceTransactionId. */
  const templateCursorRef = useRef<string | null>(null);

  const [currencies, setCurrencies] = useState<CurrencyListItem[]>([]);
  const [form, setForm] = useState(() => emptyForm());
  const [voucherNo, setVoucherNo] = useState("");
  const [replaceId, setReplaceId] = useState<string | null>(null);
  const [editTimeSuffix, setEditTimeSuffix] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<CustomerListItem[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [descriptionDirty, setDescriptionDirty] = useState(false);
  const [resultDirty, setResultDirty] = useState(false);
  /** Signed balance display per currency for the selected customer (for debt-repayment copy). */
  const [balanceByCurrency, setBalanceByCurrency] = useState<
    Record<string, string>
  >({});
  const [employeeId, setEmployeeId] = useState("");
  const [employeeName, setEmployeeName] = useState("");

  function clearSuggestState() {
    setSuggestions([]);
    setShowSuggestions(false);
    setHighlight(-1);
  }

  function applySnapshot(snap: MovementEditSnapshot, mode: "edit" | "template") {
    if (mode === "edit") {
      setReplaceId(snap.id);
      setEditTimeSuffix(extractTimeSuffix(snap.valueDate));
      templateCursorRef.current = null;
    } else {
      setReplaceId(null);
      setEditTimeSuffix(null);
      templateCursorRef.current = snap.id;
    }
    const cashCcy = snap.cashCurrencyCode?.trim() || snap.currencyCode;
    const cashAmt = snap.cashAmount?.trim() || snap.amount;
    setForm({
      cashAmount: cashAmt,
      cashCurrencyCode: cashCcy,
      amount: snap.amount,
      currencyCode: snap.currencyCode,
      rate: "",
      rateBase: "left",
      boardRate: "",
      customerId: snap.customerId || "",
      customerLabel: snap.customerName || "",
      payerType: snap.actedByName ? "other" : "self",
      payerName: snap.actedByName || "",
      reference: mode === "template" ? "" : snap.reference,
      valueDate: mode === "template" ? todayIso() : String(snap.valueDate).slice(0, 10),
      description: mode === "template" ? "" : snap.description?.trim() || "",
    });
    if (mode === "edit") {
      setVoucherNo(txDisplayRef(snap));
    } else {
      setVoucherNo("");
      void loadDeskVoucher(() => previewDisplayRef("DEPOSIT")).then(setVoucherNo);
    }
    setDescriptionDirty(mode !== "template");
    setResultDirty(true);
    setEmployeeId("");
    setEmployeeName("");
    clearSuggestState();
    setError(null);
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const page = await listCurrenciesPage({ activeOnly: true, pageSize: 100 });
        if (cancelled) return;
        setCurrencies(page.items);
        const defaultCcy = pickDefaultCurrency(page.items);

        if (editTransactionId) {
          const snap = await getMovementForEdit(editTransactionId);
          if (cancelled) return;
          applySnapshot(snap, "edit");
        } else {
          templateCursorRef.current = null;
          setReplaceId(null);
          setEditTimeSuffix(null);
          setForm(emptyForm(defaultCcy));
          setVoucherNo("");
          setDescriptionDirty(false);
          setResultDirty(false);
          setEmployeeId("");
          setEmployeeName("");
          clearSuggestState();
          setError(null);
          const voucher = await loadDeskVoucher(() =>
            previewDisplayRef("DEPOSIT"),
          );
          if (!cancelled) setVoucherNo(voucher);
        }
      } catch (err: unknown) {
        if (!cancelled) setError(errorMessage(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, editTransactionId]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => amountRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!searchWrapRef.current?.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = form.customerLabel.trim();
    if (form.customerId || q.length < 1) {
      setSuggestions([]);
      setHighlight(-1);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSuggestBusy(true);
      void listCustomersPage({
        search: q,
        archiveFilter: "active",
        page: 1,
        pageSize: 12,
      })
        .then((page) => {
          if (cancelled) return;
          setSuggestions(page.items);
          setHighlight(page.items.length > 0 ? 0 : -1);
        })
        .catch(() => {
          if (!cancelled) setSuggestions([]);
        })
        .finally(() => {
          if (!cancelled) setSuggestBusy(false);
        });
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [form.customerLabel, form.customerId, open]);

  useEffect(() => {
    if (!open) return;
    const converting = currenciesDiffer(form.cashCurrencyCode, form.currencyCode);
    if (!converting) {
      if (form.amount !== form.cashAmount) {
        setForm((prev) => ({ ...prev, amount: prev.cashAmount }));
      }
      if (resultDirty) setResultDirty(false);
      return;
    }
    if (resultDirty) return;
    const rate = Number(form.rate.replace(/,/g, ""));
    const cashAmount = Number(form.cashAmount.replace(/,/g, ""));
    const next = leftToRight(cashAmount, rate, form.rateBase);
    if (next == null) return;
    const formatted = formatFxAmount(next);
    if (formatted && formatted !== form.amount) {
      setForm((prev) => ({ ...prev, amount: formatted }));
    }
  }, [
    open,
    form.cashAmount,
    form.cashCurrencyCode,
    form.amount,
    form.currencyCode,
    form.rate,
    form.rateBase,
    resultDirty,
  ]);

  useEffect(() => {
    if (!open || !form.customerId) {
      setBalanceByCurrency({});
      return;
    }
    let cancelled = false;
    void getCustomerBalances(form.customerId)
      .then((rows) => {
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const row of rows) {
          map[row.currencyCode.toUpperCase()] = row.balanceDisplay;
        }
        setBalanceByCurrency(map);
      })
      .catch(() => {
        if (!cancelled) setBalanceByCurrency({});
      });
    return () => {
      cancelled = true;
    };
  }, [open, form.customerId]);

  useEffect(() => {
    if (!open || descriptionDirty) return;
    const actedBy =
      form.payerType === "other" ? form.payerName.trim() || null : null;
    const balRaw = balanceByCurrency[form.currencyCode.trim().toUpperCase()];
    const balNum = balRaw != null ? Number(String(balRaw).replace(/,/g, "")) : NaN;
    const isDebtRepayment = Number.isFinite(balNum) && balNum < 0;
    const next = buildDepositDescription(t.desk, {
      customerName: form.customerLabel,
      amount: form.amount,
      currency: form.currencyCode,
      cashAmount: form.cashAmount,
      cashCurrency: form.cashCurrencyCode,
      actedByName: actedBy,
      isDebtRepayment,
    });
    setForm((prev) =>
      prev.description === next ? prev : { ...prev, description: next },
    );
  }, [
    open,
    descriptionDirty,
    form.amount,
    form.currencyCode,
    form.cashAmount,
    form.cashCurrencyCode,
    form.customerLabel,
    form.payerType,
    form.payerName,
    balanceByCurrency,
    t.desk,
  ]);

  function resetForm(keepOpen: boolean) {
    const defaultCcy = pickDefaultCurrency(currencies) || form.currencyCode;
    templateCursorRef.current = null;
    setReplaceId(null);
    setEditTimeSuffix(null);
    setForm(emptyForm(defaultCcy));
    setVoucherNo("");
    if (keepOpen) {
      void loadDeskVoucher(() => previewDisplayRef("DEPOSIT")).then(setVoucherNo);
    }
    setDescriptionDirty(false);
    setResultDirty(false);
    setBalanceByCurrency({});
    setEmployeeId("");
    setEmployeeName("");
    setError(null);
    clearSuggestState();
    if (!keepOpen) onClose();
    else window.setTimeout(() => amountRef.current?.focus(), 50);
  }

  function pickCustomer(c: CustomerListItem) {
    setForm((prev) => ({
      ...prev,
      customerId: c.id,
      customerLabel: c.fullName,
    }));
    setShowSuggestions(false);
    setSuggestions([]);
    setHighlight(-1);
    setError(null);
  }

  function onCustomerKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (
      handleDeskSearchEnter(e, {
        listOpen: showSuggestions && suggestions.length > 0,
        canSelect: suggestions.length > 0,
        select: () => {
          const pickIdx = highlight >= 0 ? highlight : 0;
          if (suggestions[pickIdx]) pickCustomer(suggestions[pickIdx]);
        },
      })
    ) {
      return;
    }
    if (!showSuggestions || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((i) => (i + 1) % suggestions.length);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setShowSuggestions(false);
      setHighlight(-1);
    }
  }

  async function loadPrevious() {
    setError(null);
    try {
      const snap = await getPreviousMovement({
        transactionType: "DEPOSIT",
        beforeId: templateCursorRef.current || undefined,
      });
      if (!snap) {
        setError(t.desk.noPreviousRecord);
        return;
      }
      applySnapshot(snap, "template");
    } catch (err: unknown) {
      setError(errorMessage(err));
    }
  }

  async function submit(action: "save" | "new") {
    if (!session) return;
    const amount = form.amount.trim();
    const cashAmount = form.cashAmount.trim();
    if (!cashAmount || Number(cashAmount.replace(/,/g, "")) <= 0) {
      setError(t.desk.enterAmount);
      amountRef.current?.focus();
      return;
    }
    const converting = currenciesDiffer(form.cashCurrencyCode, form.currencyCode);
    if (converting && (!form.rate.trim() || Number(form.rate.replace(/,/g, "")) <= 0)) {
      setError(t.desk.rateRequired);
      return;
    }
    if (!amount || Number(amount.replace(/,/g, "")) <= 0) {
      setError(converting ? t.desk.rateRequired : t.desk.enterAmount);
      amountRef.current?.focus();
      return;
    }
    if (!form.customerId) {
      setError(t.desk.selectCustomerRequired);
      searchWrapRef.current?.querySelector("input")?.focus();
      return;
    }
    if (form.payerType === "other" && !form.payerName.trim()) {
      setError(t.desk.payerNameRequired);
      return;
    }

    const timePart =
      replaceId && editTimeSuffix ? editTimeSuffix : `${nowTime()}:00`;

    if (!tryBeginSubmit(submittingRef)) return;
    setSaving(true);
    setError(null);
    try {
      const result = await customerAddMoney({
        customerId: form.customerId,
        currencyCode: form.currencyCode,
        amount,
        cashCurrencyCode: converting ? form.cashCurrencyCode : undefined,
        cashAmount: converting ? cashAmount : undefined,
        boardRate: converting ? form.boardRate.trim() || undefined : undefined,
        highCurrencyCode: converting
          ? form.rateBase === "left"
            ? form.cashCurrencyCode
            : form.currencyCode
          : undefined,
        valueDate: `${form.valueDate} ${timePart}`,
        reference: replaceId
          ? form.reference.trim() || undefined
          : newInternalRef("DEP"),
        description: form.description.trim() || undefined,
        actedByName:
          form.payerType === "other" ? form.payerName.trim() || undefined : undefined,
        notes: appendEmployeeLine(
          undefined,
          employeeName,
          t.employees.employee,
        ),
        paymentMethod: "Cash",
        createdById: session.userId,
        replaceTransactionId: replaceId || undefined,
      });
      onSaved?.();
      if (action === "save") {
        setSuccessMessage(
          `${t.errors.depositSuccess} ${result.currencyCode} ${result.amount}`,
        );
        resetForm(false);
      } else {
        resetForm(true);
      }
    } catch (err: unknown) {
      setError(errorMessage(err, t.errors.depositSave));
    } finally {
      endSubmit(submittingRef);
      setSaving(false);
    }
  }

  if (!open && !successMessage) return null;

  const title = replaceId ? t.desk.editDepositTitle : t.desk.depositTitle;

  return (
    <>
      {open ? (
        <Modal title={title} size="xl" onClose={() => resetForm(false)}>
          <div
            className="stack movement-form-compact"
            data-desk-form
            onKeyDown={(e) =>
              handleDeskFormKeyDown(e, {
                busy: saving,
                onSubmit: () => void submit("save"),
              })
            }
          >
          <p className="muted" style={{ margin: 0 }}>
            {t.dashboard.depositHint}
          </p>

          <div className="fx-simple-top">
            <label className="desk-ref-field">
              <span>{t.desk.voucherNumber}</span>
              <input
                className="desk-ref-input"
                value={voucherNo}
                readOnly
                tabIndex={-1}
              />
            </label>
            <label>
              <span>{t.common.date}</span>
              <input
                type="date"
                value={form.valueDate}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, valueDate: e.target.value }))
                }
              />
            </label>
          </div>

          <MovementFxAmountFields
            currencies={currencies}
            leftAmount={form.cashAmount}
            leftCurrency={form.cashCurrencyCode}
            rightAmount={form.amount}
            rightCurrency={form.currencyCode}
            rate={form.rate}
            rateBase={form.rateBase}
            boardRate={form.boardRate}
            amountRef={amountRef}
            labels={{
              leftAmount: t.desk.cashReceivedLabel,
              rightAmount: t.desk.accountCreditLabel,
              resultAmount: t.desk.fxResultAmountLabel,
              rateDirectionOption: (base, quote) =>
                t.exchange.rateDirectionOption
                  .replace("{base}", base)
                  .replace("{quote}", quote),
              rateOpLabel: t.exchange.rateOpLabel,
              exchangeRate: t.exchange.exchangeRate,
              marketCost: t.desk.marketCost,
              amountPlaceholder: t.common.amountPlaceholder,
              currency: t.common.currency,
              noData: t.common.noData,
              search: t.common.search,
            }}
            onLeftAmount={(v) => {
              setResultDirty(false);
              setForm((prev) => ({ ...prev, cashAmount: v }));
              setError(null);
            }}
            onLeftCurrency={(code) => {
              setResultDirty(false);
              setForm((prev) => ({
                ...prev,
                cashCurrencyCode: code,
                currencyCode: code,
                rate: "",
              }));
              setError(null);
            }}
            onRightAmount={(v) => {
              setResultDirty(true);
              setForm((prev) => ({ ...prev, amount: v }));
              setError(null);
            }}
            onRightCurrency={(code) => {
              setResultDirty(false);
              setForm((prev) => ({ ...prev, currencyCode: code }));
              setError(null);
            }}
            onRate={(v) => {
              setResultDirty(false);
              setForm((prev) => ({ ...prev, rate: v }));
              setError(null);
            }}
            onRateBase={(rateBase) => {
              setResultDirty(false);
              setForm((prev) => ({ ...prev, rateBase }));
              setError(null);
            }}
            onBoardRate={(boardRate) => setForm((prev) => ({ ...prev, boardRate }))}
            onCurrenciesChange={setCurrencies}
          />

          <label ref={searchWrapRef} className="customer-search-wrap">
            {t.desk.accountCustomer} *
            <input
              value={form.customerLabel}
              placeholder={t.customers.searchPlaceholder}
              autoComplete="off"
              aria-autocomplete="list"
              aria-expanded={showSuggestions && suggestions.length > 0}
              onChange={(e) => {
                setForm((prev) => ({
                  ...prev,
                  customerId: "",
                  customerLabel: e.target.value,
                }));
                setShowSuggestions(true);
                setError(null);
              }}
              onFocus={() => {
                if (!form.customerId) setShowSuggestions(true);
              }}
              onKeyDown={onCustomerKeyDown}
            />
            {showSuggestions && form.customerLabel.trim().length > 0 && !form.customerId ? (
              <ul className="customer-suggest" role="listbox">
                {suggestBusy && suggestions.length === 0 ? (
                  <li className="customer-suggest-empty muted">{t.common.loading}</li>
                ) : null}
                {!suggestBusy && suggestions.length === 0 ? (
                  <li className="customer-suggest-empty muted">{t.customers.emptyFiltered}</li>
                ) : null}
                {suggestions.map((c, idx) => (
                  <li key={c.id} role="option" aria-selected={idx === highlight}>
                    <button
                      type="button"
                      tabIndex={-1}
                      className={`customer-suggest-item${idx === highlight ? " is-active" : ""}`}
                      onMouseEnter={() => setHighlight(idx)}
                      onClick={() => pickCustomer(c)}
                    >
                      <span className="customer-suggest-name">
                        {c.fullName}
                        {c.fatherName ? ` · ${c.fatherName}` : ""}
                      </span>
                      <span className="customer-suggest-meta muted">
                        {[c.code, c.phone].filter(Boolean).join(" · ") || "—"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </label>

          <div className="movement-form-party-row">
            <div>
              <div className="muted" style={{ marginBottom: "0.35rem", fontSize: "var(--text-sm)" }}>
                {t.desk.payerType}
              </div>
              <div
                className="hawala-mode-toggle"
                role="group"
                aria-label={t.desk.payerType}
                data-desk-choice-group
              >
                <button
                  type="button"
                  className={form.payerType === "self" ? "hawala-mode active" : "hawala-mode"}
                  aria-pressed={form.payerType === "self"}
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      payerType: "self",
                      payerName: "",
                    }))
                  }
                >
                  {t.desk.payerSelf}
                </button>
                <button
                  type="button"
                  className={form.payerType === "other" ? "hawala-mode active" : "hawala-mode"}
                  aria-pressed={form.payerType === "other"}
                  onClick={() => setForm((prev) => ({ ...prev, payerType: "other" }))}
                >
                  {t.desk.payerSomeoneElse}
                </button>
              </div>
            </div>
            <EmployeeField
              valueId={employeeId}
              onChange={(id, name) => {
                setEmployeeId(id);
                setEmployeeName(name);
              }}
              disabled={saving}
            />
          </div>

          {form.payerType === "other" ? (
            <label>
              <span>{t.common.fullName} *</span>
              <input
                value={form.payerName}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, payerName: e.target.value }))
                }
              />
            </label>
          ) : null}

          <label>
            {t.desk.movementDescription}
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => {
                setDescriptionDirty(true);
                setForm((prev) => ({ ...prev, description: e.target.value }));
              }}
            />
          </label>

          <ModalFormActions
            inline
            busy={saving}
            error={error}
            previousLabel={t.common.previous}
            saveLabel={saving ? t.common.saving : t.common.save}
            saveAndNewLabel={t.hawala.saveAndNew}
            cancelLabel={t.common.cancel}
            onPrevious={() => void loadPrevious()}
            onSave={() => void submit("save")}
            onSaveAndNew={() => void submit("new")}
            onCancel={() => resetForm(false)}
          />
          </div>
        </Modal>
      ) : null}

      {successMessage ? (
        <SuccessModal
          title={t.common.success}
          message={successMessage}
          onClose={() => setSuccessMessage(null)}
          primaryLabel={t.common.close}
        />
      ) : null}
    </>
  );
}
