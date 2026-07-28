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

type CancelHawalaButtonProps = {
  hawalaId: string;
  reference: string;
};

export function CancelHawalaButton({
  hawalaId,
  reference,
}: CancelHawalaButtonProps) {
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
      setError("Unable to cancel hawala. Please try again.");
    } finally {
      setIsCancelling(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="destructive" />}>
        Cancel Transfer
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel hawala transfer</DialogTitle>
          <DialogDescription>
            Cancel {reference}? This pending transfer will be marked as
            cancelled. No financial posting will be reversed because none has
            been created yet.
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
            Keep pending
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
                Cancelling...
              </>
            ) : (
              "Cancel Transfer"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
