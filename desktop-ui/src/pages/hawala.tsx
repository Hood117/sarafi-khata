import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";

import {
  archiveHawala,
  getHawalaCustomerContext,
  listCurrenciesPage,
  listCustomersPage,
  listHawalaDesk,
  listPartners,
  listWalletsPage,
  nextHawalaReference,
  receiveHawala,
  sendHawala,
  type CurrencyListItem,
  type CustomerListItem,
  type HawalaCustomerContext,
  type HawalaListItem,
  type HawalaListPage,
  type HawalaPostInput,
  type PartnerListItem,
  type WalletListItem,
} from "@desktop/api";
import type { Dictionary } from "@/lib/i18n/messages/types";
import { useAuth } from "@desktop/auth";
import { useT } from "@desktop/i18n";
import { IconBuy, IconHistory, IconTransfers } from "@desktop/icons";
import { statusLabel, purposeLabel, settlementLabel } from "@desktop/lib/i18n-labels";
import {
  formatMoney,
  parseMoney,
  readHawalaDraft,
  resolveCommission,
  statusBadgeClass,
  todayIso,
  type HawalaDraft,
} from "@desktop/pages/hawala-helpers";

type TabId = "history" | "send" | "receive";

type FieldErrors = Record<string, string>;

const PURPOSES = [
  "Family",
  "Business",
  "Medical",
  "Education",
  "Salary",
  "Trade",
  "Investment",
  "Other",
] as const;

const PRIORITIES = ["NORMAL", "URGENT", "IMMEDIATE"] as const;

const SETTLEMENT_TYPES = [
  "Cash",
  "Partner Balance",
  "Customer Deposit",
  "Internal Adjustment",
] as const;

const STATUSES = [
  "ALL",
  "PENDING",
  "SENT",
  "RECEIVED",
  "COMPLETED",
  "CANCELLED",
  "RETURNED",
] as const;

function emptyForm(direction: "SEND" | "RECEIVE"): FormState {
  return {
    reference: "",
    valueDate: todayIso(),
    partnerId: "",
    partnerBranch: "",
    currencyCode: "",
    amount: "",
    receiveCurrencyCode: "",
    receiveAmount: "",
    exchangeRate: "",
    purpose: "Family",
    priority: "NORMAL",
    expectedDeliveryDate: "",
    expectedDeliveryTime: "",
    cashWalletId: "",
    senderMode: "walking",
    senderCustomerId: "",
    senderName: "",
    senderPhone: "",
    senderNationalId: "",
    senderAddress: "",
    senderNotes: "",
    receiverMode: direction === "RECEIVE" ? "walking" : "walking",
    receiverCustomerId: "",
    receiverName: "",
    receiverPhone: "",
    receiverNationalId: "",
    receiverAddress: "",
    receiverReference: "",
    country: "",
    city: "",
    originCity: direction === "SEND" ? "Kabul" : "",
    originCountry: direction === "SEND" ? "Afghanistan" : "",
    destinationCity: direction === "RECEIVE" ? "Kabul" : "",
    destinationCountry: direction === "RECEIVE" ? "Afghanistan" : "",
    specialInstructions: "",
    ownCommissionMode: "FIXED",
    ownCommission: "",
    partnerCommissionMode: "FIXED",
    partnerCommission: "",
    additionalCharges: "",
    discountAmount: "",
    settlementType: "Cash",
    settlementNotes: "",
    internalNotes: "",
    customerNotes: "",
    privateNotes: "",
  };
}

type FormState = {
  reference: string;
  valueDate: string;
  partnerId: string;
  partnerBranch: string;
  currencyCode: string;
  amount: string;
  receiveCurrencyCode: string;
  receiveAmount: string;
  exchangeRate: string;
  purpose: string;
  priority: string;
  expectedDeliveryDate: string;
  expectedDeliveryTime: string;
  cashWalletId: string;
  senderMode: "existing" | "walking";
  senderCustomerId: string;
  senderName: string;
  senderPhone: string;
  senderNationalId: string;
  senderAddress: string;
  senderNotes: string;
  receiverMode: "existing" | "walking";
  receiverCustomerId: string;
  receiverName: string;
  receiverPhone: string;
  receiverNationalId: string;
  receiverAddress: string;
  receiverReference: string;
  country: string;
  city: string;
  originCity: string;
  originCountry: string;
  destinationCity: string;
  destinationCountry: string;
  specialInstructions: string;
  ownCommissionMode: "FIXED" | "PERCENT";
  ownCommission: string;
  partnerCommissionMode: "FIXED" | "PERCENT";
  partnerCommission: string;
  additionalCharges: string;
  discountAmount: string;
  settlementType: string;
  settlementNotes: string;
  internalNotes: string;
  customerNotes: string;
  privateNotes: string;
};

function applyDraft(base: FormState, draft: HawalaDraft): FormState {
  return {
    ...base,
    reference: draft.reference ?? base.reference,
    partnerId: draft.partnerId ?? base.partnerId,
    partnerBranch: draft.partnerBranch ?? base.partnerBranch,
    currencyCode: draft.currencyCode ?? base.currencyCode,
    amount: draft.amount ?? base.amount,
    receiveCurrencyCode: draft.receiveCurrencyCode ?? base.receiveCurrencyCode,
    receiveAmount: draft.receiveAmount ?? base.receiveAmount,
    exchangeRate: draft.exchangeRate ?? base.exchangeRate,
    purpose: draft.purpose ?? base.purpose,
    priority: draft.priority ?? base.priority,
    expectedDeliveryDate:
      draft.expectedDeliveryDate ?? base.expectedDeliveryDate,
    expectedDeliveryTime:
      draft.expectedDeliveryTime ?? base.expectedDeliveryTime,
    valueDate: draft.valueDate ?? base.valueDate,
    cashWalletId: draft.cashWalletId ?? base.cashWalletId,
    senderMode: draft.senderMode ?? base.senderMode,
    senderCustomerId: draft.senderCustomerId ?? base.senderCustomerId,
    senderName: draft.senderName ?? base.senderName,
    senderPhone: draft.senderPhone ?? base.senderPhone,
    senderNationalId: draft.senderNationalId ?? base.senderNationalId,
    senderAddress: draft.senderAddress ?? base.senderAddress,
    senderNotes: draft.senderNotes ?? base.senderNotes,
    receiverMode: draft.receiverMode ?? base.receiverMode,
    receiverCustomerId: draft.receiverCustomerId ?? base.receiverCustomerId,
    receiverName: draft.receiverName ?? base.receiverName,
    receiverPhone: draft.receiverPhone ?? base.receiverPhone,
    receiverNationalId: draft.receiverNationalId ?? base.receiverNationalId,
    receiverAddress: draft.receiverAddress ?? base.receiverAddress,
    receiverReference: draft.receiverReference ?? base.receiverReference,
    country: draft.country ?? base.country,
    city: draft.city ?? base.city,
    originCity: draft.originCity ?? base.originCity,
    originCountry: draft.originCountry ?? base.originCountry,
    destinationCity: draft.destinationCity ?? base.destinationCity,
    destinationCountry: draft.destinationCountry ?? base.destinationCountry,
    specialInstructions: draft.specialInstructions ?? base.specialInstructions,
    ownCommissionMode: draft.ownCommissionMode ?? base.ownCommissionMode,
    ownCommission: draft.ownCommission ?? base.ownCommission,
    partnerCommissionMode:
      draft.partnerCommissionMode ?? base.partnerCommissionMode,
    partnerCommission: draft.partnerCommission ?? base.partnerCommission,
    additionalCharges: draft.additionalCharges ?? base.additionalCharges,
    discountAmount: draft.discountAmount ?? base.discountAmount,
    settlementType: draft.settlementType ?? base.settlementType,
    settlementNotes: draft.settlementNotes ?? base.settlementNotes,
    internalNotes: draft.internalNotes ?? base.internalNotes,
    customerNotes: draft.customerNotes ?? base.customerNotes,
    privateNotes: draft.privateNotes ?? base.privateNotes,
  };
}

function Field({
  label,
  required,
  error,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={className}>
      <span className={required ? "req" : undefined}>{label}</span>
      {children}
      {error ? <span className="field-error">{error}</span> : null}
    </label>
  );
}

function HawalaStep({
  step,
  title,
  hint,
  children,
}: {
  step: number;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="hawala-step section-card stack">
      <header className="hawala-step-head">
        <span className="hawala-step-num" aria-hidden>
          {step}
        </span>
        <div>
          <h2 className="hawala-step-title">{title}</h2>
          {hint ? <p className="muted hawala-step-hint">{hint}</p> : null}
        </div>
      </header>
      <div className="hawala-step-body">{children}</div>
    </section>
  );
}

function ModeToggle({
  name,
  value,
  onChange,
  existingLabel,
  walkingLabel,
}: {
  name: string;
  value: "existing" | "walking";
  onChange: (next: "existing" | "walking") => void;
  existingLabel: string;
  walkingLabel: string;
}) {
  return (
    <div className="hawala-mode-toggle" role="group" aria-label={name}>
      <button
        type="button"
        className={value === "existing" ? "hawala-mode active" : "hawala-mode"}
        onClick={() => onChange("existing")}
      >
        {existingLabel}
      </button>
      <button
        type="button"
        className={value === "walking" ? "hawala-mode active" : "hawala-mode"}
        onClick={() => onChange("walking")}
      >
        {walkingLabel}
      </button>
    </div>
  );
}

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function exportCsv(rows: HawalaListItem[], t: Dictionary) {
  const headers = [
    t.desk.hawalaNumber,
    t.common.date,
    t.hawala.direction,
    t.hawala.sender,
    t.hawala.receiver,
    t.common.partner,
    t.desk.destination,
    t.common.currency,
    t.common.amount,
    t.common.commission,
    t.common.status,
    t.desk.createdBy,
  ];
  const lines = [headers.join(",")];
  for (const row of rows) {
    const dest = [row.destinationCity, row.destinationCountry]
      .filter(Boolean)
      .join(", ");
    const commission = [row.ownCommission, row.partnerCommission]
      .filter(Boolean)
      .join(" / ");
    lines.push(
      [
        row.reference,
        String(row.valueDate).slice(0, 10),
        row.direction,
        row.senderName ?? "",
        row.receiverName ?? "",
        row.partnerSarafi ?? "",
        dest,
        row.currencyCode,
        row.amount,
        commission,
        row.status,
        row.createdByName ?? "",
      ]
        .map((c) => escapeCsv(String(c)))
        .join(","),
    );
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `hawala-export-${todayIso()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function HawalaPage() {
  const { session } = useAuth();
  const t = useT();
  const [tab, setTab] = useState<TabId>("history");
  const [dirty, setDirty] = useState(false);

  const [pageData, setPageData] = useState<HawalaListPage | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [direction, setDirection] = useState("ALL");
  const [partnerFilter, setPartnerFilter] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [archiveFilter, setArchiveFilter] = useState<"active" | "archived" | "all">(
    "active",
  );
  const [sort, setSort] = useState("date_desc");
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [openExtras, setOpenExtras] = useState({
    delivery: false,
  });

  const [partners, setPartners] = useState<PartnerListItem[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyListItem[]>([]);
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [cashWallets, setCashWallets] = useState<WalletListItem[]>([]);

  const [sendForm, setSendForm] = useState<FormState>(() => emptyForm("SEND"));
  const [receiveForm, setReceiveForm] = useState<FormState>(() =>
    emptyForm("RECEIVE"),
  );
  const [sendErrors, setSendErrors] = useState<FieldErrors>({});
  const [receiveErrors, setReceiveErrors] = useState<FieldErrors>({});
  const [customerCtx, setCustomerCtx] = useState<HawalaCustomerContext | null>(
    null,
  );
  const [receiveCustomerCtx, setReceiveCustomerCtx] =
    useState<HawalaCustomerContext | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [lookupsReady, setLookupsReady] = useState(false);

  const form = tab === "receive" ? receiveForm : sendForm;
  const setForm = tab === "receive" ? setReceiveForm : setSendForm;
  const fieldErrors = tab === "receive" ? receiveErrors : sendErrors;
  const setFieldErrors = tab === "receive" ? setReceiveErrors : setSendErrors;
  const isSend = tab === "send";

  function patchForm(patch: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  }

  function requestTab(next: TabId) {
    if (
      dirty &&
      (tab === "send" || tab === "receive") &&
      next !== tab &&
      !window.confirm(t.hawala.unsavedLeaveConfirm)
    ) {
      return;
    }
    if (next !== tab && (tab === "send" || tab === "receive")) {
      setDirty(false);
    }
    setTab(next);
    setError(null);
    setOk(null);
  }

  useEffect(() => {
    void Promise.all([
      listPartners(),
      listCurrenciesPage({ activeOnly: true, pageSize: 100 }),
      listCustomersPage({ archiveFilter: "active", page: 1, pageSize: 200 }),
      listWalletsPage({ pageSize: 100, activeOnly: true }),
    ])
      .then(([p, ccy, cust, wallets]) => {
        setPartners(p);
        setCurrencies(ccy.items);
        setCustomers(cust.items);
        const cash = wallets.items.filter(
          (w) => w.type === "TILL" || w.type === "VAULT",
        );
        setCashWallets(cash);

        const draft = readHawalaDraft();
        const applyDefaults = (base: FormState): FormState => ({
          ...base,
          partnerId: base.partnerId || p[0]?.id || "",
          currencyCode: base.currencyCode || ccy.items[0]?.code || "",
          cashWalletId: base.cashWalletId || cash[0]?.id || "",
        });

        if (draft) {
          const dir = draft.direction === "RECEIVE" ? "RECEIVE" : "SEND";
          const seeded = applyDefaults(
            applyDraft(emptyForm(dir), { ...draft, reference: "" }),
          );
          if (dir === "RECEIVE") {
            setReceiveForm(seeded);
            setTab("receive");
          } else {
            setSendForm(seeded);
            setTab("send");
          }
          setDirty(true);
          void nextHawalaReference()
            .then((ref) => {
              if (dir === "RECEIVE") {
                setReceiveForm((f) => ({ ...f, reference: ref }));
              } else {
                setSendForm((f) => ({ ...f, reference: ref }));
              }
            })
            .catch(() => undefined);
        } else {
          setSendForm((f) => applyDefaults(f));
          setReceiveForm((f) => applyDefaults(f));
        }
        setLookupsReady(true);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      });
  }, []);

  useEffect(() => {
    if (tab !== "history") return;
    let cancelled = false;
    setBusy(true);
    void listHawalaDesk({
      page,
      pageSize: 25,
      search: search.trim() || undefined,
      direction: direction === "ALL" ? undefined : direction,
      status: status === "ALL" ? undefined : status,
      partnerSarafiId: partnerFilter || undefined,
      currencyCode: currencyFilter || undefined,
      country: countryFilter.trim() || undefined,
      city: cityFilter.trim() || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      archiveFilter,
      sort,
    })
      .then((result) => {
        if (!cancelled) {
          setPageData(result);
          setError(null);
        }
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
  }, [
    tab,
    page,
    search,
    direction,
    status,
    partnerFilter,
    currencyFilter,
    countryFilter,
    cityFilter,
    dateFrom,
    dateTo,
    archiveFilter,
    sort,
    reloadKey,
  ]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const next = searchInput.trim();
      if (next === search) return;
      setPage(1);
      setSearch(next);
    }, 250);
    return () => window.clearTimeout(t);
  }, [searchInput, search]);

  useEffect(() => {
    if (tab !== "send" && tab !== "receive") return;
    if (!lookupsReady) return;
    if (form.reference.trim()) return;
    let cancelled = false;
    void nextHawalaReference()
      .then((ref) => {
        if (!cancelled) {
          setForm((f) => (f.reference.trim() ? f : { ...f, reference: ref }));
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [tab, lookupsReady, form.reference, setForm]);

  useEffect(() => {
    if (tab !== "send" || form.senderMode !== "existing" || !form.senderCustomerId) {
      setCustomerCtx(null);
      return;
    }
    let cancelled = false;
    void getHawalaCustomerContext(form.senderCustomerId)
      .then((ctx) => {
        if (!cancelled) setCustomerCtx(ctx);
      })
      .catch(() => {
        if (!cancelled) setCustomerCtx(null);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, form.senderMode, form.senderCustomerId]);

  useEffect(() => {
    if (
      tab !== "receive" ||
      form.receiverMode !== "existing" ||
      !form.receiverCustomerId
    ) {
      setReceiveCustomerCtx(null);
      return;
    }
    let cancelled = false;
    void getHawalaCustomerContext(form.receiverCustomerId)
      .then((ctx) => {
        if (!cancelled) setReceiveCustomerCtx(ctx);
      })
      .catch(() => {
        if (!cancelled) setReceiveCustomerCtx(null);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, form.receiverMode, form.receiverCustomerId]);

  const ownCommissionResolved = useMemo(
    () =>
      resolveCommission(form.amount, form.ownCommissionMode, form.ownCommission),
    [form.amount, form.ownCommissionMode, form.ownCommission],
  );
  const partnerCommissionResolved = useMemo(
    () =>
      resolveCommission(
        form.amount,
        form.partnerCommissionMode,
        form.partnerCommission,
      ),
    [form.amount, form.partnerCommissionMode, form.partnerCommission],
  );

  const totalCharges = useMemo(() => {
    const own = parseMoney(ownCommissionResolved ?? "0");
    const partner = isSend ? parseMoney(partnerCommissionResolved ?? "0") : 0;
    const extra = parseMoney(form.additionalCharges);
    const discount = parseMoney(form.discountAmount);
    return formatMoney(Math.max(0, own + partner + extra - discount));
  }, [
    ownCommissionResolved,
    partnerCommissionResolved,
    form.additionalCharges,
    form.discountAmount,
    isSend,
  ]);

  const netToCustomer = useMemo(() => {
    return formatMoney(
      Math.max(0, parseMoney(form.amount) - parseMoney(totalCharges)),
    );
  }, [form.amount, totalCharges]);

  const selectedPartner = partners.find((p) => p.id === form.partnerId);

  function validate(f: FormState, send: boolean): FieldErrors {
    const e: FieldErrors = {};
    if (!f.reference.trim()) e.reference = t.hawala.hawalaNumberRequired;
    if (!f.currencyCode) e.currencyCode = t.hawala.currencyRequired;
    if (!f.amount.trim() || parseMoney(f.amount) <= 0) {
      e.amount = t.hawala.amountRequired;
    }
    if (!f.partnerId) e.partnerId = t.hawala.partnerRequired;
    if (!f.cashWalletId) e.cashWalletId = t.hawala.cashWalletRequired;
    if (!f.country.trim()) e.country = t.hawala.countryRequired;
    if (!f.city.trim()) e.city = t.hawala.cityRequired;

    if (send) {
      if (f.senderMode === "existing") {
        if (!f.senderCustomerId) e.senderCustomerId = t.hawala.selectCustomer;
      } else if (!f.senderName.trim()) {
        e.senderName = t.hawala.senderNameRequired;
      }
      if (!f.receiverName.trim()) e.receiverName = t.hawala.receiverNameRequired;
    } else {
      if (!f.senderName.trim()) e.senderName = t.hawala.remoteSenderNameRequired;
      if (f.receiverMode === "existing") {
        if (!f.receiverCustomerId) {
          e.receiverCustomerId = t.common.selectLocalCustomer;
        }
      } else if (!f.receiverName.trim()) {
        e.receiverName = t.hawala.receiverNameRequired;
      }
    }
    return e;
  }

  function buildPayload(f: FormState, send: boolean): HawalaPostInput {
    if (!session) throw new Error(t.hawala.notSignedIn);

    const originCity = send
      ? f.originCity.trim() || "Kabul"
      : f.city.trim();
    const originCountry = send
      ? f.originCountry.trim() || "Afghanistan"
      : f.country.trim();
    const destinationCity = send
      ? f.city.trim()
      : f.destinationCity.trim() || "Kabul";
    const destinationCountry = send
      ? f.country.trim()
      : f.destinationCountry.trim() || "Afghanistan";

    return {
      reference: f.reference.trim(),
      partnerSarafiId: f.partnerId,
      currencyCode: f.currencyCode,
      amount: f.amount.trim(),
      cashWalletId: f.cashWalletId,
      valueDate: f.valueDate || todayIso(),
      createdById: session.userId,
      originCity,
      originCountry,
      destinationCity,
      destinationCountry,
      partnerBranch: f.partnerBranch.trim() || null,
      specialInstructions: f.specialInstructions.trim() || null,
      purpose: f.purpose || null,
      priority: f.priority || null,
      expectedDeliveryDate: f.expectedDeliveryDate || null,
      expectedDeliveryTime: f.expectedDeliveryTime || null,
      receiveCurrencyCode: f.receiveCurrencyCode || null,
      receiveAmount: f.receiveAmount.trim() || null,
      exchangeRate: f.exchangeRate.trim() || null,
      ownCommissionAmount: ownCommissionResolved,
      ownCommissionMode: f.ownCommissionMode,
      partnerCommissionAmount: partnerCommissionResolved,
      partnerCommissionMode: f.partnerCommissionMode,
      additionalCharges: f.additionalCharges.trim() || null,
      discountAmount: f.discountAmount.trim() || null,
      settlementType: f.settlementType || null,
      settlementNotes: null,
      internalNotes: null,
      customerNotes: null,
      privateNotes: null,
      notes: null,
      senderCustomerId:
        send && f.senderMode === "existing" ? f.senderCustomerId || null : null,
      senderName: send
        ? f.senderMode === "existing"
          ? null
          : f.senderName.trim() || null
        : f.senderName.trim() || null,
      senderPhone: f.senderPhone.trim() || null,
      senderNationalId: f.senderNationalId.trim() || null,
      senderAddress: f.senderAddress.trim() || null,
      receiverCustomerId:
        !send && f.receiverMode === "existing"
          ? f.receiverCustomerId || null
          : null,
      receiverName:
        !send && f.receiverMode === "existing"
          ? null
          : f.receiverName.trim() || null,
      receiverPhone: f.receiverPhone.trim() || null,
      receiverNationalId: f.receiverNationalId.trim() || null,
      receiverAddress: f.receiverAddress.trim() || null,
      receiverReference: null,
    };
  }

  async function handleSave(andNew: boolean) {
    if (!session || (tab !== "send" && tab !== "receive")) return;
    const send = tab === "send";
    const errs = validate(form, send);
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) {
      setError(t.common.correctHighlightedFields);
      return;
    }
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const payload = buildPayload(form, send);
      const result = send
        ? await sendHawala(payload)
        : await receiveHawala(payload);
      setOk(
        t.hawala.postedSuccess
          .replace("{direction}", result.direction)
          .replace("{reference}", result.reference),
      );
      setDirty(false);
      setReloadKey((k) => k + 1);
      if (andNew) {
        const next = emptyForm(send ? "SEND" : "RECEIVE");
        next.partnerId = form.partnerId || partners[0]?.id || "";
        next.currencyCode = form.currencyCode || currencies[0]?.code || "";
        next.cashWalletId = form.cashWalletId || cashWallets[0]?.id || "";
        setForm(next);
        setFieldErrors({});
        const ref = await nextHawalaReference();
        setForm((f) => ({ ...f, reference: ref }));
      } else {
        setTab("history");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleArchive(id: string) {
    if (!session) return;
    if (!window.confirm(t.hawala.archiveConfirmSoft)) {
      return;
    }
    setBusy(true);
    try {
      await archiveHawala({ id, actorUserId: session.userId });
      setReloadKey((k) => k + 1);
      setOk(t.hawala.archivedOk);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const totalPages = pageData
    ? Math.max(1, Math.ceil(pageData.total / pageData.pageSize))
    : 1;

  const activeCtx = isSend ? customerCtx : receiveCustomerCtx;

  return (
    <div className="stack">
      <div className="no-print">
        <h1 style={{ margin: "0 0 0.25rem" }}>{t.desk.hawalaDesk}</h1>
        <p className="muted" style={{ margin: 0 }}>
          {t.desk.hawalaDeskHint}
        </p>
      </div>

      <div className="nav-row no-print">
        {(
          [
            ["history", t.desk.historyTab, <IconHistory key="h" />],
            ["send", t.desk.newSend, <IconTransfers key="s" />],
            ["receive", t.desk.newReceive, <IconBuy key="r" />],
          ] as const
        ).map(([id, label, icon]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? "nav-link active" : "nav-link"}
            onClick={() => requestTab(id)}
          >
            <span className="nav-link-icon">{icon}</span>
            <span className="nav-link-label">{label}</span>
          </button>
        ))}
      </div>

      {error ? <p className="error no-print">{error}</p> : null}
      {ok ? <p className="ok no-print">{ok}</p> : null}

      {tab === "history" ? (
        <div className="section-card stack no-print">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 style={{ margin: 0 }}>{t.common.history}</h2>
            <div className="row">
              <button
                type="button"
                className="secondary"
                disabled={!pageData?.items.length}
                onClick={() => pageData && exportCsv(pageData.items, t)}
              >
                {t.desk.exportCsv}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => window.print()}
              >
                {t.common.print}
              </button>
            </div>
          </div>

          <div className="hawala-filters">
            <div className="hawala-filters-primary">
              <Field label={t.common.search} className="hawala-filter-grow">
                <input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder={t.hawala.searchPlaceholder}
                />
              </Field>
              <Field label={t.common.status}>
                <select
                  value={status}
                  onChange={(e) => {
                    setPage(1);
                    setStatus(e.target.value);
                  }}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s === "ALL" ? t.hawala.allStatuses : statusLabel(t, s)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t.hawala.partner}>
                <select
                  value={partnerFilter}
                  onChange={(e) => {
                    setPage(1);
                    setPartnerFilter(e.target.value);
                  }}
                >
                  <option value="">{t.common.all} {t.common.partner.toLowerCase()}</option>
                  {partners.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="hawala-filters-actions">
                <button
                  type="button"
                  className="secondary"
                  aria-expanded={showMoreFilters}
                  onClick={() => setShowMoreFilters((v) => !v)}
                >
                  {showMoreFilters ? t.hawala.fewerFilters : t.desk.moreFilters}
                </button>
              </div>
            </div>

            {showMoreFilters ? (
              <div className="hawala-filters-more">
                <Field label={t.desk.direction}>
                  <select
                    value={direction}
                    onChange={(e) => {
                      setPage(1);
                      setDirection(e.target.value);
                    }}
                  >
                    <option value="ALL">{t.common.all}</option>
                    <option value="SEND">{t.hawala.send}</option>
                    <option value="RECEIVE">{t.hawala.receive}</option>
                  </select>
                </Field>
                <Field label={t.common.currency}>
                  <select
                    value={currencyFilter}
                    onChange={(e) => {
                      setPage(1);
                      setCurrencyFilter(e.target.value);
                    }}
                  >
                    <option value="">{t.common.all}</option>
                    {currencies.map((c) => (
                      <option key={c.id} value={c.code}>
                        {c.code}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t.common.country}>
                  <input
                    value={countryFilter}
                    onChange={(e) => {
                      setPage(1);
                      setCountryFilter(e.target.value);
                    }}
                  />
                </Field>
                <Field label={t.common.city}>
                  <input
                    value={cityFilter}
                    onChange={(e) => {
                      setPage(1);
                      setCityFilter(e.target.value);
                    }}
                  />
                </Field>
                <Field label={t.common.from}>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => {
                      setPage(1);
                      setDateFrom(e.target.value);
                    }}
                  />
                </Field>
                <Field label={t.common.to}>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => {
                      setPage(1);
                      setDateTo(e.target.value);
                    }}
                  />
                </Field>
                <Field label={t.common.archive}>
                  <select
                    value={archiveFilter}
                    onChange={(e) => {
                      setPage(1);
                      setArchiveFilter(
                        e.target.value as "active" | "archived" | "all",
                      );
                    }}
                  >
                    <option value="active">{t.common.active}</option>
                    <option value="archived">{t.common.archived}</option>
                    <option value="all">{t.common.all}</option>
                  </select>
                </Field>
                <Field label={t.common.filter}>
                  <select
                    value={sort}
                    onChange={(e) => {
                      setPage(1);
                      setSort(e.target.value);
                    }}
                  >
                    <option value="date_desc">{t.common.newestFirst}</option>
                    <option value="date_asc">{t.common.oldestFirst}</option>
                    <option value="amount_desc">{t.common.amount} ({t.common.newestFirst})</option>
                    <option value="amount_asc">{t.common.amount} ({t.common.oldestFirst})</option>
                    <option value="ref_asc">{t.desk.hawalaNumber}</option>
                  </select>
                </Field>
              </div>
            ) : null}
          </div>

          {busy && !pageData ? <p className="muted">{t.common.loading}</p> : null}
          {pageData ? (
            <>
              <div style={{ overflowX: "auto" }}>
                <table>
                  <thead>
                    <tr>
                      <th>{t.desk.hawalaNumber}</th>
                      <th>{t.common.date}</th>
                      <th>{t.hawala.sender}</th>
                      <th>{t.hawala.receiver}</th>
                      <th>{t.common.partner}</th>
                      <th>{t.desk.destination}</th>
                      <th>{t.common.currency}</th>
                      <th>{t.common.amount}</th>
                      <th>{t.common.commission}</th>
                      <th>{t.common.status}</th>
                      <th>{t.desk.createdBy}</th>
                      <th>{t.common.actions}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageData.items.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <Link to={`/hawala/${row.id}`}>{row.reference}</Link>
                          <div className="muted" style={{ fontSize: "0.75rem" }}>
                            {row.direction}
                          </div>
                        </td>
                        <td>{String(row.valueDate).slice(0, 10)}</td>
                        <td>{row.senderName ?? "—"}</td>
                        <td>{row.receiverName ?? "—"}</td>
                        <td>{row.partnerSarafi ?? "—"}</td>
                        <td>
                          {[row.destinationCity, row.destinationCountry]
                            .filter(Boolean)
                            .join(", ") || "—"}
                        </td>
                        <td>{row.currencyCode}</td>
                        <td>{row.amount}</td>
                        <td>
                          {row.ownCommission ?? "—"}
                          {row.partnerCommission
                            ? ` / ${row.partnerCommission}`
                            : ""}
                        </td>
                        <td>
                          <span className={statusBadgeClass(row.status)}>
                            {statusLabel(t, row.status)}
                          </span>
                        </td>
                        <td>{row.createdByName ?? "—"}</td>
                        <td>
                          <div className="row" style={{ gap: "0.35rem" }}>
                            <Link
                              className="button-link secondary"
                              to={`/hawala/${row.id}`}
                              style={{ fontSize: "0.8rem", padding: "0.25rem 0.5rem" }}
                            >
                              {t.hawala.viewEdit}
                            </Link>
                            {!row.isArchived ? (
                              <button
                                type="button"
                                className="secondary"
                                style={{ fontSize: "0.8rem" }}
                                disabled={busy}
                                onClick={() => void handleArchive(row.id)}
                              >
                                {t.common.archive}
                              </button>
                            ) : (
                              <span className="muted">{t.common.archived}</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {pageData.items.length === 0 ? (
                      <tr>
                        <td colSpan={12} className="muted">
                          {t.hawala.noTransfersMatch}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              <div className="row">
                <button
                  type="button"
                  className="secondary"
                  disabled={page <= 1 || busy}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  {t.common.previous}
                </button>
                <span className="muted">
                  {t.hawala.pageOf
                    .replace("{page}", String(page))
                    .replace("{total}", String(totalPages))}
                </span>
                <button
                  type="button"
                  className="secondary"
                  disabled={page >= totalPages || busy}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t.common.next}
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : (
        <form
          className="hawala-layout"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void handleSave(false);
          }}
        >
          <div className="stack no-print hawala-form-steps">
            <HawalaStep
              step={1}
              title={t.hawala.parties}
              hint={
                isSend ? t.hawala.partyStepSendHint : t.hawala.partyStepReceiveHint
              }
            >
              {isSend ? (
                <>
                  <ModeToggle
                    name="senderMode"
                    value={form.senderMode}
                    existingLabel={t.hawala.existingCustomer}
                    walkingLabel={t.desk.walkIn}
                    onChange={(next) =>
                      patchForm(
                        next === "walking"
                          ? { senderMode: "walking", senderCustomerId: "" }
                          : { senderMode: "existing" },
                      )
                    }
                  />
                  {form.senderMode === "existing" ? (
                    <>
                      <Field
                        label={t.common.customer}
                        required
                        error={fieldErrors.senderCustomerId}
                      >
                        <select
                          value={form.senderCustomerId}
                          onChange={(e) =>
                            patchForm({ senderCustomerId: e.target.value })
                          }
                        >
                          <option value="">{t.hawala.selectCustomer}</option>
                          {customers.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.fullName}
                              {c.phone ? ` · ${c.phone}` : ""}
                            </option>
                          ))}
                        </select>
                      </Field>
                      {activeCtx ? (
                        <div className="hawala-ctx muted">
                          <strong>{activeCtx.fullName}</strong>
                          {activeCtx.phone ? ` · ${activeCtx.phone}` : ""}
                          <div>
                            {t.hawala.balances}:{" "}
                            {activeCtx.balances.length
                              ? activeCtx.balances
                                  .map((b) => `${b.balance} ${b.currencyCode}`)
                                  .join(", ")
                              : "—"}
                          </div>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="hawala-fields-grid">
                      <Field
                        label={t.common.fullName}
                        required
                        error={fieldErrors.senderName}
                        className="hawala-span-2"
                      >
                        <input
                          value={form.senderName}
                          onChange={(e) =>
                            patchForm({ senderName: e.target.value })
                          }
                        />
                      </Field>
                      <Field label={t.common.phone}>
                        <input
                          value={form.senderPhone}
                          onChange={(e) =>
                            patchForm({ senderPhone: e.target.value })
                          }
                        />
                      </Field>
                      <Field label={t.common.nationalId}>
                        <input
                          value={form.senderNationalId}
                          onChange={(e) =>
                            patchForm({ senderNationalId: e.target.value })
                          }
                        />
                      </Field>
                      <Field label={t.common.address} className="hawala-span-2">
                        <input
                          value={form.senderAddress}
                          onChange={(e) =>
                            patchForm({ senderAddress: e.target.value })
                          }
                        />
                      </Field>
                    </div>
                  )}
                </>
              ) : (
                <div className="hawala-fields-grid">
                  <Field
                    label={t.hawala.senderName}
                    required
                    error={fieldErrors.senderName}
                    className="hawala-span-2"
                  >
                    <input
                      value={form.senderName}
                      onChange={(e) =>
                        patchForm({ senderName: e.target.value })
                      }
                    />
                  </Field>
                  <Field label={t.common.phone}>
                    <input
                      value={form.senderPhone}
                      onChange={(e) =>
                        patchForm({ senderPhone: e.target.value })
                      }
                    />
                  </Field>
                  <Field label={t.common.nationalId}>
                    <input
                      value={form.senderNationalId}
                      onChange={(e) =>
                        patchForm({ senderNationalId: e.target.value })
                      }
                    />
                  </Field>
                  <Field label={t.common.address} className="hawala-span-2">
                    <input
                      value={form.senderAddress}
                      onChange={(e) =>
                        patchForm({ senderAddress: e.target.value })
                      }
                    />
                  </Field>
                </div>
              )}
            </HawalaStep>

            <HawalaStep
              step={2}
              title={t.hawala.amountTill}
              hint={t.hawala.amountTillHint}
            >
              <div className="hawala-fields-grid">
                <Field
                  label={t.desk.hawalaNumber}
                  required
                  error={fieldErrors.reference}
                >
                  <input
                    value={form.reference}
                    onChange={(e) => patchForm({ reference: e.target.value })}
                  />
                </Field>
                <Field label={t.hawala.valueDate}>
                  <input
                    type="date"
                    value={form.valueDate}
                    onChange={(e) => patchForm({ valueDate: e.target.value })}
                  />
                </Field>
                <Field
                  label={t.common.currency}
                  required
                  error={fieldErrors.currencyCode}
                >
                  <select
                    value={form.currencyCode}
                    onChange={(e) =>
                      patchForm({ currencyCode: e.target.value })
                    }
                  >
                    <option value="">{t.common.select}</option>
                    {currencies.map((c) => (
                      <option key={c.id} value={c.code}>
                        {c.code} — {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t.common.amount} required error={fieldErrors.amount}>
                  <input
                    inputMode="decimal"
                    value={form.amount}
                    onChange={(e) => patchForm({ amount: e.target.value })}
                  />
                </Field>
                <Field
                  label={t.common.cashWallet}
                  required
                  error={fieldErrors.cashWalletId}
                  className="hawala-span-2"
                >
                  <select
                    value={form.cashWalletId}
                    onChange={(e) =>
                      patchForm({ cashWalletId: e.target.value })
                    }
                  >
                    <option value="">{t.common.select}</option>
                    {cashWallets.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({w.type})
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <button
                type="button"
                className="secondary hawala-extra-toggle"
                aria-expanded={openExtras.delivery}
                onClick={() =>
                  setOpenExtras((s) => ({ ...s, delivery: !s.delivery }))
                }
              >
                {openExtras.delivery
                  ? t.hawala.hideDeliveryOptions
                  : t.hawala.deliveryOptions}
              </button>
              {openExtras.delivery ? (
                <div className="hawala-fields-grid hawala-extra-panel">
                  <Field label={t.common.currency}>
                    <select
                      value={form.receiveCurrencyCode}
                      onChange={(e) =>
                        patchForm({ receiveCurrencyCode: e.target.value })
                      }
                    >
                      <option value="">{t.hawala.send}</option>
                      {currencies.map((c) => (
                        <option key={c.id} value={c.code}>
                          {c.code}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t.common.amount}>
                    <input
                      inputMode="decimal"
                      value={form.receiveAmount}
                      onChange={(e) =>
                        patchForm({ receiveAmount: e.target.value })
                      }
                    />
                  </Field>
                  <Field label={t.desk.rate}>
                    <input
                      inputMode="decimal"
                      value={form.exchangeRate}
                      onChange={(e) =>
                        patchForm({ exchangeRate: e.target.value })
                      }
                    />
                  </Field>
                  <Field label={t.desk.purpose}>
                    <select
                      value={form.purpose}
                      onChange={(e) => patchForm({ purpose: e.target.value })}
                    >
                      {PURPOSES.map((p) => (
                        <option key={p} value={p}>
                          {purposeLabel(t, p)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t.common.priority}>
                    <select
                      value={form.priority}
                      onChange={(e) => patchForm({ priority: e.target.value })}
                    >
                      {PRIORITIES.map((p) => (
                        <option key={p} value={p}>
                          {p === "NORMAL"
                            ? t.desk.normalPriority
                            : p === "URGENT"
                              ? t.desk.urgentPriority
                              : t.desk.immediatePriority}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t.hawala.expectedDeliveryDate}>
                    <input
                      type="date"
                      value={form.expectedDeliveryDate}
                      onChange={(e) =>
                        patchForm({ expectedDeliveryDate: e.target.value })
                      }
                    />
                  </Field>
                  <Field label={t.hawala.expectedDeliveryTime}>
                    <input
                      type="time"
                      value={form.expectedDeliveryTime}
                      onChange={(e) =>
                        patchForm({ expectedDeliveryTime: e.target.value })
                      }
                    />
                  </Field>
                </div>
              ) : null}
            </HawalaStep>

            <HawalaStep
              step={3}
              title={
                isSend ? t.hawala.partnerReceiver : t.hawala.partnerLocalReceiver
              }
              hint={
                isSend
                  ? t.hawala.partnerReceiverSendHint
                  : t.hawala.partnerReceiverReceiveHint
              }
            >
              <div className="hawala-fields-grid">
                <Field
                  label={t.hawala.partner}
                  required
                  error={fieldErrors.partnerId}
                  className="hawala-span-2"
                >
                  <select
                    value={form.partnerId}
                    onChange={(e) => {
                      const p = partners.find((x) => x.id === e.target.value);
                      patchForm({
                        partnerId: e.target.value,
                        country: form.country || p?.country || "",
                        city: form.city || p?.city || "",
                      });
                    }}
                  >
                    <option value="">{t.hawala.selectPartner}</option>
                    {partners.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.city ? ` · ${p.city}` : ""}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label={isSend ? t.hawala.destinationCountry : t.hawala.originCountry}
                  required
                  error={fieldErrors.country}
                >
                  <input
                    value={form.country}
                    onChange={(e) => patchForm({ country: e.target.value })}
                  />
                </Field>
                <Field
                  label={isSend ? t.hawala.destinationCity : t.hawala.originCity}
                  required
                  error={fieldErrors.city}
                >
                  <input
                    value={form.city}
                    onChange={(e) => patchForm({ city: e.target.value })}
                  />
                </Field>
                <Field label={t.hawala.partnerBranch} className="hawala-span-2">
                  <input
                    value={form.partnerBranch}
                    onChange={(e) =>
                      patchForm({ partnerBranch: e.target.value })
                    }
                  />
                </Field>
              </div>

              <div className="hawala-subblock">
                <h3 className="hawala-subblock-title">
                  {isSend ? t.hawala.receiverAbroad : t.desk.localReceiver}
                </h3>
                {!isSend ? (
                  <>
                    <ModeToggle
                      name="receiverMode"
                      value={form.receiverMode}
                      existingLabel={t.hawala.existingCustomer}
                      walkingLabel={t.desk.walkIn}
                      onChange={(next) =>
                        patchForm(
                          next === "walking"
                            ? {
                                receiverMode: "walking",
                                receiverCustomerId: "",
                              }
                            : { receiverMode: "existing" },
                        )
                      }
                    />
                    {form.receiverMode === "existing" ? (
                      <>
                        <Field
                          label={t.common.customer}
                          required
                          error={fieldErrors.receiverCustomerId}
                        >
                          <select
                            value={form.receiverCustomerId}
                            onChange={(e) =>
                              patchForm({
                                receiverCustomerId: e.target.value,
                              })
                            }
                          >
                            <option value="">{t.hawala.selectCustomer}</option>
                            {customers.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.fullName}
                                {c.phone ? ` · ${c.phone}` : ""}
                              </option>
                            ))}
                          </select>
                        </Field>
                        {receiveCustomerCtx ? (
                          <div className="hawala-ctx muted">
                            <strong>{receiveCustomerCtx.fullName}</strong>
                            {receiveCustomerCtx.phone
                              ? ` · ${receiveCustomerCtx.phone}`
                              : ""}
                            <div>
                            {t.hawala.balances}:{" "}
                              {receiveCustomerCtx.balances.length
                                ? receiveCustomerCtx.balances
                                    .map(
                                      (b) =>
                                        `${b.balance} ${b.currencyCode}`,
                                    )
                                    .join(", ")
                                : "—"}
                            </div>
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <Field
                        label={t.hawala.receiverName}
                        required
                        error={fieldErrors.receiverName}
                      >
                        <input
                          value={form.receiverName}
                          onChange={(e) =>
                            patchForm({ receiverName: e.target.value })
                          }
                        />
                      </Field>
                    )}
                  </>
                ) : (
                  <Field
                    label={t.hawala.receiverName}
                    required
                    error={fieldErrors.receiverName}
                  >
                    <input
                      value={form.receiverName}
                      onChange={(e) =>
                        patchForm({ receiverName: e.target.value })
                      }
                    />
                  </Field>
                )}

                {(isSend || form.receiverMode === "walking") && (
                  <div className="hawala-fields-grid">
                    <Field label={t.common.phone}>
                      <input
                        value={form.receiverPhone}
                        onChange={(e) =>
                          patchForm({ receiverPhone: e.target.value })
                        }
                      />
                    </Field>
                    <Field label={t.common.nationalId}>
                      <input
                        value={form.receiverNationalId}
                        onChange={(e) =>
                          patchForm({ receiverNationalId: e.target.value })
                        }
                      />
                    </Field>
                  </div>
                )}
                <div className="hawala-fields-grid">
                  <Field label={t.common.address} className="hawala-span-2">
                    <input
                      value={form.receiverAddress}
                      onChange={(e) =>
                        patchForm({ receiverAddress: e.target.value })
                      }
                    />
                  </Field>
                  <Field label={t.hawala.specialInstructions} className="hawala-span-2">
                    <textarea
                      rows={2}
                      value={form.specialInstructions}
                      onChange={(e) =>
                        patchForm({ specialInstructions: e.target.value })
                      }
                    />
                  </Field>
                </div>
              </div>
            </HawalaStep>

            <HawalaStep
              step={4}
              title={t.desk.feesSettlement}
              hint={
                isSend
                  ? t.hawala.feesSettlementSendHint
                  : t.hawala.feesSettlementReceiveHint
              }
            >
              <div className="hawala-fields-grid">
                <Field label={t.hawala.ownCommissionMode}>
                  <select
                    value={form.ownCommissionMode}
                    onChange={(e) =>
                      patchForm({
                        ownCommissionMode: e.target.value as
                          | "FIXED"
                          | "PERCENT",
                      })
                    }
                  >
                    <option value="FIXED">{t.hawala.fixed}</option>
                    <option value="PERCENT">{t.hawala.percent}</option>
                  </select>
                </Field>
                <Field
                  label={
                    form.ownCommissionMode === "PERCENT"
                      ? t.hawala.ownCommissionPercent
                      : t.hawala.ownCommissionCurrency.replace(
                          "{currency}",
                          form.currencyCode || "…",
                        )
                  }
                >
                  <input
                    inputMode="decimal"
                    value={form.ownCommission}
                    onChange={(e) =>
                      patchForm({ ownCommission: e.target.value })
                    }
                  />
                </Field>
                <Field
                  label={
                    isSend
                      ? t.hawala.partnerCommissionModePayable
                      : t.hawala.partnerCommissionModeReceivable
                  }
                >
                  <select
                    value={form.partnerCommissionMode}
                    onChange={(e) =>
                      patchForm({
                        partnerCommissionMode: e.target.value as
                          | "FIXED"
                          | "PERCENT",
                      })
                    }
                  >
                    <option value="FIXED">{t.hawala.fixed}</option>
                    <option value="PERCENT">{t.hawala.percent}</option>
                  </select>
                </Field>
                <Field
                  label={
                    form.partnerCommissionMode === "PERCENT"
                      ? t.hawala.partnerCommissionPercent
                      : t.hawala.partnerCommissionCurrency.replace(
                          "{currency}",
                          form.currencyCode || "…",
                        )
                  }
                >
                  <input
                    inputMode="decimal"
                    value={form.partnerCommission}
                    onChange={(e) =>
                      patchForm({ partnerCommission: e.target.value })
                    }
                  />
                </Field>
                <Field label={t.hawala.additionalCharges}>
                  <input
                    inputMode="decimal"
                    value={form.additionalCharges}
                    onChange={(e) =>
                      patchForm({ additionalCharges: e.target.value })
                    }
                  />
                </Field>
                <Field label={t.hawala.discount}>
                  <input
                    inputMode="decimal"
                    value={form.discountAmount}
                    onChange={(e) =>
                      patchForm({ discountAmount: e.target.value })
                    }
                  />
                </Field>
                <Field label={t.hawala.settlementType}>
                  <select
                    value={form.settlementType}
                    onChange={(e) =>
                      patchForm({ settlementType: e.target.value })
                    }
                  >
                    {SETTLEMENT_TYPES.map((s) => (
                      <option key={s} value={s}>
                        {settlementLabel(t, s)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <p className="muted hawala-fee-summary">
                {t.hawala.own}: {ownCommissionResolved ?? "0"}
                {` · ${t.hawala.partner}: ${partnerCommissionResolved ?? "0"}`}{" "}
                · {t.common.total}: {totalCharges} · {t.common.net}: {netToCustomer}{" "}
                {form.currencyCode}
              </p>
            </HawalaStep>
          </div>

          {/* Summary sticky */}
          <aside className="summary-sticky section-card stack">
              <h2>{t.common.details}</h2>
            <div>
              <div className="muted">{t.common.amount}</div>
              <div style={{ fontSize: "1.35rem", fontWeight: 700 }}>
                {form.amount || "0"} {form.currencyCode}
              </div>
            </div>
            <div>
              <div className="muted">{t.desk.ownCommission}</div>
              <div>{ownCommissionResolved ?? "0"}</div>
            </div>
            <div>
              <div className="muted">
                {isSend
                  ? t.hawala.partnerCommissionPayable
                  : t.hawala.partnerCommissionReceivable}
              </div>
              <div>{partnerCommissionResolved ?? "0"}</div>
            </div>
            <div>
              <div className="muted">{t.hawala.totalCharges}</div>
              <div>{totalCharges}</div>
            </div>
            <div>
              <div className="muted">{t.hawala.partner}</div>
              <div>{selectedPartner?.name ?? "—"}</div>
            </div>
            <div>
              <div className="muted">
                {isSend ? t.hawala.receiver : t.desk.localReceiver}
              </div>
              <div>
                {isSend
                  ? form.receiverName || "—"
                  : form.receiverMode === "existing"
                    ? receiveCustomerCtx?.fullName || "—"
                    : form.receiverName || "—"}
              </div>
            </div>
            <div>
              <div className="muted">{t.hawala.statusPreview}</div>
              <span className={statusBadgeClass("PENDING")}>{t.status.pending}</span>
            </div>

            <div className="stack no-print" style={{ marginTop: "0.5rem" }}>
              <button type="submit" disabled={busy}>
                {busy ? t.common.saving : t.common.save}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => void handleSave(true)}
              >
                {t.hawala.saveAndNew}
              </button>
            </div>

          </aside>
        </form>
      )}
    </div>
  );
}
