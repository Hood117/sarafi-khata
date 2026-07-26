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
import { setExchangeRateActiveAction } from "@/features/exchange-rates/actions/exchange-rate-actions";

type SetExchangeRateActiveButtonProps = {
  exchangeRateId: string;
  pairLabel: string;
  isActive: boolean;
  onSuccess?: (message: string) => void;
};

export function SetExchangeRateActiveButton({
  exchangeRateId,
  pairLabel,
  isActive,
  onSuccess,
}: SetExchangeRateActiveButtonProps) {
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
      const result = await setExchangeRateActiveAction(
        exchangeRateId,
        nextActive,
      );

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
          ? "Unable to activate exchange rate. Please try again."
          : "Unable to deactivate exchange rate. Please try again.",
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
            {nextActive ? "Activate exchange rate" : "Deactivate exchange rate"}
          </DialogTitle>
          <DialogDescription>
            {nextActive
              ? `Activate ${pairLabel}? It will be available for future exchange workflows.`
              : `Deactivate ${pairLabel}? Historical records are preserved.`}
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
