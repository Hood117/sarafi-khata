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
import { archiveCustomerAction } from "@/features/customers/actions/customer-actions";

type ArchiveCustomerButtonProps = {
  customerId: string;
  customerName: string;
};

export function ArchiveCustomerButton({
  customerId,
  customerName,
}: ArchiveCustomerButtonProps) {
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
      const result = await archiveCustomerAction(customerId);

      if (!result.ok) {
        setError(result.message);
        return;
      }

      handleOpenChange(false);
      router.push("/customers");
      router.refresh();
    } catch {
      setError("Unable to archive customer. Please try again.");
    } finally {
      setIsArchiving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="outline" />}>
        Archive
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Archive customer</DialogTitle>
          <DialogDescription>
            Archive {customerName}? They will be removed from the active
            customer list. This does not delete historical records.
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
              "Archive Customer"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
