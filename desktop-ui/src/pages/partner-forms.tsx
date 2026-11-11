import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";

import {
  createPartner,
  listCurrenciesPage,
  updatePartner,
  type CurrencyListItem,
  type PartnerDetail,
} from "@desktop/api";
import { useAuth } from "@desktop/auth";
import { notifyDeskDataChanged, notifyPartnerCreated } from "@desktop/lib/desk-events";
import { useT } from "@desktop/i18n";
import {
  endSubmit,
  errorMessage,
  tryBeginSubmit,
} from "@desktop/lib/datetime";
import { pickDefaultCurrency } from "@desktop/lib/default-currency";
import { handleDeskFormKeyDown } from "@desktop/lib/form-keyboard";
import { validatePhone } from "@desktop/lib/validation/phone";
import { ModalErrorBanner } from "@desktop/ui/modal-error-banner";
import {
  emptyOpeningLine,
  OpeningKataFields,
  type OpeningLine,
} from "@desktop/ui/opening-kata-fields";
import { PhoneInput } from "@desktop/ui/phone-input";

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

function mapApiOpeningToLine(
  line: NonNullable<PartnerDetail["openingKata"]>[number],
  defaultDescription: string,
): OpeningLine {
  return {
    transactionId: line.transactionId,
    currencyCode: line.currencyCode,
    amount: line.amount,
    direction: line.direction === "TAKE" ? "TAKE" : "GIVE",
    description: line.description || defaultDescription,
    notes: line.notes ?? "",
    valueDate: line.valueDate,
  };
}

type PartnerFormProps = {
  onCancel: () => void;
  /** Create mode */
  onCreated?: (partner: PartnerDetail) => void;
  /** Edit mode — same fields as create, plus active */
  partner?: PartnerDetail | null;
  onUpdated?: (partner: PartnerDetail) => void;
};

export function PartnerForm({
  onCancel,
  onCreated,
  partner = null,
  onUpdated,
}: PartnerFormProps) {
  const t = useT();
  const { session } = useAuth();
  const isEdit = Boolean(partner?.id);
  const [name, setName] = useState(partner?.name ?? "");
  const [phone, setPhone] = useState(partner?.phone ?? "");
  const [city, setCity] = useState(partner?.city ?? "");
  const [country, setCountry] = useState(partner?.country ?? "");
  const [notes, setNotes] = useState(partner?.notes ?? "");
  const [isActive, setIsActive] = useState(partner?.isActive ?? true);
  const [currencies, setCurrencies] = useState<CurrencyListItem[]>([]);
  const [openingLines, setOpeningLines] = useState<OpeningLine[]>(() => {
    if (partner && (partner.openingKata?.length ?? 0) > 0) {
      return partner.openingKata.map((line) =>
        mapApiOpeningToLine(line, t.openingKata.partnerDefaultDescription),
      );
    }
    return [emptyOpeningLine("AFN", t.openingKata.partnerDefaultDescription)];
  });
  const [busy, setBusy] = useState(false);
  const submittingRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!partner) return;
    setName(partner.name);
    setPhone(partner.phone ?? "");
    setCity(partner.city ?? "");
    setCountry(partner.country ?? "");
    setNotes(partner.notes ?? "");
    setIsActive(partner.isActive);
    setOpeningLines(
      (partner.openingKata?.length ?? 0) > 0
        ? partner.openingKata.map((line) =>
            mapApiOpeningToLine(line, t.openingKata.partnerDefaultDescription),
          )
        : [emptyOpeningLine("AFN", t.openingKata.partnerDefaultDescription)],
    );
  }, [partner, t.openingKata.partnerDefaultDescription]);

  useEffect(() => {
    let cancelled = false;
    void listCurrenciesPage({ activeOnly: true, pageSize: 100 })
      .then((pageResult) => {
        if (cancelled) return;
        setCurrencies(pageResult.items);
        const defaultCcy = pickDefaultCurrency(pageResult.items);
        setOpeningLines((prev) => {
          if (prev.some((line) => line.amount.trim()) || isEdit) {
            return prev.map((line) => ({
              ...line,
              currencyCode: line.currencyCode || defaultCcy,
            }));
          }
          return [
            emptyOpeningLine(defaultCcy, t.openingKata.partnerDefaultDescription),
          ];
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isEdit, t.openingKata.partnerDefaultDescription]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!session?.userId) {
      setError(t.hawala.notSignedIn);
      return;
    }
    if (!name.trim()) {
      setError(`${t.common.name} *`);
      return;
    }
    const phoneResult = validatePhone(phone, { required: true });
    if (!phoneResult.ok) {
      setError(
        phoneResult.error === "required"
          ? t.partner.phoneRequired
          : t.common.invalidPhone,
      );
      return;
    }
    if (!tryBeginSubmit(submittingRef)) return;
    setBusy(true);
    setError(null);
    try {
      const openingKata = mapOpeningKata(openingLines);
      const phoneValue = phoneResult.value as string;
      if (isEdit && partner) {
        const updated = await updatePartner({
          id: partner.id,
          name: name.trim(),
          phone: phoneValue,
          city: city.trim() || null,
          country: country.trim() || null,
          notes: notes.trim() || null,
          isActive,
          openingKata: openingKata.length ? openingKata : null,
          actorUserId: session.userId,
        });
        notifyDeskDataChanged();
        onUpdated?.(updated);
      } else {
        const created = await createPartner({
          name: name.trim(),
          phone: phoneValue,
          city: city.trim() || null,
          country: country.trim() || null,
          notes: notes.trim() || null,
          openingKata: openingKata.length ? openingKata : null,
          actorUserId: session.userId,
        });
        notifyPartnerCreated(created.id);
        if (openingKata.length) notifyDeskDataChanged();
        onCreated?.(created);
      }
    } catch (err: unknown) {
      setError(
        errorMessage(err, t.errors.openingKataSave) ||
          (isEdit ? t.partner.updateError : t.partner.addError),
      );
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
      <label>
        {t.common.name} *
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </label>
      <div className="exchange-fields-grid">
        <label>
          {t.common.phone} *
          <PhoneInput
            required
            value={phone}
            onValueChange={setPhone}
            placeholder={t.partner.phoneWhatsAppHint}
          />
        </label>
        <label>
          {t.common.city}
          <input value={city} onChange={(e) => setCity(e.target.value)} />
        </label>
        <label>
          {t.common.country}
          <input value={country} onChange={(e) => setCountry(e.target.value)} />
        </label>
        <label>
          {t.common.notes}
          <input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>
      {isEdit ? (
        <label className="row" style={{ alignItems: "center", gap: "0.4rem" }}>
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          {t.common.active}
        </label>
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
        helper={
          isEdit ? t.openingKata.editPartnerHelper : t.openingKata.newPartnerHelper
        }
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
        <button
          type="submit"
          className="btn btn-action btn-action--save"
          data-desk-action="save"
          disabled={busy}
        >
          {busy ? t.common.saving : t.partner.savePartner}
        </button>
      </div>
    </form>
  );
}

/** Create-only alias used by partners list. */
export function PartnerCreateForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (partner: PartnerDetail) => void;
}) {
  return <PartnerForm onCancel={onCancel} onCreated={onCreated} />;
}
