"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
import { setCurrencyActiveAction } from "@/features/currencies/actions/currency-actions";

type SetCurrencyActiveButtonProps = {
  currencyId: string;
  currencyCode: string;
  isActive: boolean;
  onSuccess?: (message: string) => void;
};

export function SetCurrencyActiveButton({
  currencyId,
  currencyCode,
  isActive,
  onSuccess,
}: SetCurrencyActiveButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const nextActive = !isActive;
  const actionLabel = nextActive ? "Activate" : "Deactivate";

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setError(null);
      setIsSaving(false);
    }
  }

  async function handleConfirm() {
    setError(null);
    setIsSaving(true);

    try {
      const result = await setCurrencyActiveAction(currencyId, nextActive);

      if (!result.ok) {
        setError(result.message);
        return;
      }

      onSuccess?.(result.message);
      handleOpenChange(false);
      router.refresh();
    } catch {
      setError(
        nextActive
          ? "Unable to activate currency. Please try again."
          : "Unable to deactivate currency. Please try again.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="ghost" size="sm" />}>
        {actionLabel}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {nextActive ? "Activate currency" : "Deactivate currency"}
          </DialogTitle>
          <DialogDescription>
            {nextActive
              ? `Activate ${currencyCode}? It will appear in transaction currency lists.`
              : `Deactivate ${currencyCode}? It will be hidden from new transaction options. Historical records are preserved.`}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}

        <DialogFooter className="border-0 bg-transparent p-0 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={isSaving}
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={nextActive ? "default" : "destructive"}
            disabled={isSaving}
            onClick={handleConfirm}
          >
            {isSaving ? (
              <>
                <Loader2 className="animate-spin" />
                Saving...
              </>
            ) : (
              actionLabel
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
