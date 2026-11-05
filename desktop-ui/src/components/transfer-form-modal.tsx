import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from "react";

import {
  getMovementForEdit,
  getPreviousMovement,
  listCurrenciesPage,
  listCustomersPage,
  previewDisplayRef,
  transferFunds,
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
  todayIso,
  tryBeginSubmit,
} from "@desktop/lib/datetime";
import { pickDefaultCurrency } from "@desktop/lib/default-currency";
import { buildTransferDescription } from "@desktop/lib/movement-description";
import {
  currenciesDiffer,
  formatFxAmount,
  leftToRight,
  type MovementRateBase,
} from "@desktop/lib/movement-fx";
import { useDeskFormDraftRetain } from "@desktop/lib/desk-form-draft";
import {
  handleDeskFormKeyDown,
  handleDeskSearchEnter,
} from "@desktop/lib/form-keyboard";
import { appendEmployeeLine, EmployeeField } from "@desktop/ui/employee-field";
import { Modal } from "@desktop/ui/modal";
import { SuccessModal } from "@desktop/ui/success-modal";
import { loadDeskVoucher, newInternalRef, txDisplayRef } from "@desktop/lib/tx-ref";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  /** Open in edit mode for this transaction id */
  editTransactionId?: string | null;
};

function emptyForm(defaultCurrency = "") {
  return {
    amount: "",
    currencyCode: defaultCurrency,
    receiveAmount: "",
    receiveCurrencyCode: defaultCurrency,
    rate: "",
    rateBase: "left" as MovementRateBase,
    boardRate: "",
    fromCustomerId: "",
    fromCustomerLabel: "",
    toCustomerId: "",
    toCustomerLabel: "",
    reference: "",
    valueDate: todayIso(),
    description: "",
  };
}

function CustomerPicker({
  label,
  value,
  customerId,
  placeholder,
  wrapRef,
  suggestions,
  showSuggestions,
  suggestBusy,
  highlight,
  emptyFiltered,
  loadingLabel,
  onChangeLabel,
  onFocus,
  onKeyDown,
  onPick,
  onHighlight,
}: {
  label: string;
  value: string;
  customerId: string;
  placeholder: string;
  wrapRef: RefObject<HTMLLabelElement | null>;
  suggestions: CustomerListItem[];
  showSuggestions: boolean;
  suggestBusy: boolean;
  highlight: number;
  emptyFiltered: string;
  loadingLabel: string;
  onChangeLabel: (v: string) => void;
  onFocus: () => void;
  onKeyDown: (e: ReactKeyboardEvent<HTMLInputElement>) => void;
  onPick: (c: CustomerListItem) => void;
  onHighlight: (i: number) => void;
}) {
  return (
    <label ref={wrapRef} className="customer-search-wrap">
      {label} *
      <input
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={showSuggestions && suggestions.length > 0}
        onChange={(e) => onChangeLabel(e.target.value)}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
      />
      {showSuggestions && value.trim().length > 0 && !customerId ? (
        <ul className="customer-suggest" role="listbox">
          {suggestBusy && suggestions.length === 0 ? (
            <li className="customer-suggest-empty muted">{loadingLabel}</li>
          ) : null}
          {!suggestBusy && suggestions.length === 0 ? (
            <li className="customer-suggest-empty muted">{emptyFiltered}</li>
          ) : null}
          {suggestions.map((c, idx) => (
            <li key={c.id} role="option" aria-selected={idx === highlight}>
              <button
                type="button"
                tabIndex={-1}
                className={`customer-suggest-item${idx === highlight ? " is-active" : ""}`}
                onMouseEnter={() => onHighlight(idx)}
                onClick={() => onPick(c)}
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
  );
}

export function TransferFormModal({
  open,
  onClose,
  onSaved,
  editTransactionId = null,
}: Props) {
  const t = useT();
  const { session } = useAuth();
  const fromWrapRef = useRef<HTMLLabelElement>(null);
  const toWrapRef = useRef<HTMLLabelElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);
  /** Cursor for Previous cycling — never used as replaceTransactionId. */
  const templateCursorRef = useRef<string | null>(null);
  const { retainDraft, discardDraft, shouldRetainDraft } = useDeskFormDraftRetain();

  const [currencies, setCurrencies] = useState<CurrencyListItem[]>([]);
  const [form, setForm] = useState(() => emptyForm());
  const [voucherNo, setVoucherNo] = useState("");
  const [replaceId, setReplaceId] = useState<string | null>(null);
  const [fromSuggestions, setFromSuggestions] = useState<CustomerListItem[]>([]);
  const [toSuggestions, setToSuggestions] = useState<CustomerListItem[]>([]);
  const [showFromSuggestions, setShowFromSuggestions] = useState(false);
  const [showToSuggestions, setShowToSuggestions] = useState(false);
  const [fromSuggestBusy, setFromSuggestBusy] = useState(false);
  const [toSuggestBusy, setToSuggestBusy] = useState(false);
  const [fromHighlight, setFromHighlight] = useState(-1);
  const [toHighlight, setToHighlight] = useState(-1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [descriptionDirty, setDescriptionDirty] = useState(false);
  const [resultDirty, setResultDirty] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [employeeName, setEmployeeName] = useState("");

  function clearSuggestState() {
    setFromSuggestions([]);
    setToSuggestions([]);
    setShowFromSuggestions(false);
    setShowToSuggestions(false);
    setFromHighlight(-1);
    setToHighlight(-1);
  }

  function applySnapshot(snap: MovementEditSnapshot, mode: "edit" | "template") {
    if (mode === "edit") {
      setReplaceId(snap.id);
      templateCursorRef.current = null;
    } else {
      setReplaceId(null);
      templateCursorRef.current = snap.id;
    }
    setForm({
      amount: snap.amount,
      currencyCode: snap.currencyCode,
      receiveAmount: snap.receiveAmount?.trim() || snap.amount,
      receiveCurrencyCode: snap.receiveCurrencyCode?.trim() || snap.currencyCode,
      rate: "",
      rateBase: "left",
      boardRate: "",
      fromCustomerId: snap.senderCustomerId || "",
      fromCustomerLabel: snap.senderName || "",
      toCustomerId: snap.receiverCustomerId || "",
      toCustomerLabel: snap.receiverName || "",
      reference: mode === "template" ? "" : snap.reference,
      valueDate: mode === "template" ? todayIso() : String(snap.valueDate).slice(0, 10),
      description: mode === "template" ? "" : snap.description?.trim() || "",
    });
    if (mode === "edit") {
      setVoucherNo(txDisplayRef(snap));
    } else {
      setVoucherNo("");
      void loadDeskVoucher(() => previewDisplayRef("TRANSFER")).then(setVoucherNo);
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
          discardDraft();
          const snap = await getMovementForEdit(editTransactionId);
          if (cancelled) return;
          applySnapshot(snap, "edit");
        } else if (shouldRetainDraft()) {
          clearSuggestState();
          setError(null);
        } else {
          templateCursorRef.current = null;
          setReplaceId(null);
          setForm(emptyForm(defaultCcy));
          setVoucherNo("");
          setDescriptionDirty(false);
          setResultDirty(false);
          setEmployeeId("");
          setEmployeeName("");
          clearSuggestState();
          setError(null);
          const voucher = await loadDeskVoucher(() =>
            previewDisplayRef("TRANSFER"),
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
      const target = e.target as Node;
      if (!fromWrapRef.current?.contains(target)) setShowFromSuggestions(false);
      if (!toWrapRef.current?.contains(target)) setShowToSuggestions(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = form.fromCustomerLabel.trim();
    if (form.fromCustomerId || q.length < 1) {
      setFromSuggestions([]);
      setFromHighlight(-1);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setFromSuggestBusy(true);
      void listCustomersPage({
        search: q,
        archiveFilter: "active",
        page: 1,
        pageSize: 12,
      })
        .then((page) => {
          if (cancelled) return;
          setFromSuggestions(page.items);
          setFromHighlight(page.items.length > 0 ? 0 : -1);
        })
        .catch(() => {
          if (!cancelled) setFromSuggestions([]);
        })
        .finally(() => {
          if (!cancelled) setFromSuggestBusy(false);
        });
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [form.fromCustomerLabel, form.fromCustomerId, open]);

  useEffect(() => {
    if (!open) return;
    const q = form.toCustomerLabel.trim();
    if (form.toCustomerId || q.length < 1) {
      setToSuggestions([]);
      setToHighlight(-1);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setToSuggestBusy(true);
      void listCustomersPage({
        search: q,
        archiveFilter: "active",
        page: 1,
        pageSize: 12,
      })
        .then((page) => {
          if (cancelled) return;
          setToSuggestions(page.items);
          setToHighlight(page.items.length > 0 ? 0 : -1);
        })
        .catch(() => {
          if (!cancelled) setToSuggestions([]);
        })
        .finally(() => {
          if (!cancelled) setToSuggestBusy(false);
        });
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [form.toCustomerLabel, form.toCustomerId, open]);

  useEffect(() => {
    if (!open) return;
    const converting = currenciesDiffer(form.currencyCode, form.receiveCurrencyCode);
    if (!converting) {
      if (form.receiveAmount !== form.amount) {
        setForm((prev) => ({ ...prev, receiveAmount: prev.amount }));
      }
      if (resultDirty) setResultDirty(false);
      return;
    }
    if (resultDirty) return;
    const amount = Number(form.amount.replace(/,/g, ""));
    const rate = Number(form.rate.replace(/,/g, ""));
    const next = leftToRight(amount, rate, form.rateBase);
    if (next == null) return;
    const formatted = formatFxAmount(next);
    if (formatted && formatted !== form.receiveAmount) {
      setForm((prev) => ({ ...prev, receiveAmount: formatted }));
    }
  }, [
    open,
    form.amount,
    form.currencyCode,
    form.receiveAmount,
    form.receiveCurrencyCode,
    form.rate,
    form.rateBase,
    resultDirty,
  ]);

  useEffect(() => {
    if (!open || descriptionDirty) return;
    const next = buildTransferDescription(t.desk, {
      fromName: form.fromCustomerLabel,
      toName: form.toCustomerLabel,
      amount: form.amount,
      currency: form.currencyCode,
      receiveAmount: form.receiveAmount,
      receiveCurrency: form.receiveCurrencyCode,
    });
    setForm((prev) =>
      prev.description === next ? prev : { ...prev, description: next },
    );
  }, [
    open,
    descriptionDirty,
    form.amount,
    form.currencyCode,
    form.receiveAmount,
    form.receiveCurrencyCode,
    form.fromCustomerLabel,
    form.toCustomerLabel,
    t.desk,
  ]);

  function softClose() {
    retainDraft();
    clearSuggestState();
    setError(null);
    onClose();
  }

  function resetForm(keepOpen: boolean) {
    discardDraft();
    const defaultCcy = pickDefaultCurrency(currencies) || form.currencyCode;
    templateCursorRef.current = null;
    setReplaceId(null);
    setForm(emptyForm(defaultCcy));
    setVoucherNo("");
    if (keepOpen) {
      void loadDeskVoucher(() => previewDisplayRef("TRANSFER")).then(setVoucherNo);
    }
    setDescriptionDirty(false);
    setResultDirty(false);
    setEmployeeId("");
    setEmployeeName("");
    setError(null);
    clearSuggestState();
    if (!keepOpen) onClose();
    else window.setTimeout(() => amountRef.current?.focus(), 50);
  }

  function pickFrom(c: CustomerListItem) {
    setForm((prev) => ({
      ...prev,
      fromCustomerId: c.id,
      fromCustomerLabel: c.fullName,
    }));
    setShowFromSuggestions(false);
    setFromSuggestions([]);
    setFromHighlight(-1);
    setError(null);
  }

  function pickTo(c: CustomerListItem) {
    setForm((prev) => ({
      ...prev,
      toCustomerId: c.id,
      toCustomerLabel: c.fullName,
    }));
    setShowToSuggestions(false);
    setToSuggestions([]);
    setToHighlight(-1);
    setError(null);
  }

  function onFromKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (
      handleDeskSearchEnter(e, {
        listOpen: showFromSuggestions && fromSuggestions.length > 0,
        canSelect: fromSuggestions.length > 0,
        select: () => {
          const pickIdx = fromHighlight >= 0 ? fromHighlight : 0;
          if (fromSuggestions[pickIdx]) pickFrom(fromSuggestions[pickIdx]);
        },
      })
    ) {
      return;
    }
    if (!showFromSuggestions || fromSuggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFromHighlight((i) => (i + 1) % fromSuggestions.length);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setFromHighlight((i) => (i <= 0 ? fromSuggestions.length - 1 : i - 1));
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setShowFromSuggestions(false);
      setFromHighlight(-1);
    }
  }

  function onToKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (
      handleDeskSearchEnter(e, {
        listOpen: showToSuggestions && toSuggestions.length > 0,
        canSelect: toSuggestions.length > 0,
        select: () => {
          const pickIdx = toHighlight >= 0 ? toHighlight : 0;
          if (toSuggestions[pickIdx]) pickTo(toSuggestions[pickIdx]);
        },
      })
    ) {
      return;
    }
    if (!showToSuggestions || toSuggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setToHighlight((i) => (i + 1) % toSuggestions.length);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setToHighlight((i) => (i <= 0 ? toSuggestions.length - 1 : i - 1));
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setShowToSuggestions(false);
      setToHighlight(-1);
    }
  }

  async function loadPrevious() {
    setError(null);
    try {
      const snap = await getPreviousMovement({
        transactionType: "TRANSFER",
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
    if (!amount || Number(amount.replace(/,/g, "")) <= 0) {
      setError(t.desk.enterAmount);
      amountRef.current?.focus();
      return;
    }
    const converting = currenciesDiffer(form.currencyCode, form.receiveCurrencyCode);
    const receiveAmount = form.receiveAmount.trim();
    if (converting && (!form.rate.trim() || Number(form.rate.replace(/,/g, "")) <= 0)) {
      setError(t.desk.rateRequired);
      return;
    }
    if (!receiveAmount || Number(receiveAmount.replace(/,/g, "")) <= 0) {
      setError(converting ? t.desk.rateRequired : t.desk.enterAmount);
      amountRef.current?.focus();
      return;
    }
    if (!form.fromCustomerId) {
      setError(t.desk.selectSendingCustomer);
      fromWrapRef.current?.querySelector("input")?.focus();
      return;
    }
    if (!form.toCustomerId) {
      setError(t.desk.selectReceivingCustomer);
      toWrapRef.current?.querySelector("input")?.focus();
      return;
    }
    if (form.fromCustomerId === form.toCustomerId) {
      setError(t.desk.sameCustomerTransfer);
      return;
    }

    if (!tryBeginSubmit(submittingRef)) return;
    setSaving(true);
    setError(null);
    try {
      const posted = await transferFunds({
        reference: replaceId
          ? form.reference.trim() || newInternalRef("TR")
          : newInternalRef("TR"),
        senderCustomerId: form.fromCustomerId,
        receiverCustomerId: form.toCustomerId,
        currencyCode: form.currencyCode,
        amount,
        receiveAmount: converting ? receiveAmount : undefined,
        receiveCurrencyCode: converting ? form.receiveCurrencyCode : undefined,
        boardRate: converting ? form.boardRate.trim() || undefined : undefined,
        highCurrencyCode: converting
          ? form.rateBase === "left"
            ? form.currencyCode
            : form.receiveCurrencyCode
          : undefined,
        valueDate: form.valueDate || todayIso(),
        description: appendEmployeeLine(
          form.description.trim() || undefined,
          employeeName,
          t.employees.employee,
        ),
        createdById: session.userId,
        replaceTransactionId: replaceId || undefined,
      });
      onSaved?.();
      if (action === "save") {
        setSuccessMessage(
          `${t.errors.transferSuccess} ${amount} ${form.currencyCode} → ${form.toCustomerLabel} (${txDisplayRef(posted)})`,
        );
        resetForm(false);
      } else {
        resetForm(true);
      }
    } catch (err: unknown) {
      setError(errorMessage(err, t.errors.transferSave));
    } finally {
      endSubmit(submittingRef);
      setSaving(false);
    }
  }

  if (!open && !successMessage) return null;

  const title = replaceId ? t.desk.editTransferTitle : t.desk.transferTitle;

  return (
    <>
      {open ? (
        <Modal title={title} size="xl" onClose={softClose}>
          <div
            className="stack movement-form-compact hawala-form-compact desk-qa-form"
            data-desk-form
            data-qa-tone="transfer"
            onKeyDown={(e) =>
              handleDeskFormKeyDown(e, {
                busy: saving,
                onSubmit: () => void submit("save"),
              })
            }
          >
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
            leftAmount={form.amount}
            leftCurrency={form.currencyCode}
            rightAmount={form.receiveAmount}
            rightCurrency={form.receiveCurrencyCode}
            rate={form.rate}
            rateBase={form.rateBase}
            boardRate={form.boardRate}
            amountRef={amountRef}
            labels={{
              leftAmount: t.desk.sendAmountLabel,
              rightAmount: t.desk.receiveAmountLabel,
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
            onLeftAmount={(amount) => {
              setResultDirty(false);
              setForm((prev) => ({ ...prev, amount }));
              setError(null);
            }}
            onLeftCurrency={(currencyCode) => {
              // Sender currency change: treat receive as same currency until user
              // explicitly picks a different receive currency (which shows rate ×/÷).
              setResultDirty(false);
              setForm((prev) => ({
                ...prev,
                currencyCode,
                receiveCurrencyCode: currencyCode,
                rate: "",
                boardRate: "",
                receiveAmount: prev.amount,
              }));
              setError(null);
            }}
            onRightAmount={(receiveAmount) => {
              setResultDirty(true);
              setForm((prev) => ({ ...prev, receiveAmount }));
              setError(null);
            }}
            onRightCurrency={(receiveCurrencyCode) => {
              setResultDirty(false);
              setForm((prev) => ({
                ...prev,
                receiveCurrencyCode,
                // Clear stale rate when switching back to same-currency transfer.
                ...(receiveCurrencyCode.trim().toUpperCase() ===
                prev.currencyCode.trim().toUpperCase()
                  ? { rate: "", boardRate: "", receiveAmount: prev.amount }
                  : {}),
              }));
              setError(null);
            }}
            onRate={(rate) => {
              setResultDirty(false);
              setForm((prev) => ({ ...prev, rate }));
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

          <div className="movement-form-party-row transfer-customers-row">
          <CustomerPicker
            label={t.transfers.fromCustomer}
            value={form.fromCustomerLabel}
            customerId={form.fromCustomerId}
            placeholder={t.customers.searchPlaceholder}
            wrapRef={fromWrapRef}
            suggestions={fromSuggestions}
            showSuggestions={showFromSuggestions}
            suggestBusy={fromSuggestBusy}
            highlight={fromHighlight}
            emptyFiltered={t.customers.emptyFiltered}
            loadingLabel={t.common.loading}
            onChangeLabel={(v) => {
              setForm((prev) => ({
                ...prev,
                fromCustomerId: "",
                fromCustomerLabel: v,
              }));
              setShowFromSuggestions(true);
              setError(null);
            }}
            onFocus={() => {
              if (!form.fromCustomerId) setShowFromSuggestions(true);
            }}
            onKeyDown={onFromKeyDown}
            onPick={pickFrom}
            onHighlight={setFromHighlight}
          />

          <CustomerPicker
            label={t.transfers.toCustomer}
            value={form.toCustomerLabel}
            customerId={form.toCustomerId}
            placeholder={t.customers.searchPlaceholder}
            wrapRef={toWrapRef}
            suggestions={toSuggestions}
            showSuggestions={showToSuggestions}
            suggestBusy={toSuggestBusy}
            highlight={toHighlight}
            emptyFiltered={t.customers.emptyFiltered}
            loadingLabel={t.common.loading}
            onChangeLabel={(v) => {
              setForm((prev) => ({
                ...prev,
                toCustomerId: "",
                toCustomerLabel: v,
              }));
              setShowToSuggestions(true);
              setError(null);
            }}
            onFocus={() => {
              if (!form.toCustomerId) setShowToSuggestions(true);
            }}
            onKeyDown={onToKeyDown}
            onPick={pickTo}
            onHighlight={setToHighlight}
          />
          </div>

          <EmployeeField
            valueId={employeeId}
            onChange={(id, name) => {
              setEmployeeId(id);
              setEmployeeName(name);
            }}
            disabled={saving}
          />

          <label>
            {t.desk.movementDescription}
            <textarea
              rows={1}
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
