import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";

import {
  createPartnerFromCustomer,
  listCurrenciesPage,
  type CurrencyListItem,
  type CustomerDetail,
  type PartnerDetail,
} from "@desktop/api";
import { useAuth } from "@desktop/auth";
import { useT } from "@desktop/i18n";
import {
  endSubmit,
  errorMessage,
  tryBeginSubmit,
} from "@desktop/lib/datetime";
import { pickDefaultCurrency } from "@desktop/lib/default-currency";
import { handleDeskFormKeyDown } from "@desktop/lib/form-keyboard";
import { ModalErrorBanner } from "@desktop/ui/modal-error-banner";
import {
  emptyOpeningLine,
  OpeningKataFields,
  type OpeningLine,
} from "@desktop/ui/opening-kata-fields";

type CreatePartnerFromCustomerModalProps = {
  customer: CustomerDetail;
  onCancel: () => void;
  onCreated: (partner: PartnerDetail) => void;
};

function mapOpeningKata(lines: OpeningLine[]) {
  return lines
    .filter((l) => l.amount.trim())
    .map((l) => ({
      transactionId: l.transactionId ?? null,
      currencyCode: l.currencyCode,
      amount: l.amount.trim(),
      direction: l.direction,
      description: l.description.trim() || null,
      notes: l.notes.trim() || null,
      valueDate: l.valueDate.trim() || null,
    }));
}

export function CreatePartnerFromCustomerModal({
  customer,
  onCancel,
  onCreated,
}: CreatePartnerFromCustomerModalProps) {
  const t = useT();
  const { session } = useAuth();
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [notes, setNotes] = useState(customer.notes ?? "");
  const [commissionEnabled, setCommissionEnabled] = useState(false);
  const [commissionPerAmount, setCommissionPerAmount] = useState("");
  const [commissionFeeAmount, setCommissionFeeAmount] = useState("");
  const [commissionCurrencyId, setCommissionCurrencyId] = useState("");
  const [currencies, setCurrencies] = useState<CurrencyListItem[]>([]);
  const [openingLines, setOpeningLines] = useState<OpeningLine[]>(() => [
    emptyOpeningLine("AFN", t.openingKata.partnerDefaultDescription),
  ]);
  const [busy, setBusy] = useState(false);
  const submittingRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listCurrenciesPage({ activeOnly: true, pageSize: 100 })
      .then((pageResult) => {
        if (cancelled) return;
        setCurrencies(pageResult.items);
        const defaultCcy = pickDefaultCurrency(pageResult.items);
        const defaultId =
          pageResult.items.find((c) => c.code === defaultCcy)?.id ?? "";
        setCommissionCurrencyId((prev) => prev || defaultId);
        setOpeningLines((prev) =>
          prev.map((line) => ({
            ...line,
            currencyCode: line.currencyCode || defaultCcy,
          })),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [t.openingKata.partnerDefaultDescription]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!session?.userId) {
      setError(t.hawala.notSignedIn);
      return;
    }
    if (!customer.phone?.trim()) {
      setError(t.customers.addAsPartnerNeedPhone);
      return;
    }
    if (!tryBeginSubmit(submittingRef)) return;
    setBusy(true);
    setError(null);
    try {
      const openingKata = mapOpeningKata(openingLines);
      const created = await createPartnerFromCustomer({
        customerId: customer.id,
        city: city.trim() || null,
        country: country.trim() || null,
        notes: notes.trim() || null,
        commissionEnabled,
        commissionPerAmount: commissionEnabled
          ? commissionPerAmount.trim() || null
          : null,
        commissionFeeAmount: commissionEnabled
          ? commissionFeeAmount.trim() || null
          : null,
        commissionCurrencyId: commissionEnabled
          ? commissionCurrencyId || null
          : null,
        openingKata: openingKata.length ? openingKata : null,
        actorUserId: session.userId,
      });
      onCreated(created);
    } catch (err: unknown) {
      setError(errorMessage(err, t.customers.addAsPartnerError));
    } finally {
      endSubmit(submittingRef);
      setBusy(false);
    }
  }

  return (
    <form
      ref={formRef}
      className="stack"
      data-desk-form
      onKeyDown={(e: ReactKeyboardEvent<HTMLFormElement>) =>
        handleDeskFormKeyDown(e, {
          busy,
          onSubmit: () => formRef.current?.requestSubmit(),
        })
      }
      onSubmit={(e) => void handleSubmit(e)}
    >
      <p className="muted">{t.customers.addAsPartnerHint}</p>
      <div className="exchange-fields-grid">
        <label>
          {t.common.name}
          <input value={customer.fullName} readOnly disabled />
        </label>
        <label>
          {t.common.phone}
          <input value={customer.phone ?? ""} readOnly disabled />
        </label>
        <label>
          {t.common.city}
          <input value={city} onChange={(e) => setCity(e.target.value)} />
        </label>
        <label>
          {t.common.country}
          <input value={country} onChange={(e) => setCountry(e.target.value)} />
        </label>
        <label style={{ gridColumn: "1 / -1" }}>
          {t.common.notes}
          <input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>
      <label className="row" style={{ alignItems: "center", gap: "0.4rem" }}>
        <input
          type="checkbox"
          checked={commissionEnabled}
          onChange={(e) => setCommissionEnabled(e.target.checked)}
        />
        {t.partner.trackCommission}
      </label>
      {commissionEnabled ? (
        <div className="exchange-fields-grid">
          <label>
            {t.partner.forEveryAmount}
            <input
              inputMode="decimal"
              value={commissionPerAmount}
              onChange={(e) => setCommissionPerAmount(e.target.value)}
              placeholder="100"
            />
          </label>
          <label>
            {t.partner.commissionIs}
            <input
              inputMode="decimal"
              value={commissionFeeAmount}
              onChange={(e) => setCommissionFeeAmount(e.target.value)}
              placeholder="200"
            />
          </label>
          <label>
            {t.common.currency}
            <select
              value={commissionCurrencyId}
              onChange={(e) => setCommissionCurrencyId(e.target.value)}
            >
              {currencies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
      <OpeningKataFields
        currencies={currencies}
        lines={openingLines}
        onChange={(index, patch) =>
          setOpeningLines((rows) =>
            rows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
          )
        }
        onAdd={() =>
          setOpeningLines((rows) => [
            ...rows,
            emptyOpeningLine(
              pickDefaultCurrency(currencies),
              t.openingKata.partnerDefaultDescription,
            ),
          ])
        }
        onRemove={(index) =>
          setOpeningLines((rows) => rows.filter((_, i) => i !== index))
        }
        onCurrenciesChange={setCurrencies}
        helper={t.openingKata.newPartnerHelper}
        giveLabel={t.openingKata.partnerGives}
        takeLabel={t.openingKata.partnerTakes}
      />
      <ModalErrorBanner message={error} />
      <div className="row" style={{ justifyContent: "flex-end", gap: "0.5rem" }}>
        <button
          type="button"
          className="btn btn-action btn-action--cancel"
          disabled={busy}
          onClick={onCancel}
        >
          {t.common.cancel}
        </button>
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? t.common.saving : t.customers.addAsPartner}
        </button>
      </div>
    </form>
  );
}
