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
import { cancelHawalaAction } from "@/features/hawala/actions/hawala-actions";
import { useT } from "@/lib/i18n";

type CancelHawalaButtonProps = {
  hawalaId: string;
  reference: string;
};

export function CancelHawalaButton({
  hawalaId,
  reference,
}: CancelHawalaButtonProps) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setError(null);
      setIsCancelling(false);
    }
  }

  async function handleCancel() {
    setError(null);
    setIsCancelling(true);

    try {
      const result = await cancelHawalaAction({ hawalaId });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      handleOpenChange(false);
      router.refresh();
    } catch {
      setError(t.common.error);
    } finally {
      setIsCancelling(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="destructive" />}>
        {t.hawala.cancelTransfer}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.hawala.cancel}</DialogTitle>
          <DialogDescription>
            {t.hawala.cancelConfirm} ({reference})
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
            disabled={isCancelling}
            onClick={() => handleOpenChange(false)}
          >
            {t.hawala.keepPending}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isCancelling}
            onClick={handleCancel}
          >
            {isCancelling ? (
              <>
                <Loader2 className="animate-spin" />
                {t.hawala.cancelling}
              </>
            ) : (
              t.hawala.cancelTransfer
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
