"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { updateExternalMoneyAction } from "@/features/external-money/actions/external-money-actions";
import type { ExternalMoneyListItem } from "@/features/external-money/domain/types";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

type EditExternalMoneyDialogProps = {
  item: ExternalMoneyListItem;
  onSuccess?: (message: string) => void;
  triggerClassName?: string;
};

export function EditExternalMoneyDialog({
  item,
  onSuccess,
  triggerClassName,
}: EditExternalMoneyDialogProps) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(item.notes ?? "");
  const [fieldErrors, setFieldErrors] = useState<{ notes?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setNotes(item.notes ?? "");
      setFieldErrors({});
      setError(null);
      setIsSubmitting(false);
    } else {
      setFieldErrors({});
      setError(null);
      setIsSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setIsSubmitting(true);

    try {
      const result = await updateExternalMoneyAction({
        transactionId: item.id,
        notes,
      });

      if (!result.ok) {
        setError(result.message);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }

      onSuccess?.(result.message);
      router.refresh();
      handleOpenChange(false);
    } catch {
      setError("Unable to update external money. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className={cn(triggerClassName)}
          />
        }
      >
        Edit
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t.externalMoney.add}</DialogTitle>
          <DialogDescription>
            Update notes for {item.reference}. Amount and currency cannot be
            changed.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error ? (
            <div className="text-destructive text-sm" role="alert">
              {error}
            </div>
          ) : null}

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`external-money-edit-amount-${item.id}`}>
                Amount
              </FieldLabel>
              <Input
                id={`external-money-edit-amount-${item.id}`}
                value={item.amountFormatted}
                disabled
                readOnly
              />
            </Field>

            <Field>
              <FieldLabel htmlFor={`external-money-edit-wallet-${item.id}`}>
                Cash wallet
              </FieldLabel>
              <Input
                id={`external-money-edit-wallet-${item.id}`}
                value={item.cashWalletName}
                disabled
                readOnly
              />
            </Field>

            <Field data-invalid={fieldErrors.notes ? true : undefined}>
              <FieldLabel htmlFor={`external-money-edit-notes-${item.id}`}>
                Notes
              </FieldLabel>
              <Textarea
                id={`external-money-edit-notes-${item.id}`}
                name="notes"
                rows={3}
                placeholder="Optional note (source, reason…)"
                value={notes}
                aria-invalid={fieldErrors.notes ? true : undefined}
                onChange={(event) => setNotes(event.target.value)}
              />
              {fieldErrors.notes ? (
                <FieldError>{fieldErrors.notes}</FieldError>
              ) : null}
            </Field>
          </FieldGroup>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => handleOpenChange(false)}
            >
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : null}
              {isSubmitting ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
