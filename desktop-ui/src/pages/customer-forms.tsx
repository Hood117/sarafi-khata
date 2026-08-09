import { useEffect, useState, type FormEvent } from "react";

import {
  createCustomer,
  listCurrenciesPage,
  updateCustomer,
  type CurrencyListItem,
  type CustomerDetail,
} from "@desktop/api";
import { useAuth } from "@desktop/auth";
import { useT } from "@desktop/i18n";
import { errorMessage } from "@desktop/lib/datetime";
import {
  emptyOpeningLine,
  OpeningKataFields,
  type OpeningLine,
} from "@desktop/ui/opening-kata-fields";

function mapOpeningKata(lines: OpeningLine[]) {
  return lines
    .filter((l) => l.amount.trim())
    .map((l) => ({
      currencyCode: l.currencyCode,
      amount: l.amount.trim(),
      direction: l.direction,
      description: l.description.trim() || null,
      notes: l.notes.trim() || null,
      valueDate: l.valueDate.trim() || null,
    }));
}

type CustomerFormFieldsProps = {
  fullName: string;
  fatherName: string;
  phone: string;
  nationalId: string;
  address: string;
  notes: string;
  disabled?: boolean;
  onChange: (field: "fullName" | "fatherName" | "phone" | "nationalId" | "address" | "notes", value: string) => void;
};

function CustomerFormFields({
  fullName,
  fatherName,
  phone,
  nationalId,
  address,
  notes,
  disabled,
  onChange,
}: CustomerFormFieldsProps) {
  const t = useT();
  return (
    <div className="customer-form-grid">
      <label>
        {t.common.fullName} *
        <input
          required
          value={fullName}
          disabled={disabled}
          onChange={(e) => onChange("fullName", e.target.value)}
        />
      </label>
      <label>
        {t.customers.fatherName}
        <input
          value={fatherName}
          disabled={disabled}
          onChange={(e) => onChange("fatherName", e.target.value)}
        />
      </label>
      <label>
        {t.common.phone} *
        <input
          required
          value={phone}
          disabled={disabled}
          onChange={(e) => onChange("phone", e.target.value)}
        />
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
        {t.common.address}
        <input
          value={address}
          disabled={disabled}
          onChange={(e) => onChange("address", e.target.value)}
        />
      </label>
      <label className="customer-form-span">
        {t.common.notes}
        <input
          value={notes}
          disabled={disabled}
          onChange={(e) => onChange("notes", e.target.value)}
        />
      </label>
    </div>
  );
}

function useCurrenciesAndOpening() {
  const [currencies, setCurrencies] = useState<CurrencyListItem[]>([]);
  const [openingLines, setOpeningLines] = useState<OpeningLine[]>([emptyOpeningLine("USD")]);

  useEffect(() => {
    void listCurrenciesPage({ activeOnly: true, pageSize: 100 })
      .then((page) => {
        setCurrencies(page.items);
        setOpeningLines([emptyOpeningLine(page.items[0]?.code ?? "USD")]);
      })
      .catch(() => undefined);
  }, []);

  function updateLine(index: number, patch: Partial<OpeningLine>) {
    setOpeningLines((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  const defaultCcy = currencies[0]?.code ?? "USD";

  return {
    currencies,
    openingLines,
    setOpeningLines,
    updateLine,
    defaultCcy,
  };
}

export function CustomerCreateForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (customer: CustomerDetail) => void;
}) {
  const { session } = useAuth();
  const t = useT();
  const [fullName, setFullName] = useState("");
  const [fatherName, setFatherName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { currencies, openingLines, setOpeningLines, updateLine, defaultCcy } =
    useCurrenciesAndOpening();

  function onChange(
    field: "fullName" | "fatherName" | "phone" | "nationalId" | "address" | "notes",
    value: string,
  ) {
    ({
      fullName: setFullName,
      fatherName: setFatherName,
      phone: setPhone,
      nationalId: setNationalId,
      address: setAddress,
      notes: setNotes,
    })[field](value);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const openingKata = mapOpeningKata(openingLines);
      const created = await createCustomer({
        fullName,
        fatherName: fatherName || null,
        phone,
        address: address || null,
        nationalId: nationalId || null,
        notes: notes || null,
        openingKata: openingKata.length ? openingKata : null,
        actorUserId: session.userId,
      });
      onCreated(created);
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={(e) => void handleSubmit(e)}>
      <CustomerFormFields
        fullName={fullName}
        fatherName={fatherName}
        phone={phone}
        nationalId={nationalId}
        address={address}
        notes={notes}
        onChange={onChange}
      />
      <OpeningKataFields
        currencies={currencies}
        lines={openingLines}
        onChange={updateLine}
        onAdd={() => setOpeningLines((rows) => [...rows, emptyOpeningLine(defaultCcy)])}
        onRemove={(index) => setOpeningLines((rows) => rows.filter((_, i) => i !== index))}
        helper="Record the money the customer gives you when opening their account."
      />
      {error ? <p className="error">{error}</p> : null}
      <div className="modal-actions">
        <button type="button" className="secondary" onClick={onCancel} disabled={busy}>
          {t.common.cancel}
        </button>
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? t.common.saving : t.customers.add}
        </button>
      </div>
    </form>
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
  const [fullName, setFullName] = useState(customer.fullName);
  const [fatherName, setFatherName] = useState(customer.fatherName ?? "");
  const [phone, setPhone] = useState(customer.phone ?? "");
  const [address, setAddress] = useState(customer.address ?? "");
  const [nationalId, setNationalId] = useState(customer.nationalId ?? "");
  const [notes, setNotes] = useState(customer.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { currencies, openingLines, setOpeningLines, updateLine, defaultCcy } =
    useCurrenciesAndOpening();

  useEffect(() => {
    setFullName(customer.fullName);
    setFatherName(customer.fatherName ?? "");
    setPhone(customer.phone ?? "");
    setAddress(customer.address ?? "");
    setNationalId(customer.nationalId ?? "");
    setNotes(customer.notes ?? "");
  }, [customer]);

  function onChange(
    field: "fullName" | "fatherName" | "phone" | "nationalId" | "address" | "notes",
    value: string,
  ) {
    ({
      fullName: setFullName,
      fatherName: setFatherName,
      phone: setPhone,
      nationalId: setNationalId,
      address: setAddress,
      notes: setNotes,
    })[field](value);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!session || customer.isArchived) return;
    setBusy(true);
    setError(null);
    try {
      const openingKata = mapOpeningKata(openingLines);
      const updated = await updateCustomer({
        id: customer.id,
        fullName,
        fatherName: fatherName || null,
        phone,
        address: address || null,
        nationalId: nationalId || null,
        notes: notes || null,
        actorUserId: session.userId,
        openingKata: openingKata.length ? openingKata : null,
      });
      onSaved(updated);
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={(e) => void handleSubmit(e)}>
      {customer.isArchived ? (
        <p className="muted" style={{ margin: 0 }}>
          This customer is archived. Restore before editing.
        </p>
      ) : null}
      <CustomerFormFields
        fullName={fullName}
        fatherName={fatherName}
        phone={phone}
        nationalId={nationalId}
        address={address}
        notes={notes}
        disabled={customer.isArchived}
        onChange={onChange}
      />
      {!customer.isArchived ? (
        <OpeningKataFields
          currencies={currencies}
          lines={openingLines}
          onChange={updateLine}
          onAdd={() => setOpeningLines((rows) => [...rows, emptyOpeningLine(defaultCcy)])}
          onRemove={(index) => setOpeningLines((rows) => rows.filter((_, i) => i !== index))}
          helper="Add opening balance lines to post new ledger balances (leave amount empty to skip). Existing balances stay from history."
        />
      ) : null}
      {error ? <p className="error">{error}</p> : null}
      <div className="modal-actions">
        <button type="button" className="secondary" onClick={onCancel} disabled={busy}>
          {t.common.cancel}
        </button>
        {!customer.isArchived ? (
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? t.common.saving : t.common.saveChanges}
          </button>
        ) : null}
      </div>
    </form>
  );
}
