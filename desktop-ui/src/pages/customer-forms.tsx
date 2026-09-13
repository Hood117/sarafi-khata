import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import {
  createCustomer,
  getPreviousCustomer,
  listCurrenciesPage,
  updateCustomer,
  type CurrencyListItem,
  type CustomerDetail,
} from "@desktop/api";
import { ModalFormActions } from "@desktop/components/modal-form-actions";
import { useAuth } from "@desktop/auth";
import { useT } from "@desktop/i18n";
import {
  endSubmit,
  errorMessage,
  tryBeginSubmit,
} from "@desktop/lib/datetime";
import { pickDefaultCurrency } from "@desktop/lib/default-currency";
import {
  focusFirstIncompleteDeskField,
  handleDeskFormKeyDown,
} from "@desktop/lib/form-keyboard";
import {
  emptyOpeningLine,
  OpeningKataFields,
  type OpeningLine,
} from "@desktop/ui/opening-kata-fields";
import { ModalErrorBanner } from "@desktop/ui/modal-error-banner";

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
  line: NonNullable<CustomerDetail["openingKata"]>[number],
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

type CustomerFormFieldsProps = {
  fullName: string;
  phone: string;
  nationalId: string;
  notes: string;
  customerType: "PERMANENT" | "TEMPORARY";
  disabled?: boolean;
  nameAutoFocus?: boolean;
  nameFocusKey?: number;
  onChange: (
    field: "fullName" | "phone" | "nationalId" | "notes" | "customerType",
    value: string,
  ) => void;
};

function CustomerFormFields({
  fullName,
  phone,
  nationalId,
  notes,
  customerType,
  disabled,
  nameAutoFocus,
  nameFocusKey = 0,
  onChange,
}: CustomerFormFieldsProps) {
  const t = useT();
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!nameAutoFocus || disabled) return;
    const id = window.setTimeout(() => nameRef.current?.focus(), 30);
    return () => window.clearTimeout(id);
  }, [nameAutoFocus, nameFocusKey, disabled]);

  return (
    <div className="customer-form-grid">
      <label>
        {t.common.fullName} *
        <input
          ref={nameRef}
          required
          autoFocus={nameAutoFocus}
          value={fullName}
          disabled={disabled}
          onChange={(e) => onChange("fullName", e.target.value)}
        />
      </label>
      <label>
        {t.common.phone}
        <input
          className="ltr-text phone-ltr"
          dir="ltr"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          disabled={disabled}
          onChange={(e) => onChange("phone", e.target.value)}
        />
      </label>
      <label>
        {t.customers.customerType} *
        <select
          value={customerType}
          disabled={disabled}
          onChange={(e) => onChange("customerType", e.target.value)}
        >
          <option value="PERMANENT">{t.customers.permanent}</option>
          <option value="TEMPORARY">{t.customers.temporary}</option>
        </select>
      </label>
      <label>
        {t.common.nationalId}
        <input
          value={nationalId}
          disabled={disabled}
          onChange={(e) => onChange("nationalId", e.target.value)}
        />
      </label>
      <label className="customer-form-span">
        {t.common.notes}
        <textarea
          rows={2}
          value={notes}
          disabled={disabled}
          onChange={(e) => onChange("notes", e.target.value)}
        />
      </label>
      {customerType === "TEMPORARY" ? (
        <p className="muted customer-form-span" style={{ margin: 0 }}>
          {t.customers.temporaryHint}
        </p>
      ) : null}
    </div>
  );
}

function useCurrenciesAndOpening(
  defaultDescription: string,
  initialLines?: OpeningLine[] | null,
) {
  const [currencies, setCurrencies] = useState<CurrencyListItem[]>([]);
  const [openingLines, setOpeningLines] = useState<OpeningLine[]>(() =>
    initialLines?.length
      ? initialLines
      : [emptyOpeningLine("AFN", defaultDescription)],
  );

  useEffect(() => {
    void listCurrenciesPage({ activeOnly: true, pageSize: 100 })
      .then((page) => {
        setCurrencies(page.items);
        setOpeningLines((prev) => {
          if (prev.some((line) => line.amount.trim() || line.transactionId)) {
            return prev;
          }
          if (initialLines?.length) {
            return initialLines;
          }
          return [emptyOpeningLine(pickDefaultCurrency(page.items), defaultDescription)];
        });
      })
      .catch(() => undefined);
  }, [defaultDescription, initialLines]);

  function updateLine(index: number, patch: Partial<OpeningLine>) {
    setOpeningLines((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  const defaultCcy = pickDefaultCurrency(currencies);

  return {
    currencies,
    setCurrencies,
    openingLines,
    setOpeningLines,
    updateLine,
    defaultCcy,
  };
}

export function CustomerCreateForm({
  onCancel,
  onCreated,
  onSaved,
  onEditingChange,
}: {
  onCancel: () => void;
  onCreated: (customer: CustomerDetail) => void;
  /** Called after an update of an existing customer (Previous → edit). */
  onSaved?: (customer: CustomerDetail) => void;
  /** Lets the parent update the modal title (new vs edit). */
  onEditingChange?: (editing: boolean, name?: string) => void;
}) {
  const { session } = useAuth();
  const t = useT();
  const [editing, setEditing] = useState<CustomerDetail | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [notes, setNotes] = useState("");
  const [customerType, setCustomerType] = useState<"PERMANENT" | "TEMPORARY">(
    "PERMANENT",
  );
  const [busy, setBusy] = useState(false);
  const submittingRef = useRef(false);
  const formRootRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [nameFocusKey, setNameFocusKey] = useState(0);
  const {
    currencies,
    setCurrencies,
    openingLines,
    setOpeningLines,
    updateLine,
    defaultCcy,
  } = useCurrenciesAndOpening(t.openingKata.defaultDescription);

  function resetBlank() {
    setEditing(null);
    setFullName("");
    setPhone("");
    setNationalId("");
    setNotes("");
    setCustomerType("PERMANENT");
    setOpeningLines([emptyOpeningLine(defaultCcy, t.openingKata.defaultDescription)]);
    setError(null);
    setNameFocusKey((k) => k + 1);
    onEditingChange?.(false);
  }

  function applyCustomer(customer: CustomerDetail) {
    setEditing(customer);
    setFullName(customer.fullName);
    setPhone(customer.phone ?? "");
    setNationalId(customer.nationalId ?? "");
    setNotes(customer.notes ?? "");
    setCustomerType(
      customer.customerType?.toUpperCase() === "TEMPORARY"
        ? "TEMPORARY"
        : "PERMANENT",
    );
    if (customer.openingKata.length > 0) {
      setOpeningLines(
        customer.openingKata.map((line) =>
          mapApiOpeningToLine(line, t.openingKata.defaultDescription),
        ),
      );
    } else {
      setOpeningLines([
        emptyOpeningLine(defaultCcy, t.openingKata.defaultDescription),
      ]);
    }
    setError(null);
    onEditingChange?.(true, customer.fullName);
  }

  function onChange(
    field: "fullName" | "phone" | "nationalId" | "notes" | "customerType",
    value: string,
  ) {
    if (field === "customerType") {
      setCustomerType(value === "TEMPORARY" ? "TEMPORARY" : "PERMANENT");
      return;
    }
    ({
      fullName: setFullName,
      phone: setPhone,
      nationalId: setNationalId,
      notes: setNotes,
    })[field](value);
  }

  async function persist(): Promise<CustomerDetail | null> {
    if (!session) return null;
    if (!fullName.trim()) {
      setError(`${t.common.fullName} *`);
      queueMicrotask(() => {
        if (formRootRef.current) focusFirstIncompleteDeskField(formRootRef.current);
      });
      return null;
    }
    if (!tryBeginSubmit(submittingRef)) return null;
    setBusy(true);
    setError(null);
    try {
      const openingKata = mapOpeningKata(openingLines);
      const phoneValue = phone.trim();
      if (editing) {
        const updated = await updateCustomer({
          id: editing.id,
          fullName: fullName.trim(),
          fatherName: editing.fatherName ?? null,
          phone: phoneValue,
          address: null,
          nationalId: nationalId.trim() || null,
          notes: notes.trim() || null,
          customerType,
          actorUserId: session.userId,
          openingKata,
        });
        setEditing(updated);
        onSaved?.(updated);
        onCreated(updated);
        return updated;
      }
      const created = await createCustomer({
        fullName: fullName.trim(),
        fatherName: null,
        phone: phoneValue,
        address: null,
        nationalId: nationalId.trim() || null,
        notes: notes.trim() || null,
        customerType,
        openingKata: openingKata.length ? openingKata : null,
        actorUserId: session.userId,
      });
      onCreated(created);
      return created;
    } catch (err: unknown) {
      setError(errorMessage(err, t.errors.openingKataSave));
      return null;
    } finally {
      endSubmit(submittingRef);
      setBusy(false);
    }
  }

  async function handleSave() {
    const saved = await persist();
    if (saved) {
      onSaved?.(saved);
      onCancel();
    }
  }

  async function handleSaveAndNew() {
    const saved = await persist();
    if (saved) resetBlank();
  }

  async function handlePrevious() {
    setBusy(true);
    setError(null);
    try {
      const prev = await getPreviousCustomer(editing?.id ?? null);
      if (!prev) {
        setError(t.desk.noPreviousRecord);
        return;
      }
      applyCustomer(prev);
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      ref={formRootRef}
      className="stack"
      data-desk-form
      onKeyDown={(e) =>
        handleDeskFormKeyDown(e, {
          busy,
          onSubmit: () => void handleSave(),
        })
      }
    >
      {editing ? (
        <p className="muted" style={{ margin: 0 }}>
          {t.customers.edit}: {editing.fullName}
          {editing.code ? ` · ${editing.code}` : ""}
        </p>
      ) : null}
      <CustomerFormFields
        fullName={fullName}
        phone={phone}
        nationalId={nationalId}
        notes={notes}
        customerType={customerType}
        nameAutoFocus={!editing}
        nameFocusKey={nameFocusKey}
        onChange={onChange}
      />
      <OpeningKataFields
        currencies={currencies}
        lines={openingLines}
        onChange={updateLine}
        onCurrenciesChange={setCurrencies}
        onAdd={() =>
          setOpeningLines((rows) => [
            ...rows,
            emptyOpeningLine(defaultCcy, t.openingKata.defaultDescription),
          ])
        }
        onRemove={(index) => setOpeningLines((rows) => rows.filter((_, i) => i !== index))}
        helper={
          editing ? t.openingKata.editCustomerHelper : t.openingKata.newCustomerHelper
        }
      />
      <ModalFormActions
        busy={busy}
        error={error}
        previousLabel={t.common.previous}
        saveLabel={busy ? t.common.saving : t.common.save}
        saveAndNewLabel={t.hawala.saveAndNew}
        cancelLabel={t.common.cancel}
        onPrevious={() => void handlePrevious()}
        onSave={() => void handleSave()}
        onSaveAndNew={() => void handleSaveAndNew()}
        onCancel={onCancel}
      />
    </div>
  );
}

export function CustomerEditForm({
  customer,
  onCancel,
  onSaved,
}: {
  customer: CustomerDetail;
  onCancel: () => void;
  onSaved: (customer: CustomerDetail) => void;
}) {
  const { session } = useAuth();
  const t = useT();
  const initialOpeningLines = useMemo(
    () =>
      customer.openingKata.length > 0
        ? customer.openingKata.map((line) =>
            mapApiOpeningToLine(line, t.openingKata.defaultDescription),
          )
        : null,
    [customer.openingKata, t.openingKata.defaultDescription],
  );
  const [fullName, setFullName] = useState(customer.fullName);
  const [phone, setPhone] = useState(customer.phone ?? "");
  const [nationalId, setNationalId] = useState(customer.nationalId ?? "");
  const [notes, setNotes] = useState(customer.notes ?? "");
  const [customerType, setCustomerType] = useState<"PERMANENT" | "TEMPORARY">(
    customer.customerType?.toUpperCase() === "TEMPORARY" ? "TEMPORARY" : "PERMANENT",
  );
  const [busy, setBusy] = useState(false);
  const submittingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const {
    currencies,
    setCurrencies,
    openingLines,
    setOpeningLines,
    updateLine,
    defaultCcy,
  } = useCurrenciesAndOpening(t.openingKata.defaultDescription, initialOpeningLines);

  useEffect(() => {
    setFullName(customer.fullName);
    setPhone(customer.phone ?? "");
    setNationalId(customer.nationalId ?? "");
    setNotes(customer.notes ?? "");
    setCustomerType(
      customer.customerType?.toUpperCase() === "TEMPORARY"
        ? "TEMPORARY"
        : "PERMANENT",
    );
    if (customer.openingKata.length > 0) {
      setOpeningLines(
        customer.openingKata.map((line) =>
          mapApiOpeningToLine(line, t.openingKata.defaultDescription),
        ),
      );
    } else {
      setOpeningLines([
        emptyOpeningLine(defaultCcy, t.openingKata.defaultDescription),
      ]);
    }
  }, [customer, defaultCcy, setOpeningLines, t.openingKata.defaultDescription]);

  function onChange(
    field: "fullName" | "phone" | "nationalId" | "notes" | "customerType",
    value: string,
  ) {
    if (field === "customerType") {
      setCustomerType(value === "TEMPORARY" ? "TEMPORARY" : "PERMANENT");
      return;
    }
    ({
      fullName: setFullName,
      phone: setPhone,
      nationalId: setNationalId,
      notes: setNotes,
    })[field](value);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!session || customer.isArchived) return;
    if (!fullName.trim()) {
      setError(`${t.common.fullName} *`);
      return;
    }
    if (!tryBeginSubmit(submittingRef)) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await updateCustomer({
        id: customer.id,
        fullName: fullName.trim(),
        // Keep existing father name if any — field removed from the form UI.
        fatherName: customer.fatherName ?? null,
        phone: phone.trim(),
        address: null,
        nationalId: nationalId.trim() || null,
        notes: notes.trim() || null,
        customerType,
        actorUserId: session.userId,
        openingKata: mapOpeningKata(openingLines),
      });
      onSaved(updated);
    } catch (err: unknown) {
      setError(errorMessage(err, t.errors.openingKataSave));
    } finally {
      endSubmit(submittingRef);
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={(e) => void handleSubmit(e)}>
      {customer.isArchived ? (
        <p className="muted" style={{ margin: 0 }}>
          {t.customers.archivedEditHint}
        </p>
      ) : null}
      <CustomerFormFields
        fullName={fullName}
        phone={phone}
        nationalId={nationalId}
        notes={notes}
        customerType={customerType}
        disabled={customer.isArchived}
        onChange={onChange}
      />
      {!customer.isArchived ? (
        <OpeningKataFields
          currencies={currencies}
          lines={openingLines}
          onChange={updateLine}
          onCurrenciesChange={setCurrencies}
          onAdd={() =>
            setOpeningLines((rows) => [
              ...rows,
              emptyOpeningLine(defaultCcy, t.openingKata.defaultDescription),
            ])
          }
          onRemove={(index) => setOpeningLines((rows) => rows.filter((_, i) => i !== index))}
          helper={t.openingKata.editCustomerHelper}
        />
      ) : null}
      <ModalErrorBanner message={error} />
      <div className="modal-actions">
        <button type="button" className="secondary" onClick={onCancel} disabled={busy}>
          {t.common.cancel}
        </button>
        {!customer.isArchived ? (
          <button
            type="submit"
            className="btn primary"
            data-desk-action="save"
            disabled={busy}
          >
            {busy ? t.common.saving : t.common.saveChanges}
          </button>
        ) : null}
      </div>
    </form>
  );
}
