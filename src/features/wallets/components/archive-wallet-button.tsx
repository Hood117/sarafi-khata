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
import { archiveWalletAction } from "@/features/wallets/actions/wallet-actions";
import { useT } from "@/lib/i18n";

type ArchiveWalletButtonProps = {
  walletId: string;
  walletName: string;
  onSuccess?: (message: string) => void;
};

export function ArchiveWalletButton({
  walletId,
  walletName,
  onSuccess,
}: ArchiveWalletButtonProps) {
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
      const result = await archiveWalletAction(walletId);

      if (!result.ok) {
        setError(result.message);
        return;
      }

      onSuccess?.(result.message);
      handleOpenChange(false);
      router.refresh();
    } catch {
      setError("Unable to archive wallet. Please try again.");
    } finally {
      setIsArchiving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="ghost" size="sm" />}>
        Archive
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.common.archive}</DialogTitle>
          <DialogDescription>
            Archive {walletName}? It will be removed from the active wallet
            list. Historical ledger links are preserved.
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
              "Archive Wallet"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
