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
import { archiveExternalMoneyAction } from "@/features/external-money/actions/external-money-actions";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

type ArchiveExternalMoneyButtonProps = {
  transactionId: string;
  reference: string;
  onSuccess?: (message: string) => void;
  triggerClassName?: string;
};

export function ArchiveExternalMoneyButton({
  transactionId,
  reference,
  onSuccess,
  triggerClassName,
}: ArchiveExternalMoneyButtonProps) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setError(null);
      setIsArchiving(false);
    }
  }

  async function handleArchive() {
    setError(null);
    setIsArchiving(true);

    try {
      const result = await archiveExternalMoneyAction({ transactionId });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      onSuccess?.(result.message);
      handleOpenChange(false);
      router.refresh();
    } catch {
      setError("Unable to archive external money. Please try again.");
    } finally {
      setIsArchiving(false);
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
        Archive
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.common.archive}</DialogTitle>
          <DialogDescription>
            Archive {reference}? It will be hidden from the active list and
            removed from cash balances. History stays available under Archived.
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
            disabled={isArchiving}
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isArchiving}
            onClick={handleArchive}
          >
            {isArchiving ? (
              <>
                <Loader2 className="animate-spin" />
                Archiving...
              </>
            ) : (
              "Archive"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
