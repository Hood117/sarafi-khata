"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { settlePartnerCommissionAction } from "@/features/partner-sarafi/actions/partner-sarafi-actions";
import { useT } from "@/lib/i18n";

type CashWalletOption = {
  id: string;
  label: string;
};

type SettlePartnerCommissionDialogProps = {
  partnerId: string;
  partnerName: string;
  kind: "PAY_PARTNER" | "COLLECT_FROM_PARTNER";
  currencyCode: string;
  maxAmount: string;
  cashWallets: CashWalletOption[];
  triggerLabel: string;
};

export function SettlePartnerCommissionDialog({
  partnerId,
  partnerName,
  kind,
  currencyCode,
  maxAmount,
  cashWallets,
  triggerLabel,
}: SettlePartnerCommissionDialogProps) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const defaultWalletId = cashWallets[0]?.id ?? "";
  const [amount, setAmount] = useState(maxAmount);
  const [cashWalletId, setCashWalletId] = useState(defaultWalletId);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const title = useMemo(
    () =>
      kind === "PAY_PARTNER"
        ? `${t.partner.payHim} — ${partnerName}`
        : `${t.partner.collectFromHim} — ${partnerName}`,
    [kind, partnerName, t.partner.collectFromHim, t.partner.payHim],
  );

  const openBalanceHint =
    kind === "PAY_PARTNER" ? t.partner.youOwe : t.partner.theyOwe;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setAmount(maxAmount);
      setCashWalletId(cashWallets[0]?.id ?? "");
      setNotes("");
      setError(null);
      setFieldError(null);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldError(null);
    setIsSubmitting(true);

    try {
      const result = await settlePartnerCommissionAction({
        partnerSarafiId: partnerId,
        kind,
        currencyCode,
        amount: amount.trim(),
        cashWalletId,
        notes: notes.trim() || undefined,
      });

      if (!result.ok) {
        setError(result.message);
        setFieldError(result.fieldErrors?.amount ?? null);
        return;
      }

      router.refresh();
      setOpen(false);
    } catch {
      setError(t.common.tryAgain);
    } finally {
      setIsSubmitting(false);
    }
  }

  const disabled = isSubmitting || cashWallets.length === 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button size="sm" />}>{triggerLabel}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {t.partner.settleTitle}: {openBalanceHint} — {maxAmount}{" "}
            {currencyCode}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <FieldGroup>
            <Field data-invalid={fieldError ? true : undefined}>
              <FieldLabel htmlFor="settle-amount">
                {t.partner.settleAmount} ({currencyCode})
              </FieldLabel>
              <Input
                id="settle-amount"
                inputMode="decimal"
                value={amount}
                disabled={disabled}
                onChange={(event) => setAmount(event.target.value)}
              />
              {fieldError ? <FieldError>{fieldError}</FieldError> : null}
            </Field>

            <Field>
              <FieldLabel htmlFor="settle-cash">
                {t.partner.settleCashWallet}
              </FieldLabel>
              <select
                id="settle-cash"
                value={cashWalletId}
                disabled={disabled}
                className="border-input bg-background h-8 w-full rounded-lg border px-2.5 text-sm"
                onChange={(event) => setCashWalletId(event.target.value)}
              >
                {cashWallets.map((wallet) => (
                  <option key={wallet.id} value={wallet.id}>
                    {wallet.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field>
              <FieldLabel htmlFor="settle-notes">
                {t.partner.settleNotes}
              </FieldLabel>
              <Textarea
                id="settle-notes"
                value={notes}
                disabled={disabled}
                placeholder={t.common.notesOptional}
                onChange={(event) => setNotes(event.target.value)}
              />
            </Field>
          </FieldGroup>

          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => setOpen(false)}
            >
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={disabled}>
              {isSubmitting ? t.common.saving : t.partner.settleConfirm}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
