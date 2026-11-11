import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import {
  exchangeFunds,
  getExchangeDealDetail,
  getPreviousExchangeDeal,
  listCurrenciesPage,
  listCustomersPage,
  listPartners,
  listWalletsPage,
  previewDisplayRef,
  type CurrencyListItem,
  type CustomerListItem,
  type ExchangeDealDetail,
  type PartnerListItem,
} from "@desktop/api";
import { ModalFormActions } from "@desktop/components/modal-form-actions";
import { useAuth } from "@desktop/auth";
import { useLocale, useT } from "@desktop/i18n";
import { localizedCurrencyName } from "@desktop/lib/currency-labels";
import {
  pickDefaultCurrency,
  pickSecondaryCurrency,
} from "@desktop/lib/default-currency";
import {
  endSubmit,
  errorMessage,
  todayIso,
  tryBeginSubmit,
} from "@desktop/lib/datetime";
import { useDeskFormDraftRetain } from "@desktop/lib/desk-form-draft";
import {
  handleDeskFormKeyDown,
  handleDeskSearchEnter,
} from "@desktop/lib/form-keyboard";
import { AmountInput } from "@desktop/ui/amount-input";
import { CurrencyPicker } from "@desktop/ui/currency-picker";
import { appendEmployeeLine, EmployeeField } from "@desktop/ui/employee-field";
import { Modal } from "@desktop/ui/modal";
import { SuccessModal } from "@desktop/ui/success-modal";
import { loadDeskVoucher, newInternalRef, txDisplayRef } from "@desktop/lib/tx-ref";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  /** Open in edit mode for this EXCHANGE transaction id */
  editTransactionId?: string | null;
};

/** Which currency is the "1 X = ? Y" base of the quoted rate. */
type RateBase = "buy" | "sell";
type PartyMode = "walkin" | "customer" | "partner";
/** Which side the cashier is focusing on — controls field order in the form. */
type DealSide = "buy" | "sell";

function parseNum(raw: string): number | null {
  const n = Number(String(raw).replace(/,/g, "").trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatAmount(n: number, places = 6): string {
  if (!Number.isFinite(n)) return "";
  const fixed = n.toFixed(Math.min(Math.max(places, 0), 8));
  return fixed.replace(/\.?0+$/, "") || "0";
}

/**
 * Convert buy → sell using quoted rate "1 base = rate quote".
 * - base = buy  → sell = buy × rate
 * - base = sell → sell = buy ÷ rate
 */
function buyToSell(buy: number, rate: number, rateBase: RateBase): number | null {
  if (buy <= 0 || rate <= 0) return null;
  return rateBase === "buy" ? buy * rate : buy / rate;
}

function sellToBuy(sell: number, rate: number, rateBase: RateBase): number | null {
  if (sell <= 0 || rate <= 0) return null;
  return rateBase === "buy" ? sell / rate : sell * rate;
}

function emptyForm(buyCurrency = "", sellCurrency = "") {
  return {
    reference: "",
    valueDate: todayIso(),
    partyMode: "customer" as PartyMode,
    dealSide: "buy" as DealSide,
    buyAmount: "",
    buyCurrency,
    sellAmount: "",
    sellCurrency,
    rate: "",
    rateBase: "buy" as RateBase,
    customerId: "",
    customerLabel: "",
    partnerId: "",
    partnerLabel: "",
    walkInName: "",
  };
}

export function ExchangeFormModal({
  open,
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
  const { retainDraft, discardDraft, shouldRetainDraft } = useDeskFormDraftRetain();

  const [currencies, setCurrencies] = useState<CurrencyListItem[]>([]);
  const [partners, setPartners] = useState<PartnerListItem[]>([]);
  const [form, setForm] = useState(() => emptyForm());
  const [voucherNo, setVoucherNo] = useState("");
  const [replaceId, setReplaceId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<CustomerListItem[]>([]);
  const [partnerSuggestions, setPartnerSuggestions] = useState<PartnerListItem[]>(
    [],
  );
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [lastEdited, setLastEdited] = useState<"buy" | "rate" | "sell">("buy");
  const [employeeId, setEmployeeId] = useState("");
  const [employeeName, setEmployeeName] = useState("");

  const autoDescription = useMemo(() => {
    const buyAmt = form.buyAmount.trim() || "0";
    const sellAmt = form.sellAmount.trim() || "0";
    const buyCcy = form.buyCurrency
      ? localizedCurrencyName(form.buyCurrency, locale, form.buyCurrency)
      : "—";
    const sellCcy = form.sellCurrency
      ? localizedCurrencyName(form.sellCurrency, locale, form.sellCurrency)
      : "—";
    const rate = form.rate.trim() || "—";
    const party =
      form.partyMode === "customer"
        ? form.customerLabel.trim()
        : form.partyMode === "partner"
          ? form.partnerLabel.trim()
          : form.walkInName.trim();
    const core = t.exchange.autoDescription
      .replace("{buyAmount}", buyAmt)
      .replace("{buyCurrency}", buyCcy)
      .replace("{sellAmount}", sellAmt)
      .replace("{sellCurrency}", sellCcy)
      .replace("{rate}", rate);
    return party ? `${party} — ${core}` : core;
  }, [
    form.buyAmount,
    form.buyCurrency,
    form.sellAmount,
    form.sellCurrency,
    form.rate,
    form.partyMode,
    form.customerLabel,
    form.partnerLabel,
    form.walkInName,
    locale,
    t.exchange.autoDescription,
  ]);

  const rateOpHints = useMemo(() => {
    const buy = form.buyCurrency || "—";
    const sell = form.sellCurrency || "—";
    // In sell-first mode the × button bases on sell, so phrase from that side.
    if (form.dealSide === "sell") {
      return {
        multiply: t.exchange.rateOpMultiplyHint
          .replace("{buy}", sell)
          .replace("{sell}", buy),
        divide: t.exchange.rateOpDivideHint
          .replace("{buy}", sell)
          .replace("{sell}", buy),
      };
    }
    return {
      multiply: t.exchange.rateOpMultiplyHint
        .replace("{buy}", buy)
        .replace("{sell}", sell),
      divide: t.exchange.rateOpDivideHint
        .replace("{buy}", buy)
        .replace("{sell}", sell),
    };
  }, [
    form.dealSide,
    form.buyCurrency,
    form.sellCurrency,
    t.exchange.rateOpDivideHint,
    t.exchange.rateOpMultiplyHint,
  ]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void Promise.all([
      listCurrenciesPage({ activeOnly: true, pageSize: 100 }),
      listPartners(),
    ])
      .then(async ([page, partnerRows]) => {
        if (cancelled) return;
        setCurrencies(page.items);
        setPartners(partnerRows);
        const buy = pickDefaultCurrency(page.items);
        const sell = pickSecondaryCurrency(page.items, buy);

        if (editTransactionId) {
          discardDraft();
          try {
            const deal = await getExchangeDealDetail(editTransactionId);
            if (cancelled) return;
            applyDealDetail(deal, partnerRows);
            return;
          } catch (err: unknown) {
            if (!cancelled) setError(errorMessage(err));
          }
        }

        if (shouldRetainDraft()) {
          setSuggestions([]);
          setPartnerSuggestions([]);
          setShowSuggestions(false);
          setError(null);
          return;
        }

        setReplaceId(null);
        setForm((prev) => ({
          ...emptyForm(buy, sell),
          buyCurrency: prev.buyCurrency || buy,
          sellCurrency: prev.sellCurrency || sell,
        }));
        setVoucherNo("");
        const voucher = await loadDeskVoucher(() =>
          previewDisplayRef("EXCHANGE"),
        );
        if (!cancelled) setVoucherNo(voucher);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [open, editTransactionId]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => amountRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [open, form.dealSide]);

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
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [form.customerLabel, form.customerId, form.partyMode, open]);

  useEffect(() => {
    if (!open || form.partyMode !== "partner") {
      setPartnerSuggestions([]);
      if (form.partyMode !== "customer") setHighlight(-1);
      return;
    }
    const q = form.partnerLabel.trim().toLowerCase();
    if (form.partnerId || q.length < 1) {
      setPartnerSuggestions([]);
      setHighlight(-1);
      return;
    }
    const filtered = partners.filter((p) => {
      const hay = [p.name, p.phone, p.city, p.country]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    }).slice(0, 12);
    setPartnerSuggestions(filtered);
    setHighlight(filtered.length > 0 ? 0 : -1);
  }, [form.partnerLabel, form.partnerId, form.partyMode, open, partners]);

  // Keep rate base valid when currencies change.
  useEffect(() => {
    if (!form.buyCurrency || !form.sellCurrency) return;
    if (form.buyCurrency === form.sellCurrency) {
      const next =
        currencies.find((c) => c.code !== form.buyCurrency)?.code || form.sellCurrency;
      if (next && next !== form.sellCurrency) {
        setForm((prev) => ({ ...prev, sellCurrency: next }));
      }
    }
  }, [form.buyCurrency, form.sellCurrency, currencies]);

  // Recalculate the opposite amount when primary amount / rate changes.
  // Manual edits to the secondary amount must not overwrite the primary side
  // (sell-first: editing buy keeps sell; buy-first: editing sell keeps buy).
  useEffect(() => {
    const rateN = parseNum(form.rate);
    if (!rateN || !form.buyCurrency || !form.sellCurrency) return;
    if (form.buyCurrency === form.sellCurrency) return;

    // User manually adjusted the secondary amount — leave both amounts as typed.
    if (lastEdited === "buy" && form.dealSide === "sell") return;
    if (lastEdited === "sell" && form.dealSide === "buy") return;

    if (
      lastEdited === "sell" ||
      (lastEdited === "rate" && form.dealSide === "sell")
    ) {
      const sellN = parseNum(form.sellAmount);
      if (sellN == null) return;
      const next = sellToBuy(sellN, rateN, form.rateBase);
      if (next == null) return;
      const formatted = formatAmount(next);
      setForm((prev) =>
        prev.buyAmount === formatted ? prev : { ...prev, buyAmount: formatted },
      );
      return;
    }

    if (
      lastEdited === "buy" ||
      (lastEdited === "rate" && form.dealSide === "buy")
    ) {
      const buyN = parseNum(form.buyAmount);
      if (buyN == null) return;
      const next = buyToSell(buyN, rateN, form.rateBase);
      if (next == null) return;
      const formatted = formatAmount(next);
      setForm((prev) =>
        prev.sellAmount === formatted ? prev : { ...prev, sellAmount: formatted },
      );
    }
  }, [
    form.buyAmount,
    form.sellAmount,
    form.rate,
    form.rateBase,
    form.dealSide,
    lastEdited,
  ]);

  function softClose() {
    retainDraft();
    setSuggestions([]);
    setPartnerSuggestions([]);
    setShowSuggestions(false);
    setError(null);
    onClose();
  }

  function resetForm(keepOpen: boolean) {
    discardDraft();
    const buy = pickDefaultCurrency(currencies) || form.buyCurrency;
    const sell = pickSecondaryCurrency(currencies, buy) || form.sellCurrency;
    setForm(emptyForm(buy, sell));
    setReplaceId(null);
    setVoucherNo("");
    if (keepOpen) {
      void loadDeskVoucher(() => previewDisplayRef("EXCHANGE")).then(setVoucherNo);
    }
    setEmployeeId("");
    setEmployeeName("");
    setError(null);
    setSuggestions([]);
    setPartnerSuggestions([]);
    setShowSuggestions(false);
    setHighlight(-1);
    setLastEdited("buy");
    if (!keepOpen) onClose();
    else window.setTimeout(() => amountRef.current?.focus(), 50);
  }

  function applyDealDetail(deal: ExchangeDealDetail, partnerRows: PartnerListItem[]) {
    const rateBase: RateBase =
      deal.side.toUpperCase() === "BUY_HIGH" ? "buy" : "sell";
    const isCustomer = !!deal.customerId;
    const walkName = (deal.walkInName || "").trim();
    const matchedPartner = !isCustomer
      ? partnerRows.find(
          (p) => p.name.trim().toLowerCase() === walkName.toLowerCase(),
        )
      : undefined;
    setReplaceId(deal.transactionId);
    setVoucherNo(txDisplayRef(deal));
    setForm({
      reference: deal.reference,
      valueDate: String(deal.valueDate).slice(0, 10),
      partyMode: isCustomer
        ? "customer"
        : matchedPartner
          ? "partner"
          : "walkin",
      dealSide: rateBase,
      buyAmount: deal.fromAmount,
      buyCurrency: deal.fromCurrency,
      sellAmount: deal.toAmount,
      sellCurrency: deal.toCurrency,
      rate: deal.dealRate,
      rateBase,
      customerId: deal.customerId || "",
      customerLabel: deal.customerName || "",
      partnerId: matchedPartner?.id || "",
      partnerLabel: matchedPartner?.name || "",
      walkInName: matchedPartner ? "" : deal.walkInName || "",
    });
    setEmployeeId("");
    setEmployeeName("");
    setLastEdited(rateBase);
    setSuggestions([]);
    setPartnerSuggestions([]);
    setShowSuggestions(false);
    setHighlight(-1);
    setError(null);
  }

  async function loadPrevious() {
    setError(null);
    try {
      const deal = await getPreviousExchangeDeal(replaceId || undefined);
      if (!deal) {
        setError(t.desk.noPreviousRecord);
        return;
      }
      applyDealDetail(deal, partners);
    } catch (err: unknown) {
      setError(errorMessage(err));
    }
  }

  function setPartyMode(mode: "walkin" | "customer") {
    setForm((prev) => ({
      ...prev,
      partyMode: mode,
      customerId: "",
      customerLabel: "",
      partnerId: "",
      partnerLabel: "",
      walkInName: "",
    }));
    setSuggestions([]);
    setPartnerSuggestions([]);
    setShowSuggestions(false);
    setError(null);
  }

  function setDealSide(side: DealSide) {
    // Only reorder fields — keep lastEdited so a manually typed secondary
    // amount is not wiped by the auto-calc effect.
    setForm((prev) => ({ ...prev, dealSide: side }));
    setError(null);
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

  function pickPartner(p: PartnerListItem) {
    setForm((prev) => ({
      ...prev,
      partnerId: p.id,
      partnerLabel: p.name,
    }));
    setShowSuggestions(false);
    setPartnerSuggestions([]);
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

  function onPartnerKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (
      handleDeskSearchEnter(e, {
        listOpen: showSuggestions && partnerSuggestions.length > 0,
        canSelect: partnerSuggestions.length > 0,
        select: () => {
          const pickIdx = highlight >= 0 ? highlight : 0;
          if (partnerSuggestions[pickIdx]) pickPartner(partnerSuggestions[pickIdx]);
        },
      })
    ) {
      return;
    }
    if (!showSuggestions || partnerSuggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((i) => (i + 1) % partnerSuggestions.length);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((i) => (i <= 0 ? partnerSuggestions.length - 1 : i - 1));
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setShowSuggestions(false);
      setHighlight(-1);
    }
  }

  async function resolveCustomerWallets(customerId: string) {
    const page = await listWalletsPage({
      walletType: "CUSTOMER",
      customerId,
      activeOnly: true,
      pageSize: 5,
    });
    const walletId = page.items[0]?.id;
    if (!walletId) throw new Error(t.exchange.customerWalletMissing);
    return { fromWalletId: walletId, toWalletId: walletId };
  }

  async function submit(action: "save" | "new") {
    if (!session) return;
    const buyAmount = form.buyAmount.trim();
    const sellAmount = form.sellAmount.trim();
    const rate = form.rate.trim();

    if (!parseNum(buyAmount) || !parseNum(sellAmount)) {
      setError(t.desk.enterAmount);
      amountRef.current?.focus();
      return;
    }
    if (!parseNum(rate)) {
      setError(t.exchange.rateRequired);
      return;
    }
    if (!form.buyCurrency) {
      setError(t.exchange.selectBuyCurrency);
      amountRef.current?.focus();
      return;
    }
    if (!form.sellCurrency) {
      setError(t.exchange.selectSellCurrency);
      amountRef.current?.focus();
      return;
    }
    if (form.buyCurrency === form.sellCurrency) {
      setError(t.exchange.currenciesMustDiffer);
      amountRef.current?.focus();
      return;
    }
    if (form.partyMode === "customer" && !form.customerId) {
      setError(t.exchange.selectCustomerForExchange);
      searchWrapRef.current?.querySelector("input")?.focus();
      return;
    }
    if (form.partyMode === "partner" && !form.partnerId) {
      setError(t.exchange.selectPartnerForExchange);
      searchWrapRef.current?.querySelector("input")?.focus();
      return;
    }
    if (form.partyMode === "walkin" && !form.walkInName.trim()) {
      setError(t.exchange.walkInNameRequired);
      return;
    }

    if (!tryBeginSubmit(submittingRef)) return;
    setSaving(true);
    setError(null);
    try {
      const highCurrency =
        form.rateBase === "buy" ? form.buyCurrency : form.sellCurrency;

      let fromWalletId = "";
      let toWalletId = "";
      let customerId: string | null = null;
      let walkInName: string | null = null;

      if (form.partyMode === "customer") {
        const wallets = await resolveCustomerWallets(form.customerId);
        fromWalletId = wallets.fromWalletId;
        toWalletId = wallets.toWalletId;
        customerId = form.customerId;
      } else if (form.partyMode === "partner") {
        const partner = partners.find((p) => p.id === form.partnerId);
        walkInName = (partner?.name || form.partnerLabel).trim();
        if (!walkInName) {
          setError(t.exchange.selectPartnerForExchange);
          endSubmit(submittingRef);
          setSaving(false);
          return;
        }
      } else {
        walkInName = form.walkInName.trim();
      }

      const result = await exchangeFunds({
        reference: replaceId
          ? form.reference.trim() || newInternalRef("FX")
          : newInternalRef("FX"),
        fromWalletId,
        toWalletId,
        fromCurrencyCode: form.buyCurrency,
        toCurrencyCode: form.sellCurrency,
        amount: buyAmount,
        toAmount: sellAmount,
        dealRate: rate,
        highCurrencyCode: highCurrency,
        customerId,
        walkInName,
        valueDate: form.valueDate || todayIso(),
        description: appendEmployeeLine(
          autoDescription,
          employeeName,
          t.employees.employee,
        ),
        createdById: session.userId,
        replaceTransactionId: replaceId || undefined,
      });

      onSaved?.();
      if (action === "save") {
        const pnlN = parseNum(result.profitAmount);
        const pnl =
          pnlN != null && Math.abs(pnlN) > 1e-9
            ? ` · ${result.isProfit ? t.desk.profit : t.desk.loss} ${result.profitAmount} ${result.profitCurrencyCode}`
            : "";
        setSuccessMessage(
          t.exchange.postedOk
            .replace("{fromAmount}", result.fromAmount)
            .replace("{fromCurrency}", result.fromCurrencyCode)
            .replace("{toAmount}", result.toAmount)
            .replace("{toCurrency}", result.toCurrencyCode)
            .replace("{dealRate}", result.dealRate)
            .replace("{pnl}", pnl),
        );
        resetForm(false);
      } else {
        resetForm(true);
      }
    } catch (err: unknown) {
      setError(errorMessage(err, t.errors.exchangeSave));
    } finally {
      endSubmit(submittingRef);
      setSaving(false);
    }
  }

  if (!open && !successMessage) return null;

  const buyFirst = form.dealSide === "buy";
  const buyRow = (
    <div className="money-ccy-row" key="buy">
      <label className="money-ccy-amount">
        {t.exchange.buyAmountLabel} *
        <AmountInput
          ref={buyFirst ? amountRef : undefined}
          value={form.buyAmount}
          placeholder={t.common.amountPlaceholder}
          onValueChange={(v) => {
            setLastEdited("buy");
            setForm((prev) => ({ ...prev, buyAmount: v }));
            setError(null);
          }}
        />
      </label>
      <CurrencyPicker
        label={t.common.currency}
        required
        currencies={currencies}
        value={form.buyCurrency}
        emptyLabel={t.common.noData}
        searchPlaceholder={t.common.search}
        onCurrenciesChange={setCurrencies}
        onChange={(code) => {
          setForm((prev) => ({ ...prev, buyCurrency: code }));
          setError(null);
        }}
      />
    </div>
  );
  const sellRow = (
    <div className="money-ccy-row" key="sell">
      <label className="money-ccy-amount">
        {t.exchange.sellAmountLabel} *
        <AmountInput
          ref={!buyFirst ? amountRef : undefined}
          value={form.sellAmount}
          placeholder={t.common.amountPlaceholder}
          onValueChange={(v) => {
            setLastEdited("sell");
            setForm((prev) => ({ ...prev, sellAmount: v }));
            setError(null);
          }}
        />
      </label>
      <CurrencyPicker
        label={t.common.currency}
        required
        currencies={currencies}
        value={form.sellCurrency}
        emptyLabel={t.common.noData}
        searchPlaceholder={t.common.search}
        onCurrenciesChange={setCurrencies}
        onChange={(code) => {
          setForm((prev) => ({ ...prev, sellCurrency: code }));
          setError(null);
        }}
      />
    </div>
  );
  const multiplySetsBase: RateBase = form.dealSide === "sell" ? "sell" : "buy";
  const divideSetsBase: RateBase = form.dealSide === "sell" ? "buy" : "sell";

  const rateBlock = (
    <div className="movement-fx-convert" key="rate">
      <div className="fx-simple-rate-row hawala-fx-ops">
        <div
          className="hawala-mode-toggle"
          role="group"
          aria-label={t.exchange.rateOpLabel}
          data-desk-choice-group
        >
          <button
            type="button"
            className={form.rateBase === multiplySetsBase ? "hawala-mode active" : "hawala-mode"}
            aria-pressed={form.rateBase === multiplySetsBase}
            title={rateOpHints.multiply}
            onClick={() => {
              setLastEdited("rate");
              setForm((prev) => ({ ...prev, rateBase: multiplySetsBase }));
              setError(null);
            }}
          >
            ×
          </button>
          <button
            type="button"
            className={form.rateBase === divideSetsBase ? "hawala-mode active" : "hawala-mode"}
            aria-pressed={form.rateBase === divideSetsBase}
            title={rateOpHints.divide}
            onClick={() => {
              setLastEdited("rate");
              setForm((prev) => ({ ...prev, rateBase: divideSetsBase }));
              setError(null);
            }}
          >
            ÷
          </button>
        </div>
        <label>
          <span>{t.exchange.exchangeRate}</span>
          <AmountInput
            value={form.rate}
            placeholder="0"
            onValueChange={(v) => {
              setLastEdited("rate");
              setForm((prev) => ({ ...prev, rate: v }));
              setError(null);
            }}
          />
        </label>
      </div>
    </div>
  );

  return (
    <>
      {open ? (
        <Modal title={t.dashboard.exchangeBuySell} size="xl" onClose={softClose}>
          <div
            className="hawala-form-compact exchange-form-compact desk-qa-form"
            data-desk-form
            data-qa-tone="exchange"
            onKeyDown={(e) =>
              handleDeskFormKeyDown(e, {
                busy: saving,
                onSubmit: () => void submit("save"),
              })
            }
          >
            <div className="exchange-compact-top">
              <div>
                <div className="muted hawala-compact-label">{t.exchange.dealSideLabel}</div>
                <div
                  className="hawala-mode-toggle"
                  role="group"
                  aria-label={t.exchange.dealSideLabel}
                  data-desk-choice-group
                >
                  <button
                    type="button"
                    className={form.dealSide === "buy" ? "hawala-mode active" : "hawala-mode"}
                    aria-pressed={form.dealSide === "buy"}
                    onClick={() => setDealSide("buy")}
                  >
                    {t.exchange.dealSideBuy}
                  </button>
                  <button
                    type="button"
                    className={form.dealSide === "sell" ? "hawala-mode active" : "hawala-mode"}
                    aria-pressed={form.dealSide === "sell"}
                    onClick={() => setDealSide("sell")}
                  >
                    {t.exchange.dealSideSell}
                  </button>
                </div>
              </div>
              <div className="exchange-compact-meta">
                <label className="desk-ref-field">
                  <span>{t.exchange.documentNumber}</span>
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
            </div>

            <div className="movement-form-party-row">
              <div>
                <div className="muted hawala-compact-label">{t.exchange.exchangeFor}</div>
                <div
                  className="hawala-mode-toggle"
                  role="group"
                  aria-label={t.exchange.exchangeFor}
                  data-desk-choice-group
                >
                  <button
                    type="button"
                    className={form.partyMode === "walkin" ? "hawala-mode active" : "hawala-mode"}
                    aria-pressed={form.partyMode === "walkin"}
                    onClick={() => setPartyMode("walkin")}
                  >
                    {t.desk.walkIn}
                  </button>
                  <button
                    type="button"
                    className={
                      form.partyMode === "customer" ? "hawala-mode active" : "hawala-mode"
                    }
                    aria-pressed={form.partyMode === "customer"}
                    onClick={() => setPartyMode("customer")}
                  >
                    {t.common.customer}
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

            {form.partyMode === "walkin" ? (
              <label>
                <span>{t.exchange.walkInName} *</span>
                <input
                  value={form.walkInName}
                  placeholder={t.exchange.walkInName}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, walkInName: e.target.value }));
                    setError(null);
                  }}
                />
              </label>
            ) : null}

            {form.partyMode === "customer" ? (
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
                      <li className="customer-suggest-empty muted">{t.common.loading}</li>
                    ) : null}
                    {!suggestBusy && suggestions.length === 0 ? (
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
            ) : null}

            {form.partyMode === "partner" ? (
              <label ref={searchWrapRef} className="customer-search-wrap">
                <span>{t.desk.partnerSarafi} *</span>
                <input
                  value={form.partnerLabel}
                  placeholder={t.exchange.partnerSearchPlaceholder}
                  autoComplete="off"
                  aria-autocomplete="list"
                  aria-expanded={showSuggestions && partnerSuggestions.length > 0}
                  onChange={(e) => {
                    setForm((prev) => ({
                      ...prev,
                      partnerId: "",
                      partnerLabel: e.target.value,
                    }));
                    setShowSuggestions(true);
                    setError(null);
                  }}
                  onFocus={() => {
                    if (!form.partnerId) setShowSuggestions(true);
                  }}
                  onKeyDown={onPartnerKeyDown}
                />
                {showSuggestions &&
                form.partnerLabel.trim().length > 0 &&
                !form.partnerId ? (
                  <ul className="customer-suggest" role="listbox">
                    {partnerSuggestions.length === 0 ? (
                      <li className="customer-suggest-empty muted">
                        {t.customers.emptyFiltered}
                      </li>
                    ) : null}
                    {partnerSuggestions.map((p, idx) => (
                      <li key={p.id} role="option" aria-selected={idx === highlight}>
                        <button
                          type="button"
                          tabIndex={-1}
                          className={`customer-suggest-item${idx === highlight ? " is-active" : ""}`}
                          onMouseEnter={() => setHighlight(idx)}
                          onClick={() => pickPartner(p)}
                        >
                          <span className="customer-suggest-name">{p.name}</span>
                          <span className="customer-suggest-meta muted">
                            {[p.phone, p.city, p.country].filter(Boolean).join(" · ") ||
                              "—"}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </label>
            ) : null}

            <div className="movement-fx is-converting exchange-compact-fx">
              <div className="hawala-compact-money">
                {buyFirst ? buyRow : sellRow}
                {buyFirst ? sellRow : buyRow}
              </div>
              {rateBlock}
            </div>

            <p className="muted exchange-compact-desc" title={autoDescription}>
              {autoDescription}
            </p>

            <ModalFormActions
              inline
              busy={saving}
              error={error}
              previousLabel={t.common.previous}
              saveLabel={saving ? t.common.saving : t.common.save}
              saveAndNewLabel={t.exchange.newExchange}
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
