import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import {
  getHawala,
  getPartner,
  listCurrenciesPage,
  listCustomersPage,
  listHawalaPage,
  listPartners,
  receiveHawala,
  sendHawala,
  type CurrencyListItem,
  type CustomerListItem,
  type HawalaDetail,
  type PartnerListItem,
} from "@desktop/api";
import { useAuth } from "@desktop/auth";
import { useLocale, useT } from "@desktop/i18n";
import {
  endSubmit,
  errorMessage,
  technicalErrorText,
  todayIso,
  tryBeginSubmit,
} from "@desktop/lib/datetime";
import { pickDefaultCurrency } from "@desktop/lib/default-currency";
import {
  handleDeskFormKeyDown,
  handleDeskSearchEnter,
} from "@desktop/lib/form-keyboard";
import { buildHawalaDescription } from "@desktop/lib/movement-description";
import { normalizeAmountInput } from "@desktop/lib/western-digits";
import { hawalaNumberRef } from "@desktop/lib/tx-ref";
import { resolveCommission } from "@desktop/pages/hawala-helpers";
import { ModalFormActions } from "@desktop/components/modal-form-actions";
import { CurrencyPicker } from "@desktop/ui/currency-picker";
import { appendEmployeeLine, EmployeeField } from "@desktop/ui/employee-field";
import { Modal } from "@desktop/ui/modal";
import { SearchableSelect } from "@desktop/ui/searchable-select";
import { SuccessModal } from "@desktop/ui/success-modal";

export type HawalaDirection = "SEND" | "RECEIVE";

/** Which currency is the "1 X = ? Y" base of the quoted rate. */
type RateBase = "send" | "receive";
type PartyMode = "walkin" | "customer";

type Props = {
  open: boolean;
  direction: HawalaDirection;
  onClose: () => void;
  onSaved?: () => void;
  /** Open in edit mode for this HAWALA transaction id */
  editTransactionId?: string | null;
};

function parseNum(raw: string): number | null {
  const n = Number(String(raw).replace(/,/g, "").trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Round money and add thousand separators when the integer part has 4+ digits. */
function formatAmount(n: number, places = 2): string {
  if (!Number.isFinite(n)) return "";
  const factor = 10 ** Math.min(Math.max(places, 0), 8);
  const rounded = Math.round(n * factor) / factor;
  const [intPart, fracPart] = String(rounded).split(".");
  const absInt = intPart.replace(/^-/, "");
  const withCommas =
    absInt.length > 3
      ? absInt.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
      : absInt;
  const signed = intPart.startsWith("-") ? `-${withCommas}` : withCommas;
  if (fracPart != null && Number(fracPart) !== 0) {
    return `${signed}.${fracPart}`;
  }
  // Keep trailing .00 stripped; whole numbers stay clean.
  return signed;
}

/**
 * Convert send → receive using quoted rate "1 base = rate quote".
 * - base = send    → receive = send × rate
 * - base = receive → receive = send ÷ rate
 */
function sendToReceive(
  send: number,
  rate: number,
  rateBase: RateBase,
): number | null {
  if (send <= 0 || rate <= 0) return null;
  return rateBase === "send" ? send * rate : send / rate;
}

function emptyForm(sendCurrency = "", receiveCurrency = "") {
  return {
    reference: "",
    valueDate: todayIso(),
    partnerId: "",
    partyMode: "walkin" as PartyMode,
    customerId: "",
    customerLabel: "",
    walkInName: "",
    walkInPhone: "",
    otherPartyName: "",
    otherPartyPhone: "",
    city: "",
    country: "Afghanistan",
    sendAmount: "",
    sendCurrency,
    receiveAmount: "",
    receiveCurrency: receiveCurrency || sendCurrency,
    rate: "",
    rateBase: "send" as RateBase,
    notes: "",
    ownCommissionMode: "FIXED" as "FIXED" | "PERCENT",
    ownCommission: "",
    partnerCommissionMode: "FIXED" as "FIXED" | "PERCENT",
    partnerCommission: "",
    commissionCurrency: sendCurrency,
  };
}

export function HawalaFormModal({
  open,
  direction,
  onClose,
  onSaved,
  editTransactionId = null,
}: Props) {
  const t = useT();
  const { locale } = useLocale();
  const { session } = useAuth();
  const amountRef = useRef<HTMLInputElement>(null);
  const searchWrapRef = useRef<HTMLLabelElement>(null);
  const submittingRef = useRef(false);

  const [currencies, setCurrencies] = useState<CurrencyListItem[]>([]);
  const [partners, setPartners] = useState<PartnerListItem[]>([]);
  const [form, setForm] = useState(() => emptyForm());
  const [voucherNo, setVoucherNo] = useState("");
  const [replaceId, setReplaceId] = useState<string | null>(null);
  /** HawalaTransfer id — used by Previous to step older records. */
  const [hawalaRecordId, setHawalaRecordId] = useState<string | null>(null);
  const [activeDirection, setActiveDirection] =
    useState<HawalaDirection>(direction);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [lastEdited, setLastEdited] = useState<"send" | "rate" | "receive">(
    "send",
  );
  const [suggestions, setSuggestions] = useState<CustomerListItem[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [employeeId, setEmployeeId] = useState("");
  const [employeeName, setEmployeeName] = useState("");

  const isSend = activeDirection === "SEND";
  const converting =
    !!form.sendCurrency &&
    !!form.receiveCurrency &&
    form.sendCurrency !== form.receiveCurrency;

  const partyLabel = isSend ? t.hawala.sender : t.hawala.receiver;
  const otherPartyLabel = isSend ? t.hawala.receiverAbroad : t.hawala.sender;

  const rateOpHint = useMemo(() => {
    const send = form.sendCurrency || "—";
    const receive = form.receiveCurrency || "—";
    if (form.rateBase === "send") {
      return t.hawala.rateOpMultiplyHint
        .replace("{send}", send)
        .replace("{receive}", receive);
    }
    return t.hawala.rateOpDivideHint
      .replace("{send}", send)
      .replace("{receive}", receive);
  }, [
    form.rateBase,
    form.receiveCurrency,
    form.sendCurrency,
    t.hawala.rateOpDivideHint,
    t.hawala.rateOpMultiplyHint,
  ]);

  const ownCommissionResolved = useMemo(
    () => resolveCommission(form.sendAmount, "FIXED", form.ownCommission),
    [form.sendAmount, form.ownCommission],
  );
  const partnerCommissionResolved = useMemo(
    () =>
      resolveCommission(form.sendAmount, "FIXED", form.partnerCommission),
    [form.sendAmount, form.partnerCommission],
  );

  const partnerOptions = useMemo(
    () => [
      { value: "", label: t.hawala.selectPartner },
      ...partners.map((p) => ({
        value: p.id,
        label: p.name,
        keywords: [p.city, p.country, p.phone].filter(Boolean).join(" "),
      })),
    ],
    [partners, t.hawala.selectPartner],
  );

  function clearSuggestState() {
    setSuggestions([]);
    setShowSuggestions(false);
    setHighlight(-1);
  }

  function applyHawalaDetail(
    detail: HawalaDetail,
    defaults: { send: string; receive: string },
  ) {
    const dir =
      detail.direction.toUpperCase() === "RECEIVE" ? "RECEIVE" : "SEND";
    setActiveDirection(dir);
    setHawalaRecordId(detail.id);
    setReplaceId(detail.transactionId || detail.id);
    setVoucherNo(hawalaNumberRef(detail));
    setEmployeeId("");
    setEmployeeName("");

    const localCustomerId =
      dir === "SEND" ? detail.senderCustomerId : detail.receiverCustomerId;
    const localName = dir === "SEND" ? detail.senderName : detail.receiverName;
    const localPhone =
      dir === "SEND" ? detail.senderPhone : detail.receiverPhone;
    const otherName =
      dir === "SEND" ? detail.receiverName : detail.senderName;
    const otherPhone =
      dir === "SEND" ? detail.receiverPhone : detail.senderPhone;
    const city =
      dir === "SEND" ? detail.destinationCity : detail.originCity;
    const country =
      dir === "SEND" ? detail.destinationCountry : detail.originCountry;

    const sendCcy = detail.currencyCode || defaults.send;
    const receiveCcy =
      detail.receiveCurrencyCode || detail.currencyCode || defaults.receive;

    setForm({
      reference: detail.reference,
      valueDate: String(detail.valueDate).slice(0, 10),
      partnerId: detail.partnerSarafiId || "",
      partyMode: localCustomerId ? "customer" : "walkin",
      customerId: localCustomerId || "",
      customerLabel: localCustomerId ? localName || "" : "",
      walkInName: localCustomerId ? "" : localName || "",
      walkInPhone: localPhone || "",
      otherPartyName: otherName || "",
      otherPartyPhone: otherPhone || "",
      city: city || "",
      country: country || "",
      sendAmount: detail.amount,
      sendCurrency: sendCcy,
      receiveAmount: detail.receiveAmount || "",
      receiveCurrency: receiveCcy,
      rate: detail.exchangeRate || "",
      rateBase: "send",
      notes: detail.notes || "",
      ownCommissionMode: "FIXED",
      ownCommission: detail.ownCommissionAmount || "",
      partnerCommissionMode: "FIXED",
      partnerCommission: detail.partnerCommissionAmount || "",
      commissionCurrency: sendCcy,
    });
    setLastEdited("send");
    setError(null);
    clearSuggestState();
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void Promise.all([
      listCurrenciesPage({ activeOnly: true, pageSize: 100 }),
      listPartners(),
    ])
      .then(async ([page, partnerList]) => {
        if (cancelled) return;
        setCurrencies(page.items);
        setPartners(partnerList);
        const send = pickDefaultCurrency(page.items);
        const receive =
          page.items.find((c) => c.code !== send)?.code || send;

        if (editTransactionId) {
          try {
            const detail = await getHawala(editTransactionId);
            if (cancelled) return;
            applyHawalaDetail(detail, { send, receive });
            return;
          } catch (err: unknown) {
            if (!cancelled) setError(errorMessage(err));
          }
        }

        setActiveDirection(direction);
        setReplaceId(null);
        setHawalaRecordId(null);
        setEmployeeId("");
        setEmployeeName("");
        setVoucherNo("");
        setForm(emptyForm(send, receive));
        setLastEdited("send");
        setError(null);
        clearSuggestState();
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [open, direction, editTransactionId]);

  async function selectPartner(partnerId: string) {
    const p = partners.find((x) => x.id === partnerId);
    setForm((prev) => ({
      ...prev,
      partnerId,
      country: prev.country || p?.country || "",
      city: prev.city || p?.city || "",
    }));
    setError(null);
    if (!partnerId) return;
    try {
      const detail = await getPartner(partnerId);
      if (!detail.commissionEnabled) return;
      setForm((prev) => {
        if (prev.partnerId !== partnerId) return prev;
        const fee = detail.commissionFeeAmount || "";
        const per = detail.commissionPerAmount;
        let value = fee || prev.partnerCommission;
        if (!fee && per && Number(per) > 0) {
          const principal = parseNum(prev.sendAmount);
          if (principal != null) {
            value = formatAmount((principal * Number(per)) / 100);
          }
        }
        return {
          ...prev,
          partnerCommissionMode: "FIXED",
          partnerCommission: value,
          commissionCurrency:
            detail.commissionCurrencyCode ||
            prev.commissionCurrency ||
            prev.sendCurrency,
        };
      });
    } catch {
      /* keep manual commission fields */
    }
  }

  async function loadPrevious() {
    setError(null);
    try {
      const page = await listHawalaPage({
        direction: activeDirection,
        archiveFilter: "active",
        page: 1,
        pageSize: 50,
      });
      const items = page.items;
      if (!items.length) {
        setError(t.desk.noPreviousRecord);
        return;
      }
      let idx = 0;
      if (hawalaRecordId) {
        const found = items.findIndex((row) => row.id === hawalaRecordId);
        idx = found >= 0 ? found + 1 : 0;
      }
      const prev = items[idx];
      if (!prev) {
        setError(t.desk.noPreviousRecord);
        return;
      }
      const detail = await getHawala(prev.id);
      const send = form.sendCurrency || pickDefaultCurrency(currencies);
      const receive =
        form.receiveCurrency ||
        currencies.find((c) => c.code !== send)?.code ||
        send;
      applyHawalaDetail(detail, { send, receive });
    } catch (err: unknown) {
      setError(errorMessage(err));
    }
  }

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
    if (!open || form.partyMode !== "customer") {
      setSuggestions([]);
      setHighlight(-1);
      return;
    }
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
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, form.partyMode, form.customerId, form.customerLabel]);

  useEffect(() => {
    if (!open || !converting) return;
    // Manual receive edits stay independent — do not rewrite send/rate.
    if (lastEdited === "receive") return;

    const sendN = parseNum(form.sendAmount);
    const rateN = parseNum(form.rate);
    if (sendN == null || rateN == null) return;
    const next = sendToReceive(sendN, rateN, form.rateBase);
    if (next == null) return;
    const formatted = formatAmount(next);
    if (formatted.replace(/,/g, "") !== form.receiveAmount.replace(/,/g, "")) {
      setForm((prev) => ({ ...prev, receiveAmount: formatted }));
    }
  }, [
    open,
    converting,
    form.sendAmount,
    form.receiveAmount,
    form.rate,
    form.rateBase,
    lastEdited,
  ]);

  function setPartyMode(mode: PartyMode) {
    setForm((prev) => ({
      ...prev,
      partyMode: mode,
      customerId: "",
      customerLabel: "",
      walkInName: "",
      walkInPhone: "",
    }));
    clearSuggestState();
    setError(null);
  }

  function pickCustomer(c: CustomerListItem) {
    setForm((prev) => ({
      ...prev,
      customerId: c.id,
      customerLabel: c.fullName,
      walkInPhone: c.phone || prev.walkInPhone,
    }));
    clearSuggestState();
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

  function resetForm(keepOpen: boolean) {
    const send = pickDefaultCurrency(currencies) || form.sendCurrency;
    const receive =
      currencies.find((c) => c.code !== send)?.code ||
      send ||
      form.receiveCurrency;
    setForm(emptyForm(send, receive));
    setVoucherNo("");
    setError(null);
    setLastEdited("send");
    setReplaceId(null);
    setHawalaRecordId(null);
    setEmployeeId("");
    setEmployeeName("");
    setActiveDirection(direction);
    clearSuggestState();
    if (!keepOpen) onClose();
    else window.setTimeout(() => amountRef.current?.focus(), 50);
  }

  async function submit(action: "save" | "new") {
    if (!session) return;

    const sendAmount = form.sendAmount.trim();
    if (!sendAmount || parseNum(sendAmount) == null) {
      setError(t.hawala.amountRequired);
      amountRef.current?.focus();
      return;
    }
    if (!form.sendCurrency) {
      setError(t.hawala.currencyRequired);
      amountRef.current?.focus();
      return;
    }
    if (!form.partnerId) {
      setError(t.hawala.partnerRequired);
      return;
    }
    if (!form.city.trim() || !form.country.trim()) {
      setError(
        !form.country.trim() ? t.hawala.countryRequired : t.hawala.cityRequired,
      );
      return;
    }

    if (form.partyMode === "customer") {
      if (!form.customerId) {
        setError(t.desk.selectCustomerRequired);
        searchWrapRef.current?.querySelector("input")?.focus();
        return;
      }
    } else if (!form.walkInName.trim()) {
      setError(
        isSend ? t.hawala.senderNameRequired : t.hawala.receiverNameRequired,
      );
      return;
    }

    if (isSend && !form.otherPartyName.trim()) {
      setError(t.hawala.receiverNameRequired);
      return;
    }

    const hawalaNumber = voucherNo.trim() || form.reference.trim();
    if (!hawalaNumber) {
      setError(t.hawala.hawalaNumberRequired);
      return;
    }

    if (converting) {
      const rate = form.rate.trim();
      const receiveAmount = form.receiveAmount.trim();
      if (!rate || parseNum(rate) == null) {
        setError(t.hawala.rateRequired);
        amountRef.current?.focus();
        return;
      }
      if (!receiveAmount || parseNum(receiveAmount) == null) {
        setError(t.hawala.receiveAmountRequired);
        amountRef.current?.focus();
        return;
      }
    }

    const originCity = isSend ? "Kabul" : form.city.trim();
    const originCountry = isSend ? "Afghanistan" : form.country.trim();
    const destinationCity = isSend ? form.city.trim() : "Kabul";
    const destinationCountry = isSend ? form.country.trim() : "Afghanistan";

    const localName =
      form.partyMode === "customer"
        ? form.customerLabel.trim() || null
        : form.walkInName.trim() || null;
    const localPhone = form.walkInPhone.trim() || null;
    const localCustomerId =
      form.partyMode === "customer" ? form.customerId || null : null;

    if (!tryBeginSubmit(submittingRef)) return;
    setSaving(true);
    setError(null);
    try {
      const amountMajor = sendAmount.replace(/,/g, "");
      const partnerName =
        partners.find((p) => p.id === form.partnerId)?.name?.trim() || "";
      const otherName = form.otherPartyName.trim();
      const senderDisplay = isSend
        ? localName || "—"
        : otherName || partnerName || "—";
      const receiverDisplay = isSend
        ? otherName || partnerName || "—"
        : localName || "—";
      const description = buildHawalaDescription(t.hawala, {
        senderName: senderDisplay,
        receiverName: receiverDisplay,
        amount: amountMajor,
        currency: form.sendCurrency,
        viaAccount: isSend ? partnerName || null : null,
        locale,
      });
      const payload = {
        reference: hawalaNumber,
        partnerSarafiId: form.partnerId,
        currencyCode: form.sendCurrency,
        amount: amountMajor,
        valueDate: form.valueDate || todayIso(),
        createdById: session.userId,
        originCity,
        originCountry,
        destinationCity,
        destinationCountry,
        senderCustomerId: isSend ? localCustomerId : null,
        senderName: isSend
          ? form.partyMode === "customer"
            ? null
            : localName
          : form.otherPartyName.trim() || null,
        senderPhone: isSend ? localPhone : null,
        receiverCustomerId: !isSend ? localCustomerId : null,
        receiverName: !isSend
          ? form.partyMode === "customer"
            ? null
            : localName
          : form.otherPartyName.trim() || null,
        receiverPhone: !isSend ? localPhone : null,
        description,
        notes: appendEmployeeLine(
          form.notes.trim() || undefined,
          employeeName,
          t.employees.employee,
        ) || null,
        receiveCurrencyCode: converting ? form.receiveCurrency : null,
        receiveAmount: converting
          ? form.receiveAmount.trim().replace(/,/g, "")
          : null,
        exchangeRate: converting ? form.rate.trim().replace(/,/g, "") : null,
        replaceTransactionId: replaceId || undefined,
        ownCommissionAmount: ownCommissionResolved,
        ownCommissionMode: "FIXED",
        partnerCommissionAmount: partnerCommissionResolved,
        partnerCommissionMode: "FIXED",
        commissionCurrencyCode:
          form.commissionCurrency || form.sendCurrency || null,
      };

      const result = isSend
        ? await sendHawala(payload)
        : await receiveHawala(payload);

      onSaved?.();
      if (action === "save") {
        setSuccessMessage(
          t.hawala.postedSuccess
            .replace(
              "{direction}",
              isSend ? t.hawala.send : t.hawala.receive,
            )
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
      } else {
        setError(errorMessage(err, t.errors.hawalaSave));
      }
    } finally {
      endSubmit(submittingRef);
      setSaving(false);
    }
  }

  if (!open && !successMessage) return null;

  const title = isSend ? t.dashboard.sendHawala : t.dashboard.receiveHawala;

  return (
    <>
      {open ? (
        <Modal title={title} size="xl" onClose={() => resetForm(false)}>
          <div
            className="hawala-form-compact desk-qa-form"
            data-desk-form
            data-qa-tone="receive-hawala"
            onKeyDown={(e) =>
              handleDeskFormKeyDown(e, {
                busy: saving,
                onSubmit: () => void submit("save"),
              })
            }
          >
            <div className="hawala-compact-grid">
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
                <span>{t.hawala.valueDate}</span>
                <input
                  type="date"
                  value={form.valueDate}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, valueDate: e.target.value }));
                    setError(null);
                  }}
                />
              </label>
              <SearchableSelect
                label={`${t.hawala.partner} *`}
                value={form.partnerId}
                options={partnerOptions}
                placeholder={t.common.search}
                emptyLabel={t.common.noData}
                onChange={(partnerId) => void selectPartner(partnerId)}
              />
            </div>

            <div className="hawala-form-section">
              <p className="hawala-form-section-title">{t.common.amount}</p>
              <div className={`movement-fx${converting ? " is-converting" : ""}`}>
              <div className="hawala-compact-money">
                <div className="money-ccy-row">
                  <label className="money-ccy-amount">
                    <span>{t.hawala.sendAmountLabel} *</span>
                    <input
                      ref={amountRef}
                      className="deposit-amount-input"
                      inputMode="decimal"
                      value={form.sendAmount}
                      placeholder={t.common.amountPlaceholder}
                      onChange={(e) => {
                        setLastEdited("send");
                        setForm((prev) => ({
                          ...prev,
                          sendAmount: normalizeAmountInput(e.target.value),
                        }));
                        setError(null);
                      }}
                    />
                  </label>
                  <CurrencyPicker
                    label={t.common.currency}
                    required
                    currencies={currencies}
                    value={form.sendCurrency}
                    emptyLabel={t.common.select}
                    searchPlaceholder={t.common.search}
                    onCurrenciesChange={setCurrencies}
                    onChange={(code) => {
                      setLastEdited("send");
                      setForm((prev) => ({
                        ...prev,
                        sendCurrency: code,
                        receiveCurrency: code,
                        rate: "",
                        receiveAmount: "",
                        commissionCurrency:
                          !prev.commissionCurrency ||
                          prev.commissionCurrency === prev.sendCurrency
                            ? code
                            : prev.commissionCurrency,
                      }));
                      setError(null);
                    }}
                  />
                </div>

                <div className="money-ccy-row">
                  {converting ? (
                    <label className="money-ccy-amount">
                      <span>{t.hawala.receiveAmountLabel} *</span>
                      <input
                        className="deposit-amount-input"
                        inputMode="decimal"
                        value={form.receiveAmount}
                        placeholder={t.common.amountPlaceholder}
                        onChange={(e) => {
                          setLastEdited("receive");
                          setForm((prev) => ({
                            ...prev,
                            receiveAmount: normalizeAmountInput(e.target.value),
                          }));
                          setError(null);
                        }}
                      />
                    </label>
                  ) : (
                    <label className="money-ccy-amount">
                      <span>{t.hawala.receiveAmountLabel}</span>
                      <input
                        className="deposit-amount-input"
                        inputMode="decimal"
                        value={form.receiveAmount || form.sendAmount}
                        placeholder={t.common.amountPlaceholder}
                        readOnly
                      />
                    </label>
                  )}
                  <CurrencyPicker
                    label={
                      converting
                        ? t.hawala.receiveCurrencyLabel
                        : t.common.currency
                    }
                    required
                    currencies={currencies}
                    value={form.receiveCurrency}
                    emptyLabel={t.common.select}
                    searchPlaceholder={t.common.search}
                    onCurrenciesChange={setCurrencies}
                    onChange={(code) => {
                      setLastEdited("send");
                      setForm((prev) => ({
                        ...prev,
                        receiveCurrency: code,
                        ...(code === prev.sendCurrency
                          ? { rate: "", receiveAmount: "" }
                          : {}),
                      }));
                      setError(null);
                    }}
                  />
                </div>
              </div>

              {converting ? (
                <div className="fx-simple-rate-row hawala-fx-ops">
                  <div
                    className="hawala-mode-toggle"
                    role="group"
                    aria-label={t.hawala.rateOpLabel}
                    data-desk-choice-group
                  >
                    <button
                      type="button"
                      className={
                        form.rateBase === "send"
                          ? "hawala-mode active"
                          : "hawala-mode"
                      }
                      aria-pressed={form.rateBase === "send"}
                      title={rateOpHint}
                      onClick={() => {
                        setLastEdited("rate");
                        setForm((prev) => ({ ...prev, rateBase: "send" }));
                        setError(null);
                      }}
                    >
                      ×
                    </button>
                    <button
                      type="button"
                      className={
                        form.rateBase === "receive"
                          ? "hawala-mode active"
                          : "hawala-mode"
                      }
                      aria-pressed={form.rateBase === "receive"}
                      title={rateOpHint}
                      onClick={() => {
                        setLastEdited("rate");
                        setForm((prev) => ({ ...prev, rateBase: "receive" }));
                        setError(null);
                      }}
                    >
                      ÷
                    </button>
                  </div>
                  <label>
                    <span>{t.exchange.exchangeRate}</span>
                    <input
                      inputMode="decimal"
                      value={form.rate}
                      placeholder="0"
                      onChange={(e) => {
                        setLastEdited("rate");
                        setForm((prev) => ({
                          ...prev,
                          rate: normalizeAmountInput(e.target.value),
                        }));
                        setError(null);
                      }}
                    />
                  </label>
                </div>
              ) : null}
            </div>
            </div>

            <div className="hawala-form-section">
              <div className="hawala-compact-party-head">
                <p className="hawala-form-section-title" style={{ margin: 0 }}>
                  {partyLabel}
                </p>
                <div
                  className="hawala-mode-toggle"
                  role="group"
                  aria-label={partyLabel}
                  data-desk-choice-group
                >
                  <button
                    type="button"
                    className={
                      form.partyMode === "walkin" ? "hawala-mode active" : "hawala-mode"
                    }
                    aria-pressed={form.partyMode === "walkin"}
                    onClick={() => setPartyMode("walkin")}
                  >
                    {t.desk.walkIn}
                  </button>
                  <button
                    type="button"
                    className={
                      form.partyMode === "customer"
                        ? "hawala-mode active"
                        : "hawala-mode"
                    }
                    aria-pressed={form.partyMode === "customer"}
                    onClick={() => setPartyMode("customer")}
                  >
                    {t.hawala.existingCustomer}
                  </button>
                </div>
              </div>

            <div className="hawala-compact-grid">
              {form.partyMode === "walkin" ? (
                <label>
                  <span>
                    {isSend ? t.hawala.senderName : t.hawala.receiverName} *
                  </span>
                  <input
                    value={form.walkInName}
                    placeholder={t.exchange.walkInName}
                    onChange={(e) => {
                      setForm((prev) => ({
                        ...prev,
                        walkInName: e.target.value,
                      }));
                      setError(null);
                    }}
                  />
                </label>
              ) : (
                <label ref={searchWrapRef} className="customer-search-wrap">
                  <span>{t.common.customer} *</span>
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
                  {showSuggestions &&
                  form.customerLabel.trim().length > 0 &&
                  !form.customerId ? (
                    <ul className="customer-suggest" role="listbox">
                      {suggestBusy && suggestions.length === 0 ? (
                        <li className="customer-suggest-empty muted">
                          {t.common.loading}
                        </li>
                      ) : null}
                      {!suggestBusy && suggestions.length === 0 ? (
                        <li className="customer-suggest-empty muted">
                          {t.customers.emptyFiltered}
                        </li>
                      ) : null}
                      {suggestions.map((c, idx) => (
                        <li
                          key={c.id}
                          role="option"
                          aria-selected={idx === highlight}
                        >
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
                              {[c.code, c.phone].filter(Boolean).join(" · ") ||
                                "—"}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </label>
              )}
              <label>
                <span>
                  {otherPartyLabel}
                  {isSend ? " *" : ""}
                </span>
                <input
                  value={form.otherPartyName}
                  onChange={(e) => {
                    setForm((prev) => ({
                      ...prev,
                      otherPartyName: e.target.value,
                    }));
                    setError(null);
                  }}
                />
              </label>
              <EmployeeField
                valueId={employeeId}
                onChange={(id, name) => {
                  setEmployeeId(id);
                  setEmployeeName(name);
                }}
                disabled={saving}
              />
              <label>
                <span>
                  {isSend ? t.hawala.destinationCountry : t.hawala.originCountry}{" "}
                  *
                </span>
                <input
                  value={form.country}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, country: e.target.value }));
                    setError(null);
                  }}
                />
              </label>
              <label>
                <span>
                  {isSend ? t.hawala.destinationCity : t.hawala.originCity} *
                </span>
                <input
                  value={form.city}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, city: e.target.value }));
                    setError(null);
                  }}
                />
              </label>
            </div>
            </div>

            <div className="hawala-form-section">
              <p className="hawala-form-section-title">{t.common.commission}</p>
              <div className="hawala-compact-commission">
                <label>
                  <span>
                    {t.hawala.ownCommissionCurrency.replace(
                      "{currency}",
                      form.commissionCurrency || form.sendCurrency || "",
                    )}
                  </span>
                  <input
                    inputMode="decimal"
                    value={form.ownCommission}
                    placeholder="0"
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        ownCommission: normalizeAmountInput(e.target.value),
                        ownCommissionMode: "FIXED",
                      }))
                    }
                  />
                </label>
                <label>
                  <span>
                    {isSend
                      ? t.hawala.partnerCommissionPayable
                      : t.hawala.partnerCommissionReceivable}
                  </span>
                  <input
                    inputMode="decimal"
                    value={form.partnerCommission}
                    placeholder="0"
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        partnerCommission: normalizeAmountInput(e.target.value),
                        partnerCommissionMode: "FIXED",
                      }))
                    }
                  />
                </label>
                <CurrencyPicker
                  label={t.common.currency}
                  currencies={currencies}
                  value={form.commissionCurrency || form.sendCurrency}
                  emptyLabel={t.common.select}
                  searchPlaceholder={t.common.search}
                  onCurrenciesChange={setCurrencies}
                  onChange={(code) =>
                    setForm((prev) => ({
                      ...prev,
                      commissionCurrency: code,
                    }))
                  }
                />
              </div>
            </div>

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
