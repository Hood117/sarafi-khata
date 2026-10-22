import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";

import { listen } from "@tauri-apps/api/event";

import {
  createCustomer,
  enrollFingerprint,
  getPreviousCustomer,
  listCurrenciesPage,
  updateCustomer,
  type CurrencyListItem,
  type CustomerDetail,
  type FingerprintEnrollProgress,
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
  pauseFingerprintIdentify,
  resumeFingerprintIdentify,
} from "@desktop/lib/fingerprint-identify-gate";
import {
  isUnmatchedFingerprint,
  notifyWrongFingerprint,
  playFingerprintSound,
} from "@desktop/lib/fingerprint-sounds";
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
  showNotes?: boolean;
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
  showNotes = true,
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
      {showNotes ? (
        <label className="customer-form-span">
          {t.common.notes}
          <textarea
            rows={2}
            value={notes}
            disabled={disabled}
            onChange={(e) => onChange("notes", e.target.value)}
          />
        </label>
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
  /** After a successful create, optional fingerprint enroll before closing/resetting. */
  const [awaitingEnroll, setAwaitingEnroll] = useState<CustomerDetail | null>(null);
  const [saveAndNewAfterEnroll, setSaveAndNewAfterEnroll] = useState(false);
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
    setAwaitingEnroll(null);
    setSaveAndNewAfterEnroll(false);
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
    if (awaitingEnroll) return;
    const wasCreating = !editing;
    const saved = await persist();
    if (!saved) return;
    if (wasCreating) {
      setEditing(saved);
      setAwaitingEnroll(saved);
      setSaveAndNewAfterEnroll(false);
      onEditingChange?.(true, saved.fullName);
      return;
    }
    onSaved?.(saved);
    onCancel();
  }

  async function handleSaveAndNew() {
    if (awaitingEnroll) return;
    const wasCreating = !editing;
    const saved = await persist();
    if (!saved) return;
    if (wasCreating) {
      setEditing(saved);
      setAwaitingEnroll(saved);
      setSaveAndNewAfterEnroll(true);
      onEditingChange?.(true, saved.fullName);
      return;
    }
    resetBlank();
  }

  function finishAfterEnroll() {
    if (saveAndNewAfterEnroll) {
      resetBlank();
      return;
    }
    if (awaitingEnroll) onSaved?.(awaitingEnroll);
    onCancel();
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

  const formLocked = Boolean(awaitingEnroll) || busy;

  return (
    <div
      ref={formRootRef}
      className="stack customer-desk-form"
      data-desk-form
      onKeyDown={(e) =>
        handleDeskFormKeyDown(e, {
          busy: formLocked,
          onSubmit: () => {
            if (awaitingEnroll) finishAfterEnroll();
            else void handleSave();
          },
        })
      }
    >
      <div className="customer-desk-scroll">
        {editing ? (
          <p className="muted" style={{ margin: 0 }}>
            {awaitingEnroll ? t.customers.saveCustomer : t.customers.edit}:{" "}
            {editing.fullName}
            {editing.code ? ` · ${editing.code}` : ""}
          </p>
        ) : null}
        <CustomerFormFields
          fullName={fullName}
          phone={phone}
          nationalId={nationalId}
          notes={notes}
          customerType={customerType}
          disabled={formLocked}
          nameAutoFocus={!editing && !awaitingEnroll}
          nameFocusKey={nameFocusKey}
          showNotes={false}
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
          showLineNotes={false}
        />
        <CustomerFingerprintEnrollBlock
          customerId={awaitingEnroll?.id ?? ""}
          hint={awaitingEnroll ? t.customers.enrollAfterCreateHint : ""}
          ensureCustomerId={async () => {
            if (awaitingEnroll?.id) return awaitingEnroll.id;
            const wasCreating = !editing;
            const saved = await persist();
            if (!saved) return null;
            if (wasCreating) {
              setEditing(saved);
              setAwaitingEnroll(saved);
              setSaveAndNewAfterEnroll(false);
              onEditingChange?.(true, saved.fullName);
            }
            return saved.id;
          }}
          onBusyChange={setBusy}
        />
      </div>
      {awaitingEnroll ? (
        <div className="customer-desk-footer">
          <div className="modal-actions">
            <button
              type="button"
              className="btn primary"
              data-desk-action="save"
              disabled={busy}
              onClick={() => finishAfterEnroll()}
            >
              {t.customers.enrollDone}
            </button>
          </div>
        </div>
      ) : (
        <ModalFormActions
          inline
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
      )}
    </div>
  );
}

type EnrollUiPhase =
  | "ready"
  | "scan1"
  | "captured1"
  | "remove1"
  | "scan2"
  | "captured2"
  | "remove2"
  | "scan3"
  | "captured3"
  | "success"
  | "failure";

function enrollPhaseFromProgress(ev: FingerprintEnrollProgress): EnrollUiPhase | null {
  const scan = Number(ev.scan);
  if (ev.phase === "scan") {
    if (scan === 1) return "scan1";
    if (scan === 2) return "scan2";
    if (scan === 3) return "scan3";
  }
  if (ev.phase === "captured") {
    if (scan === 1) return "captured1";
    if (scan === 2) return "captured2";
    if (scan === 3) return "captured3";
  }
  if (ev.phase === "remove") {
    if (scan === 1) return "remove1";
    if (scan === 2) return "remove2";
  }
  return null;
}

function enrollDoneCount(phase: EnrollUiPhase): number {
  switch (phase) {
    case "captured1":
    case "remove1":
    case "scan2":
      return 1;
    case "captured2":
    case "remove2":
    case "scan3":
      return 2;
    case "captured3":
    case "success":
      return 3;
    default:
      return 0;
  }
}

function enrollScanState(
  phase: EnrollUiPhase,
  scan: 1 | 2 | 3,
): "idle" | "active" | "lift" | "done" {
  if (phase === "failure" || phase === "ready") return "idle";

  const doneCount = enrollDoneCount(phase);
  if (scan <= doneCount) return "done";
  if (phase === "scan1" && scan === 1) return "active";
  if (phase === "scan2" && scan === 2) return "active";
  if (phase === "scan3" && scan === 3) return "active";
  // After a successful press: ask to lift, next circle waits.
  if (phase === "remove1" && scan === 2) return "lift";
  if (phase === "remove2" && scan === 3) return "lift";
  return "idle";
}

/** Shared enroll UI for create and edit flows. */
function CustomerFingerprintEnrollBlock({
  customerId,
  disabled,
  hint,
  ensureCustomerId,
  onBusyChange,
}: {
  customerId: string;
  disabled?: boolean;
  hint?: string;
  /** Create flow: save the customer first, then return its id for enroll. */
  ensureCustomerId?: () => Promise<string | null>;
  onBusyChange?: (busy: boolean) => void;
}) {
  const t = useT();
  const [enrollPhase, setEnrollPhase] = useState<EnrollUiPhase>("ready");
  const [enrollBusy, setEnrollBusy] = useState(false);
  const [enrollMessage, setEnrollMessage] = useState<string | null>(null);
  const canEnroll = !disabled && (Boolean(customerId.trim()) || Boolean(ensureCustomerId));

  async function handleEnrollFingerprint() {
    if (!canEnroll || enrollBusy) return;
    setEnrollBusy(true);
    onBusyChange?.(true);
    pauseFingerprintIdentify();
    setEnrollMessage(null);
    setEnrollPhase("ready");

    let unlisten: (() => void) | undefined;
    try {
      // Listen before any device work so each capture paints before the next press.
      unlisten = await listen<FingerprintEnrollProgress>(
        "fingerprint-enroll-progress",
        (event) => {
          const next = enrollPhaseFromProgress(event.payload);
          if (!next) return;
          if (
            next === "captured1" ||
            next === "captured2" ||
            next === "captured3"
          ) {
            playFingerprintSound("register");
          }
          // Force paint so step 1/2/3 flip to ✓ as each finger is accepted.
          flushSync(() => setEnrollPhase(next));
        },
      );

      let id = customerId.trim();
      if (!id && ensureCustomerId) {
        const ensured = await ensureCustomerId();
        if (!ensured) {
          setEnrollPhase("ready");
          return;
        }
        id = ensured;
      }
      if (!id) {
        setEnrollPhase("failure");
        setEnrollMessage(t.customers.enrollFailure);
        return;
      }

      flushSync(() => setEnrollPhase("scan1"));
      const result = await enrollFingerprint(id);
      if (result.ok) {
        // Register tone already played on each accepted press.
        flushSync(() => {
          setEnrollPhase("success");
          setEnrollMessage(result.message || t.customers.enrollSuccess);
        });
      } else {
        const message = result.message || t.customers.enrollFailure;
        if (isUnmatchedFingerprint(message)) notifyWrongFingerprint();
        setEnrollPhase("failure");
        setEnrollMessage(message);
      }
    } catch (err: unknown) {
      const message = errorMessage(err, t.customers.enrollFailure);
      if (isUnmatchedFingerprint(message)) notifyWrongFingerprint();
      setEnrollPhase("failure");
      setEnrollMessage(message);
    } finally {
      unlisten?.();
      resumeFingerprintIdentify();
      setEnrollBusy(false);
      onBusyChange?.(false);
    }
  }

  const statusLine =
    enrollPhase === "success" || enrollPhase === "captured3"
      ? enrollMessage ?? t.customers.enrollSuccess
      : enrollPhase === "failure"
        ? enrollMessage ?? t.customers.enrollFailure
        : enrollPhase === "scan1" ||
            enrollPhase === "scan2" ||
            enrollPhase === "scan3"
          ? t.customers.enrollScanShort
          : enrollPhase === "captured1" ||
              enrollPhase === "captured2" ||
              enrollPhase === "remove1" ||
              enrollPhase === "remove2"
            ? t.customers.enrollLiftShort
            : hint ?? t.customers.enrollFingerprintHint;

  return (
    <section
      className={[
        "fp-enroll-panel",
        enrollPhase === "success" ? "fp-enroll-panel--ok" : "",
        enrollPhase === "failure" ? "fp-enroll-panel--fail" : "",
        enrollBusy ? "fp-enroll-panel--busy" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={t.customers.enrollTitle}
    >
      <div className="fp-enroll-head">
        <div>
          <h3 className="fp-enroll-title">{t.customers.enrollTitle}</h3>
          {statusLine ? <p className="fp-enroll-hint muted">{statusLine}</p> : null}
        </div>
        <button
          type="button"
          className="btn primary fp-enroll-cta"
          disabled={!canEnroll || enrollBusy}
          onClick={() => void handleEnrollFingerprint()}
        >
          {enrollBusy ? t.customers.enrollBusy : t.customers.enrollFingerprint}
        </button>
      </div>

      <div className="fp-enroll-steps" aria-live="polite">
        {([1, 2, 3] as const).map((scan) => {
          const state = enrollScanState(enrollPhase, scan);
          return (
            <div
              key={scan}
              className={`fp-enroll-step fp-enroll-step--${state}`}
              data-scan={scan}
            >
              <div className="fp-enroll-finger">
                <span className="fp-enroll-finger-ring" />
                <span className="fp-enroll-finger-core">
                  {state === "done" ? "✓" : scan}
                </span>
              </div>
              <span className="fp-enroll-step-label">
                {state === "lift"
                  ? t.customers.enrollLiftShort
                  : state === "active"
                    ? t.customers.enrollScanShort
                    : state === "done"
                      ? t.customers.enrollDone
                      : `${t.customers.enrollReady} ${scan}`}
              </span>
            </div>
          );
        })}
      </div>

      {enrollPhase === "failure" ? (
        <ModalErrorBanner message={enrollMessage ?? t.customers.enrollFailure} />
      ) : null}
    </section>
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
  const [enrollBusy, setEnrollBusy] = useState(false);
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
    <form className="stack customer-desk-form" onSubmit={(e) => void handleSubmit(e)}>
      <div className="customer-desk-scroll">
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
          disabled={customer.isArchived || enrollBusy || busy}
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
          />
        ) : null}
        {!customer.isArchived ? (
          <CustomerFingerprintEnrollBlock
            customerId={customer.id}
            disabled={busy}
            hint={t.customers.enrollFingerprintHint}
            onBusyChange={setEnrollBusy}
          />
        ) : null}
      </div>
      <div className="customer-desk-footer">
        <ModalErrorBanner message={error} />
        <div className="modal-actions">
          <button
            type="button"
            className="secondary"
            onClick={onCancel}
            disabled={busy || enrollBusy}
          >
            {t.common.cancel}
          </button>
          {!customer.isArchived ? (
            <button
              type="submit"
              className="btn primary"
              data-desk-action="save"
              disabled={busy || enrollBusy}
            >
              {busy ? t.common.saving : t.common.saveChanges}
            </button>
          ) : null}
        </div>
      </div>
    </form>
  );
}
