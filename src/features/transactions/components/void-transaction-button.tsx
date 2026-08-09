"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

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
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { voidTransactionAction } from "@/features/transactions/actions/transaction-actions";

type VoidTransactionButtonProps = {
  transactionId: string;
  reference: string;
};

export function VoidTransactionButton({
  transactionId,
  reference,
}: VoidTransactionButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await voidTransactionAction({
        transactionId,
        reason,
      });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        Void Transaction
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Void {reference}?</DialogTitle>
          <DialogDescription>
            This posts reversing ledger entries and marks the original
            transaction as voided. Original ledger history is kept.
          </DialogDescription>
        </DialogHeader>

        <Field>
          <FieldLabel htmlFor="void-reason">Reason (optional)</FieldLabel>
          <Textarea
            id="void-reason"
            value={reason}
            disabled={isPending}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why is this being voided?"
          />
        </Field>

        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isPending}
            onClick={handleConfirm}
          >
            {isPending ? "Voiding…" : "Confirm Void"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
