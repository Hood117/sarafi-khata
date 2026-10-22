import { type FormEvent, useEffect, useRef, useState } from "react";

import {
  getCustomer,
  getPartner,
  getTransactionDetail,
  listCurrenciesPage,
  listPartnersPage,
  softDeleteMovement,
  updateCustomer,
  updatePartner,
  type CurrencyListItem,
  type CustomerDetail,
  type OpeningKataLineDetail,
  type PartnerDetail,
  type TransactionDetail,
} from "@desktop/api";
import { useAuth } from "@desktop/auth";
import { useT } from "@desktop/i18n";
import {
  endSubmit,
  errorMessage,
  tryBeginSubmit,
} from "@desktop/lib/datetime";
import { handleDeskFormKeyDown } from "@desktop/lib/form-keyboard";
import { pickDefaultCurrency } from "@desktop/lib/default-currency";
import { normalizeAmountInput } from "@desktop/lib/western-digits";
import {
  OpeningKataFields,
  type OpeningLine,
} from "@desktop/ui/opening-kata-fields";
import { Modal } from "@desktop/ui/modal";
import { ModalErrorBanner } from "@desktop/ui/modal-error-banner";

export function isOpeningBalanceMovement(
  type: string,
  reference?: string | null,
): boolean {
  const t = type.trim().toUpperCase();
  if (t === "OPENING") return true;
  return (reference ?? "").trim().toUpperCase().startsWith("OB-");
}

function mapApiOpeningToLine(
  line: OpeningKataLineDetail,
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

function mapOpeningKata(lines: OpeningLine[]) {
  return lines
    .filter((l) => normalizeAmountInput(l.amount).trim())
    .map((l) => ({
      transactionId: l.transactionId ?? null,
      currencyCode: l.currencyCode,
      amount: normalizeAmountInput(l.amount).trim(),
      direction: l.direction,
      description: l.description.trim() || null,
      notes: l.notes.trim() || null,
      valueDate: l.valueDate.trim() || null,
    }));
}

function lineFromTransaction(
  detail: TransactionDetail,
  defaultDescription: string,
): OpeningLine {
  const party =
    detail.lines.find((l) => {
      const t = l.walletType.toUpperCase();
      return t === "CUSTOMER" || t === "PARTNER";
    }) ??
    detail.lines.find((l) => l.walletType.toUpperCase() !== "SYSTEM") ??
    detail.lines[0];
  const take = (party?.direction ?? "").toUpperCase() === "CREDIT";
  const valueDate = detail.valueDate.length >= 10 ? detail.valueDate.slice(0, 10) : detail.valueDate;
  return {
    transactionId: detail.id,
    currencyCode: party?.currencyCode || "AFN",
    amount: (party?.amount ?? "").replace(/,/g, ""),
    direction: take ? "TAKE" : "GIVE",
    description: (detail.description ?? "").trim() || defaultDescription,
    notes: "",
    valueDate,
  };
}

async function findPartnerForOpening(
  txId: string,
  detail: TransactionDetail,
): Promise<PartnerDetail | null> {
  const partnerWallet = detail.lines.find((l) => l.walletType.toUpperCase() === "PARTNER");
  const guess = (
    detail.walkInName ||
    (partnerWallet?.walletName ?? "").replace(/\s+Wallet$/i, "")
  ).trim();
  const page = await listPartnersPage({
    search: guess || undefined,
    archiveFilter: "all",
    pageSize: 100,
  });
  for (const row of page.items) {
    const full = await getPartner(row.id);
    if (full.openingKata.some((l) => l.transactionId === txId)) return full;
  }
  const named = guess
    ? page.items.find((p) => p.name.trim().toLowerCase() === guess.toLowerCase())
    : undefined;
  if (named) return getPartner(named.id);
  return null;
}

type Owner =
  | { kind: "customer"; customer: CustomerDetail }
  | { kind: "partner"; partner: PartnerDetail };

type Props = {
  open: boolean;
  editTransactionId?: string | null;
  onClose: () => void;
  onSaved?: () => void;
};

/** Edit one Opening Kata / opening-balance journal line. */
export function OpeningBalanceFormModal({
  open,
  editTransactionId = null,
  onClose,
  onSaved,
}: Props) {
  const t = useT();
  const { session } = useAuth();
  const [currencies, setCurrencies] = useState<CurrencyListItem[]>([]);
  const [line, setLine] = useState<OpeningLine | null>(null);
  const [owner, setOwner] = useState<Owner | null>(null);
  const [inKata, setInKata] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const submittingRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  const formBusy = saving || loading;

  useEffect(() => {
    if (!open) {
      setLine(null);
      setOwner(null);
      setError(null);
      setLoading(false);
      setInKata(true);
      return;
    }
    const txId = (editTransactionId ?? "").trim();
    if (!txId) {
      setError(t.errors.loadGeneric);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const [page, detail] = await Promise.all([
          listCurrenciesPage({ activeOnly: true, pageSize: 200 }),
          getTransactionDetail(txId),
        ]);
        if (cancelled) return;
        const active = page.items.filter((x) => x.isActive);
        setCurrencies(active);
        const defaultCcy = pickDefaultCurrency(active);
        const defaultDesc = t.openingKata.defaultDescription;

        let resolved: Owner | null = null;
        if (detail.customerId) {
          resolved = { kind: "customer", customer: await getCustomer(detail.customerId) };
        } else {
          const partner = await findPartnerForOpening(txId, detail);
          if (partner) resolved = { kind: "partner", partner };
        }
        if (cancelled) return;
        if (!resolved) {
          setError(t.errors.openingKataSave);
          return;
        }
        setOwner(resolved);

        const kata =
          resolved.kind === "customer"
            ? resolved.customer.openingKata
            : resolved.partner.openingKata;
        const existing = kata.find((l) => l.transactionId === txId);
        const fallbackDesc =
          resolved.kind === "partner"
            ? t.openingKata.partnerDefaultDescription
            : defaultDesc;
        if (existing) {
          setInKata(true);
          setLine(mapApiOpeningToLine(existing, fallbackDesc));
        } else {
          setInKata(false);
          const fromTx = lineFromTransaction(detail, fallbackDesc);
          if (!fromTx.currencyCode) fromTx.currencyCode = defaultCcy;
          setLine(fromTx);
        }
      } catch (err: unknown) {
        if (!cancelled) setError(errorMessage(err, t.errors.openingKataSave));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    open,
    editTransactionId,
    t.errors.loadGeneric,
    t.errors.openingKataSave,
    t.openingKata.defaultDescription,
    t.openingKata.partnerDefaultDescription,
  ]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!session || !owner || !line) return;
    if (!line.amount.trim() || !line.currencyCode.trim()) {
      setError(`${t.openingKata.amount} *`);
      return;
    }
    if (!tryBeginSubmit(submittingRef)) return;
    setSaving(true);
    setError(null);
    try {
      const txId = (editTransactionId ?? "").trim();
      const edited: OpeningLine = { ...line, transactionId: inKata ? txId : undefined };
      if (owner.kind === "customer") {
        const rest = owner.customer.openingKata
          .filter((l) => l.transactionId !== txId)
          .map((l) => mapApiOpeningToLine(l, t.openingKata.defaultDescription));
        if (!inKata) {
          await softDeleteMovement({ id: txId, createdById: session.userId });
        }
        await updateCustomer({
          id: owner.customer.id,
          fullName: owner.customer.fullName,
          fatherName: owner.customer.fatherName ?? null,
          phone: owner.customer.phone ?? "",
          address: owner.customer.address ?? null,
          nationalId: owner.customer.nationalId ?? null,
          notes: owner.customer.notes ?? null,
          customerType: owner.customer.customerType,
          actorUserId: session.userId,
          openingKata: mapOpeningKata([...rest, edited]),
        });
      } else {
        const rest = owner.partner.openingKata
          .filter((l) => l.transactionId !== txId)
          .map((l) => mapApiOpeningToLine(l, t.openingKata.partnerDefaultDescription));
        if (!inKata) {
          await softDeleteMovement({ id: txId, createdById: session.userId });
        }
        await updatePartner({
          id: owner.partner.id,
          name: owner.partner.name,
          phone: owner.partner.phone ?? "",
          city: owner.partner.city ?? null,
          country: owner.partner.country ?? null,
          notes: owner.partner.notes ?? null,
          isActive: owner.partner.isActive,
          commissionEnabled: owner.partner.commissionEnabled,
          commissionPerAmount: owner.partner.commissionPerAmount,
          commissionFeeAmount: owner.partner.commissionFeeAmount,
          commissionCurrencyId: owner.partner.commissionCurrencyId,
          actorUserId: session.userId,
          openingKata: mapOpeningKata([...rest, edited]),
        });
      }
      onSaved?.();
      onClose();
    } catch (err: unknown) {
      setError(errorMessage(err, t.errors.openingKataSave));
    } finally {
      endSubmit(submittingRef);
      setSaving(false);
    }
  }

  if (!open) return null;

  const partyName =
    owner?.kind === "customer"
      ? owner.customer.fullName
      : owner?.kind === "partner"
        ? owner.partner.name
        : "";
  const helper =
    owner?.kind === "partner"
      ? t.openingKata.editPartnerHelper
      : t.openingKata.editCustomerHelper;

  return (
    <Modal
      title={`${t.common.editAction} — ${t.openingKata.title}`}
      onClose={formBusy ? () => undefined : onClose}
    >
      {partyName ? (
        <p className="muted" style={{ margin: 0 }}>
          {partyName}
        </p>
      ) : null}
      {loading ? (
        <p className="muted">{t.common.loading}</p>
      ) : line ? (
        <form
          ref={formRef}
          className="stack"
          data-desk-form
          onKeyDown={(e) =>
            handleDeskFormKeyDown(e, {
              busy: formBusy,
              onSubmit: () => formRef.current?.requestSubmit(),
            })
          }
          onSubmit={(e) => void handleSubmit(e)}
        >
          <OpeningKataFields
            currencies={currencies}
            lines={[line]}
            allowAdd={false}
            onChange={(_index, patch) => setLine((prev) => (prev ? { ...prev, ...patch } : prev))}
            onAdd={() => undefined}
            onRemove={() => undefined}
            onCurrenciesChange={setCurrencies}
            helper={helper}
            giveLabel={
              owner?.kind === "partner" ? t.openingKata.partnerGives : t.openingKata.customerGives
            }
            takeLabel={
              owner?.kind === "partner" ? t.openingKata.partnerTakes : t.openingKata.customerTakes
            }
          />
          <ModalErrorBanner message={error} />
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={onClose} disabled={formBusy}>
              {t.common.cancel}
            </button>
            <button type="submit" className="primary" disabled={formBusy}>
              {t.common.save}
            </button>
          </div>
        </form>
      ) : (
        <>
          <ModalErrorBanner message={error} />
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={onClose}>
              {t.common.cancel}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
