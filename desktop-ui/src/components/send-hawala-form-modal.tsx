import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import {
  getHawala,
  listCurrenciesPage,
  listCustomersPage,
  listHawalaPage,
  receiveHawala,
  sendHawala,
  type CurrencyListItem,
  type CustomerListItem,
  type HawalaDetail,
} from "@desktop/api";
import { ModalFormActions } from "@desktop/components/modal-form-actions";
import { useAuth } from "@desktop/auth";
import { useLocale, useT } from "@desktop/i18n";
import {
  endSubmit,
  errorMessage,
  technicalErrorText,
  todayIso,
  tryBeginSubmit,
} from "@desktop/lib/datetime";
import { notifyMovementSaved } from "@desktop/lib/desk-events";
import { pickDefaultCurrency } from "@desktop/lib/default-currency";
import { useDeskFormDraftRetain } from "@desktop/lib/desk-form-draft";
import {
  handleDeskFormKeyDown,
  handleDeskSearchEnter,
} from "@desktop/lib/form-keyboard";
import { buildHawalaDescription } from "@desktop/lib/movement-description";
import { hawalaNumberRef } from "@desktop/lib/tx-ref";
import { requirePositiveAmount } from "@desktop/lib/validation/amount";
import { normalizeAmountInput } from "@desktop/lib/western-digits";
import {
  formatMoney,
  isSimpleDeskHawala,
  parseMoney,
} from "@desktop/pages/hawala-helpers";
import { AmountInput } from "@desktop/ui/amount-input";
import { CurrencyPicker } from "@desktop/ui/currency-picker";
import { appendEmployeeLine, EmployeeField } from "@desktop/ui/employee-field";
import { Modal } from "@desktop/ui/modal";
import { SuccessModal } from "@desktop/ui/success-modal";

function formatPreviewMoney(n: number): string {
  const s = formatMoney(n);
  const [intPart, frac] = s.split(".");
  const absInt = intPart.replace(/^-/, "");
  const withCommas =
    absInt.length > 3
      ? absInt.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
      : absInt;
  const signed = intPart.startsWith("-") ? `-${withCommas}` : withCommas;
  return frac ? `${signed}.${frac}` : signed;
}

type PartyMode = "walkin" | "customer";
type HawalaDirection = "SEND" | "RECEIVE";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  direction?: HawalaDirection;
  /** HawalaTransfer.id or linked Transaction.id */
  editTransactionId?: string | null;
};

function emptyForm(currency = "") {
  return {
    reference: "",
    valueDate: todayIso(),
    amount: "",
    currencyCode: currency,
    senderMode: "walkin" as PartyMode,
    senderName: "",
    senderCustomerId: "",
    senderLabel: "",
    receiverMode: "walkin" as PartyMode,
    receiverName: "",
    receiverCustomerId: "",
    receiverLabel: "",
    onBehalfOf: "",
    receivingAccount: "",
    commission: "",
    originCity: "Kabul",
    originCountry: "Afghanistan",
    destinationCity: "—",
    destinationCountry: "Afghanistan",
  };
}

type SuggestKind = "sender" | "receiver";

function receivingAccountFromDetail(detail: HawalaDetail): string {
  const partner = (detail.partnerSarafi || "").trim();
  const receiver = (detail.receiverName || "").trim();
  if (partner && partner.toLowerCase() !== receiver.toLowerCase()) {
    return partner;
  }
  return (detail.customerNotes || "").trim();
}

export function SendHawalaFormModal({
  open,
  onClose,
  onSaved,
  direction = "SEND",
  editTransactionId = null,
}: Props) {
  const t = useT();
  const { locale } = useLocale();
  const { session } = useAuth();
  const amountRef = useRef<HTMLInputElement>(null);
  const senderSearchRef = useRef<HTMLLabelElement>(null);
  const receiverSearchRef = useRef<HTMLLabelElement>(null);
  const submittingRef = useRef(false);
  const { retainDraft, discardDraft, shouldRetainDraft } = useDeskFormDraftRetain();

  const [currencies, setCurrencies] = useState<CurrencyListItem[]>([]);
  const [form, setForm] = useState(() => emptyForm());
  const [voucherNo, setVoucherNo] = useState("");
  const [replaceId, setReplaceId] = useState<string | null>(null);
  const [hawalaRecordId, setHawalaRecordId] = useState<string | null>(null);
  const [senderSuggestions, setSenderSuggestions] = useState<CustomerListItem[]>(
    [],
  );
  const [receiverSuggestions, setReceiverSuggestions] = useState<
    CustomerListItem[]
  >([]);
  const [showSenderSuggest, setShowSenderSuggest] = useState(false);
  const [showReceiverSuggest, setShowReceiverSuggest] = useState(false);
  const [senderBusy, setSenderBusy] = useState(false);
  const [receiverBusy, setReceiverBusy] = useState(false);
  const [senderHighlight, setSenderHighlight] = useState(-1);
  const [receiverHighlight, setReceiverHighlight] = useState(-1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [employeeId, setEmployeeId] = useState("");
  const [employeeName, setEmployeeName] = useState("");

  const isSend = direction === "SEND";
  const amountN = parseMoney(form.amount);
  const commissionN = parseMoney(form.commission);
  const netN = amountN > 0 ? amountN - Math.max(0, commissionN) : 0;
  const splitPreview = useMemo(() => {
    if (amountN <= 0) return "";
    const fee = Math.max(0, commissionN);
    return t.hawala.sendSplitPreview
      .replace("{gross}", formatPreviewMoney(amountN))
      .replace("{fee}", formatPreviewMoney(fee))
      .replace("{net}", formatPreviewMoney(Math.max(0, amountN - fee)));
  }, [amountN, commissionN, t.hawala.sendSplitPreview]);

  function clearSuggestState() {
    setSenderSuggestions([]);
    setReceiverSuggestions([]);
    setShowSenderSuggest(false);
    setShowReceiverSuggest(false);
    setSenderHighlight(-1);
    setReceiverHighlight(-1);
  }

  function applyDetail(detail: HawalaDetail, defaultCurrency: string) {
    setHawalaRecordId(detail.id);
    setReplaceId(detail.transactionId || detail.id);
    setVoucherNo(hawalaNumberRef(detail));
    const senderIsCustomer = Boolean(detail.senderCustomerId);
    const receiverIsCustomer = Boolean(detail.receiverCustomerId);
    setForm({
      reference: detail.reference,
      valueDate: String(detail.valueDate).slice(0, 10),
      amount: detail.amount,
      currencyCode: detail.currencyCode || defaultCurrency,
      senderMode: isSend
        ? senderIsCustomer
          ? "customer"
          : "walkin"
        : "walkin",
      senderName:
        isSend && senderIsCustomer ? "" : detail.senderName || "",
      senderCustomerId: detail.senderCustomerId || "",
      senderLabel: isSend
        ? senderIsCustomer
          ? detail.senderName || ""
          : ""
        : detail.senderCustomerId
          ? receivingAccountFromDetail(detail) ||
            detail.partnerSarafi ||
            ""
          : "",
      receiverMode: receiverIsCustomer ? "customer" : "walkin",
      receiverName: detail.receiverName || "",
      receiverCustomerId: detail.receiverCustomerId || "",
      receiverLabel: isSend
        ? receivingAccountFromDetail(detail) ||
          (detail.receiverCustomerId ? detail.partnerSarafi || "" : "")
        : receiverIsCustomer
          ? detail.receiverName || ""
          : "",
      onBehalfOf: detail.customerNotes || "",
      receivingAccount: receivingAccountFromDetail(detail),
      commission: detail.ownCommissionAmount || "",
      originCity: detail.originCity || "Kabul",
      originCountry: detail.originCountry || "Afghanistan",
      destinationCity: detail.destinationCity || "—",
      destinationCountry: detail.destinationCountry || "Afghanistan",
    });
    setEmployeeId("");
    setEmployeeName("");
    setError(null);
    clearSuggestState();
  }

  function pickSender(c: CustomerListItem) {
    setForm((prev) => ({
      ...prev,
      senderMode: isSend ? "customer" : prev.senderMode,
      senderCustomerId: c.id,
      senderLabel: c.fullName,
      senderName: isSend ? "" : prev.senderName,
    }));
    setShowSenderSuggest(false);
    setSenderSuggestions([]);
    setError(null);
  }

  function pickReceiver(c: CustomerListItem) {
    setForm((prev) => ({
      ...prev,
      receiverMode: isSend ? prev.receiverMode : "customer",
      receiverCustomerId: c.id,
      receiverLabel: c.fullName,
      receiverName: isSend ? prev.receiverName : "",
      receivingAccount: isSend ? c.fullName : prev.receivingAccount,
    }));
    setShowReceiverSuggest(false);
    setReceiverSuggestions([]);
    setError(null);
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void listCurrenciesPage({ activeOnly: true, pageSize: 100 })
      .then(async (page) => {
        if (cancelled) return;
        setCurrencies(page.items);
        const currency = pickDefaultCurrency(page.items);

        if (editTransactionId) {
          discardDraft();
          try {
            const detail = await getHawala(editTransactionId);
            if (cancelled) return;
            applyDetail(detail, currency);
            return;
          } catch (err: unknown) {
            if (!cancelled) setError(errorMessage(err));
          }
        }

        if (shouldRetainDraft()) {
          clearSuggestState();
          setError(null);
          return;
        }

        setReplaceId(null);
        setHawalaRecordId(null);
        setVoucherNo("");
        setForm(emptyForm(currency));
        setEmployeeId("");
        setEmployeeName("");
        setError(null);
        clearSuggestState();
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [open, editTransactionId, direction]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => amountRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!senderSearchRef.current?.contains(target)) {
        setShowSenderSuggest(false);
      }
      if (!receiverSearchRef.current?.contains(target)) {
        setShowReceiverSuggest(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open || (isSend && form.senderMode !== "customer")) {
      setSenderSuggestions([]);
      return;
    }
    const q = form.senderLabel.trim();
    if (form.senderCustomerId || q.length < 1) {
      setSenderSuggestions([]);
      setSenderHighlight(-1);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSenderBusy(true);
      void listCustomersPage({
        search: q,
        archiveFilter: "active",
        page: 1,
        pageSize: 12,
      })
        .then((page) => {
          if (cancelled) return;
          setSenderSuggestions(page.items);
          setSenderHighlight(page.items.length > 0 ? 0 : -1);
        })
        .catch(() => {
          if (!cancelled) setSenderSuggestions([]);
        })
        .finally(() => {
          if (!cancelled) setSenderBusy(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, isSend, form.senderMode, form.senderCustomerId, form.senderLabel]);

  useEffect(() => {
    if (!open || (!isSend && form.receiverMode !== "customer")) {
      setReceiverSuggestions([]);
      return;
    }
    const q = form.receiverLabel.trim();
    if (form.receiverCustomerId || q.length < 1) {
      setReceiverSuggestions([]);
      setReceiverHighlight(-1);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setReceiverBusy(true);
      void listCustomersPage({
        search: q,
        archiveFilter: "active",
        page: 1,
        pageSize: 12,
      })
        .then((page) => {
          if (cancelled) return;
          setReceiverSuggestions(page.items);
          setReceiverHighlight(page.items.length > 0 ? 0 : -1);
        })
        .catch(() => {
          if (!cancelled) setReceiverSuggestions([]);
        })
        .finally(() => {
          if (!cancelled) setReceiverBusy(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, isSend, form.receiverMode, form.receiverCustomerId, form.receiverLabel]);

  function onSuggestKeyDown(
    e: ReactKeyboardEvent<HTMLInputElement>,
    kind: SuggestKind,
  ) {
    const suggestions = kind === "sender" ? senderSuggestions : receiverSuggestions;
    const show = kind === "sender" ? showSenderSuggest : showReceiverSuggest;
    const highlight = kind === "sender" ? senderHighlight : receiverHighlight;
    const setHighlight =
      kind === "sender" ? setSenderHighlight : setReceiverHighlight;
    const pick = kind === "sender" ? pickSender : pickReceiver;

    if (
      handleDeskSearchEnter(e, {
        listOpen: show && suggestions.length > 0,
        canSelect: suggestions.length > 0,
        select: () => {
          const pickIdx = highlight >= 0 ? highlight : 0;
          if (suggestions[pickIdx]) pick(suggestions[pickIdx]);
        },
      })
    ) {
      return;
    }
    if (!show || suggestions.length === 0) return;
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
      if (kind === "sender") setShowSenderSuggest(false);
      else setShowReceiverSuggest(false);
      setHighlight(-1);
    }
  }

  function softClose() {
    retainDraft();
    clearSuggestState();
    setError(null);
    onClose();
  }

  function resetForm(keepOpen: boolean) {
    discardDraft();
    const currency = pickDefaultCurrency(currencies) || form.currencyCode;
    setForm(emptyForm(currency));
    setVoucherNo("");
    setError(null);
    setReplaceId(null);
    setHawalaRecordId(null);
    setEmployeeId("");
    setEmployeeName("");
    clearSuggestState();
    if (!keepOpen) onClose();
    else window.setTimeout(() => amountRef.current?.focus(), 50);
  }

  async function loadPrevious() {
    setError(null);
    try {
      const page = await listHawalaPage({
        direction,
        archiveFilter: "active",
        page: 1,
        pageSize: 50,
      });
      const items = page.items;
      if (!items.length) {
        setError(t.desk.noPreviousRecord);
        return;
      }
      let start = 0;
      if (hawalaRecordId) {
        const found = items.findIndex((row) => row.id === hawalaRecordId);
        start = found >= 0 ? found + 1 : 0;
      }
      let chosen: HawalaDetail | null = null;
      for (let i = start; i < items.length; i += 1) {
        const detail = await getHawala(items[i].id);
        if (isSimpleDeskHawala(detail)) {
          chosen = detail;
          break;
        }
      }
      if (!chosen) {
        setError(t.desk.noPreviousRecord);
        return;
      }
      const currency = form.currencyCode || pickDefaultCurrency(currencies);
      applyDetail(chosen, currency);
    } catch (err: unknown) {
      setError(errorMessage(err));
    }
  }

  async function submit(action: "save" | "new") {
    if (!session) return;

    const hawalaNumber = voucherNo.trim() || form.reference.trim();
    if (!hawalaNumber) {
      setError(t.hawala.hawalaNumberRequired);
      return;
    }

    const amountCheck = requirePositiveAmount(form.amount);
    if (!amountCheck.ok) {
      setError(
        amountCheck.error === "required"
          ? t.hawala.amountRequired
          : t.common.invalidAmount,
      );
      amountRef.current?.focus();
      return;
    }
    if (!form.currencyCode) {
      setError(t.hawala.currencyRequired);
      return;
    }
    if (isSend) {
      if (form.senderMode === "walkin" && !form.senderName.trim()) {
        setError(t.hawala.senderNameRequired);
        return;
      }
      if (form.senderMode === "customer" && !form.senderCustomerId) {
        setError(t.desk.selectCustomerRequired);
        senderSearchRef.current?.querySelector("input")?.focus();
        return;
      }
      if (!form.receiverName.trim()) {
        setError(t.hawala.receiverNameRequired);
        return;
      }
      if (!form.receiverCustomerId) {
        setError(t.hawala.receivingAccountRequired);
        receiverSearchRef.current?.querySelector("input")?.focus();
        return;
      }
      if (
        form.senderMode === "customer" &&
        form.senderCustomerId === form.receiverCustomerId
      ) {
        setError(t.desk.selectCustomerRequired);
        return;
      }
    } else {
      if (!form.senderName.trim()) {
        setError(t.hawala.senderNameRequired);
        return;
      }
      if (!form.senderCustomerId) {
        setError(t.hawala.sourceCustomerAccountRequired);
        senderSearchRef.current?.querySelector("input")?.focus();
        return;
      }
      if (form.receiverMode === "walkin" && !form.receiverName.trim()) {
        setError(t.hawala.receiverNameRequired);
        return;
      }
      if (form.receiverMode === "customer" && !form.receiverCustomerId) {
        setError(t.desk.selectCustomerRequired);
        receiverSearchRef.current?.querySelector("input")?.focus();
        return;
      }
      if (
        form.receiverMode === "customer" &&
        form.senderCustomerId === form.receiverCustomerId
      ) {
        setError(t.desk.selectCustomerRequired);
        return;
      }
    }
    if (commissionN > 0 && commissionN >= amountN) {
      setError(t.hawala.commissionMustBeLess);
      return;
    }

    if (!tryBeginSubmit(submittingRef)) return;
    setSaving(true);
    setError(null);
    try {
      const ownCommission =
        commissionN > 0
          ? normalizeAmountInput(form.commission).trim()
          : null;
      const senderDisplay = isSend
        ? form.senderMode === "customer"
          ? form.senderLabel.trim() || form.senderName.trim()
          : form.senderName.trim()
        : form.senderName.trim();
      const receiverDisplay = isSend
        ? form.receiverName.trim() || form.receiverLabel.trim()
        : form.receiverMode === "customer"
          ? form.receiverLabel.trim() || form.receiverName.trim()
          : form.receiverName.trim();
      const amountMajor = amountCheck.value;
      const description = buildHawalaDescription(t.hawala, {
        senderName: senderDisplay,
        receiverName: receiverDisplay,
        amount: amountMajor,
        currency: form.currencyCode,
        viaAccount: isSend ? form.receiverLabel.trim() || null : null,
        locale,
      });
      const payload = {
        reference: hawalaNumber,
        currencyCode: form.currencyCode,
        amount: amountMajor,
        valueDate: form.valueDate || todayIso(),
        createdById: session.userId,
        originCity: form.originCity || "Kabul",
        originCountry: form.originCountry || "Afghanistan",
        destinationCity: form.destinationCity || "—",
        destinationCountry: form.destinationCountry || "Afghanistan",
        senderName: isSend
          ? form.senderMode === "walkin"
            ? form.senderName.trim()
            : null
          : form.senderName.trim(),
        senderCustomerId: isSend
          ? form.senderMode === "customer"
            ? form.senderCustomerId
            : null
          : form.senderCustomerId || null,
        receiverName: isSend
          ? form.receiverName.trim()
          : form.receiverMode === "walkin"
            ? form.receiverName.trim()
            : null,
        receiverCustomerId: isSend
          ? form.receiverCustomerId || null
          : form.receiverMode === "customer"
            ? form.receiverCustomerId
            : null,
        customerNotes: null,
        receivingAccount: isSend ? form.receiverLabel.trim() || null : null,
        description,
        notes:
          appendEmployeeLine(undefined, employeeName, t.employees.employee) ||
          null,
        ownCommissionAmount: ownCommission,
        ownCommissionMode: "FIXED" as const,
        commissionCurrencyCode: form.currencyCode,
        replaceTransactionId: replaceId || undefined,
      };

      const result = isSend
        ? await sendHawala(payload)
        : await receiveHawala(payload);

      notifyMovementSaved();
      onSaved?.();
      if (action === "save") {
        setSuccessMessage(
          t.hawala.postedSuccess
            .replace("{direction}", isSend ? t.hawala.send : t.hawala.receive)
            .replace("{reference}", hawalaNumberRef(result)),
        );
        resetForm(false);
      } else {
        resetForm(true);
      }
    } catch (err: unknown) {
      const msg = technicalErrorText(err);
      if (/phone number is already used/i.test(msg)) {
        setError(t.hawala.phoneUnique);
      } else if (/hawala number|reference .* already exists/i.test(msg)) {
        setError(t.hawala.hawalaNumberUnique);
      } else if (/commission must be less/i.test(msg)) {
        setError(t.hawala.commissionMustBeLess);
      } else if (/must be different/i.test(msg)) {
        setError(t.desk.selectCustomerRequired);
      } else {
        setError(errorMessage(err, t.errors.hawalaSave));
      }
    } finally {
      endSubmit(submittingRef);
      setSaving(false);
    }
  }

  if (!open && !successMessage) return null;

  const titleBase = isSend ? t.dashboard.sendHawala : t.dashboard.receiveHawala;
  const title = replaceId
    ? `${t.common.editAction} — ${titleBase}`
    : titleBase;

  function customerSuggestList(
    kind: SuggestKind,
    suggestions: CustomerListItem[],
    busy: boolean,
    highlight: number,
    pick: (c: CustomerListItem) => void,
  ) {
    return (
      <ul className="customer-suggest" role="listbox">
        {busy && suggestions.length === 0 ? (
          <li className="customer-suggest-empty muted">{t.common.loading}</li>
        ) : null}
        {!busy && suggestions.length === 0 ? (
          <li className="customer-suggest-empty muted">
            {t.customers.emptyFiltered}
          </li>
        ) : null}
        {suggestions.map((c, idx) => (
          <li key={c.id} role="option" aria-selected={idx === highlight}>
            <button
              type="button"
              tabIndex={-1}
              className={`customer-suggest-item${idx === highlight ? " is-active" : ""}`}
              onMouseEnter={() =>
                kind === "sender"
                  ? setSenderHighlight(idx)
                  : setReceiverHighlight(idx)
              }
              onClick={() => pick(c)}
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
    );
  }

  return (
    <>
      {open ? (
        <Modal title={title} size="xl" onClose={softClose}>
          <div
            className="stack movement-form-compact desk-qa-form"
            data-desk-form
            data-qa-tone="send-hawala"
            onKeyDown={(e) =>
              handleDeskFormKeyDown(e, {
                busy: saving,
                onSubmit: () => void submit("save"),
              })
            }
          >
            <div className="fx-simple-top">
              <label className="desk-ref-field">
                <span>{t.desk.hawalaNumber} *</span>
                <input
                  className="desk-ref-input"
                  value={voucherNo}
                  required
                  autoComplete="off"
                  onChange={(e) => {
                    const next = e.target.value;
                    setVoucherNo(next);
                    setForm((prev) => ({ ...prev, reference: next }));
                    setError(null);
                  }}
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

            <div className="money-ccy-row">
              <label className="money-ccy-amount">
                <span>{t.common.amount} *</span>
                <AmountInput
                  ref={amountRef}
                  value={form.amount}
                  placeholder={t.common.amountPlaceholder}
                  onValueChange={(v) => {
                    setForm((prev) => ({ ...prev, amount: v }));
                    setError(null);
                  }}
                />
              </label>
              <CurrencyPicker
                label={t.common.currency}
                required
                currencies={currencies}
                value={form.currencyCode}
                emptyLabel={t.common.select}
                searchPlaceholder={t.common.search}
                onCurrenciesChange={setCurrencies}
                onChange={(code) => {
                  setForm((prev) => ({ ...prev, currencyCode: code }));
                  setError(null);
                }}
              />
            </div>

            {isSend ? (
              <>
            <div>
              <div className="muted" style={{ marginBottom: "0.35rem", fontSize: "var(--text-sm)" }}>
                {t.hawala.sender} *
              </div>
              <div
                className="hawala-mode-toggle"
                role="group"
                aria-label={t.hawala.sender}
                data-desk-choice-group
              >
                <button
                  type="button"
                  className={
                    form.senderMode === "customer"
                      ? "hawala-mode active"
                      : "hawala-mode"
                  }
                  aria-pressed={form.senderMode === "customer"}
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      senderMode: "customer",
                      senderName: "",
                    }))
                  }
                >
                  {t.hawala.existingCustomer}
                </button>
                <button
                  type="button"
                  className={
                    form.senderMode === "walkin"
                      ? "hawala-mode active"
                      : "hawala-mode"
                  }
                  aria-pressed={form.senderMode === "walkin"}
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      senderMode: "walkin",
                      senderCustomerId: "",
                      senderLabel: "",
                    }))
                  }
                >
                  {t.desk.walkIn}
                </button>
              </div>
            </div>

            {form.senderMode === "walkin" ? (
              <label>
                <span>{t.hawala.senderName} *</span>
                <input
                  value={form.senderName}
                  placeholder={t.desk.walkingCustomer}
                  onChange={(e) => {
                    setForm((prev) => ({
                      ...prev,
                      senderName: e.target.value,
                    }));
                    setError(null);
                  }}
                />
              </label>
            ) : (
              <label ref={senderSearchRef} className="customer-search-wrap">
                {t.hawala.sender} *
                <input
                  value={form.senderLabel}
                  placeholder={t.customers.searchPlaceholder}
                  autoComplete="off"
                  aria-autocomplete="list"
                  aria-expanded={
                    showSenderSuggest && senderSuggestions.length > 0
                  }
                  onChange={(e) => {
                    setForm((prev) => ({
                      ...prev,
                      senderCustomerId: "",
                      senderLabel: e.target.value,
                    }));
                    setShowSenderSuggest(true);
                    setError(null);
                  }}
                  onFocus={() => {
                    if (!form.senderCustomerId) setShowSenderSuggest(true);
                  }}
                  onKeyDown={(e) => onSuggestKeyDown(e, "sender")}
                />
                {showSenderSuggest &&
                form.senderLabel.trim().length > 0 &&
                !form.senderCustomerId
                  ? customerSuggestList(
                      "sender",
                      senderSuggestions,
                      senderBusy,
                      senderHighlight,
                      pickSender,
                    )
                  : null}
              </label>
            )}

                <label>
                  <span>{t.hawala.receiver} *</span>
                  <input
                    value={form.receiverName}
                    required
                    onChange={(e) => {
                      setForm((prev) => ({
                        ...prev,
                        receiverName: e.target.value,
                      }));
                      setError(null);
                    }}
                  />
                </label>
                <label ref={receiverSearchRef} className="customer-search-wrap">
                  {t.hawala.receivingAccount} *
                  <input
                    value={form.receiverLabel}
                    required
                    placeholder={t.customers.searchPlaceholder}
                    autoComplete="off"
                    aria-autocomplete="list"
                    aria-expanded={
                      showReceiverSuggest && receiverSuggestions.length > 0
                    }
                    onChange={(e) => {
                      setForm((prev) => ({
                        ...prev,
                        receiverCustomerId: "",
                        receiverLabel: e.target.value,
                        receivingAccount: e.target.value,
                      }));
                      setShowReceiverSuggest(true);
                      setError(null);
                    }}
                    onFocus={() => {
                      if (!form.receiverCustomerId) setShowReceiverSuggest(true);
                    }}
                    onKeyDown={(e) => onSuggestKeyDown(e, "receiver")}
                  />
                  {showReceiverSuggest &&
                  form.receiverLabel.trim().length > 0 &&
                  !form.receiverCustomerId
                    ? customerSuggestList(
                        "receiver",
                        receiverSuggestions,
                        receiverBusy,
                        receiverHighlight,
                        pickReceiver,
                      )
                    : null}
                </label>
              </>
            ) : (
              <>
                <label>
                  <span>{t.hawala.sender} *</span>
                  <input
                    value={form.senderName}
                    required
                    onChange={(e) => {
                      setForm((prev) => ({
                        ...prev,
                        senderName: e.target.value,
                      }));
                      setError(null);
                    }}
                  />
                </label>
            <div>
              <div className="muted" style={{ marginBottom: "0.35rem", fontSize: "var(--text-sm)" }}>
                {t.hawala.receiver} *
              </div>
              <div
                className="hawala-mode-toggle"
                role="group"
                aria-label={t.hawala.receiver}
                data-desk-choice-group
              >
                <button
                  type="button"
                  className={
                    form.receiverMode === "customer"
                      ? "hawala-mode active"
                      : "hawala-mode"
                  }
                  aria-pressed={form.receiverMode === "customer"}
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      receiverMode: "customer",
                      receiverName: "",
                    }))
                  }
                >
                  {t.hawala.existingCustomer}
                </button>
                <button
                  type="button"
                  className={
                    form.receiverMode === "walkin"
                      ? "hawala-mode active"
                      : "hawala-mode"
                  }
                  aria-pressed={form.receiverMode === "walkin"}
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      receiverMode: "walkin",
                      receiverCustomerId: "",
                      receiverLabel: "",
                    }))
                  }
                >
                  {t.desk.walkIn}
                </button>
              </div>
            </div>

            {form.receiverMode === "walkin" ? (
              <label>
                <span>{t.hawala.walkInName} *</span>
                <input
                  value={form.receiverName}
                  placeholder={t.desk.walkingCustomer}
                  onChange={(e) => {
                    setForm((prev) => ({
                      ...prev,
                      receiverName: e.target.value,
                    }));
                    setError(null);
                  }}
                />
              </label>
            ) : (
              <label ref={receiverSearchRef} className="customer-search-wrap">
                {t.hawala.receiver} *
                <input
                  value={form.receiverLabel}
                  placeholder={t.customers.searchPlaceholder}
                  autoComplete="off"
                  aria-autocomplete="list"
                  aria-expanded={
                    showReceiverSuggest && receiverSuggestions.length > 0
                  }
                  onChange={(e) => {
                    setForm((prev) => ({
                      ...prev,
                      receiverCustomerId: "",
                      receiverLabel: e.target.value,
                    }));
                    setShowReceiverSuggest(true);
                    setError(null);
                  }}
                  onFocus={() => {
                    if (!form.receiverCustomerId) setShowReceiverSuggest(true);
                  }}
                  onKeyDown={(e) => onSuggestKeyDown(e, "receiver")}
                />
                {showReceiverSuggest &&
                form.receiverLabel.trim().length > 0 &&
                !form.receiverCustomerId
                  ? customerSuggestList(
                      "receiver",
                      receiverSuggestions,
                      receiverBusy,
                      receiverHighlight,
                      pickReceiver,
                    )
                  : null}
              </label>
            )}

                <label ref={senderSearchRef} className="customer-search-wrap">
                  {t.hawala.sourceCustomerAccount} *
                  <input
                    value={form.senderLabel}
                    required
                    placeholder={t.customers.searchPlaceholder}
                    autoComplete="off"
                    aria-autocomplete="list"
                    aria-expanded={
                      showSenderSuggest && senderSuggestions.length > 0
                    }
                    onChange={(e) => {
                      setForm((prev) => ({
                        ...prev,
                        senderCustomerId: "",
                        senderLabel: e.target.value,
                      }));
                      setShowSenderSuggest(true);
                      setError(null);
                    }}
                    onFocus={() => {
                      if (!form.senderCustomerId) setShowSenderSuggest(true);
                    }}
                    onKeyDown={(e) => onSuggestKeyDown(e, "sender")}
                  />
                  {showSenderSuggest &&
                  form.senderLabel.trim().length > 0 &&
                  !form.senderCustomerId
                    ? customerSuggestList(
                        "sender",
                        senderSuggestions,
                        senderBusy,
                        senderHighlight,
                        pickSender,
                      )
                    : null}
                </label>
              </>
            )}

            <label>
              <span>{t.hawala.ourCommission}</span>
              <AmountInput
                value={form.commission}
                placeholder="0"
                onValueChange={(v) => {
                  setForm((prev) => ({ ...prev, commission: v }));
                  setError(null);
                }}
              />
            </label>

            {splitPreview ? (
              <p className="hawala-send-split-preview" aria-live="polite">
                {splitPreview}
                {form.currencyCode ? ` ${form.currencyCode}` : ""}
              </p>
            ) : null}

            {amountN > 0 && commissionN < amountN ? (
              <p className="muted" style={{ margin: 0 }}>
                {t.hawala.receiverGets}{" "}
                <strong>
                  {formatPreviewMoney(netN)}
                  {form.currencyCode ? ` ${form.currencyCode}` : ""}
                </strong>
              </p>
            ) : null}

            {netN < 0 ||
            (commissionN > 0 && commissionN >= amountN && amountN > 0) ? (
              <p className="muted" style={{ margin: 0 }}>
                {t.hawala.commissionMustBeLess}
              </p>
            ) : null}

            <EmployeeField
              valueId={employeeId}
              onChange={(id, name) => {
                setEmployeeId(id);
                setEmployeeName(name);
              }}
              disabled={saving}
            />

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
        />
      ) : null}
    </>
  );
}
