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
import { archiveHawalaAction } from "@/features/hawala/actions/hawala-actions";
import { useT } from "@/lib/i18n";

type ArchiveHawalaButtonProps = {
  hawalaId: string;
  reference: string;
};

export function ArchiveHawalaButton({
  hawalaId,
  reference,
}: ArchiveHawalaButtonProps) {
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
      const result = await archiveHawalaAction({ hawalaId });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      handleOpenChange(false);
      router.push("/hawala");
      router.refresh();
    } catch {
      setError(t.common.error);
    } finally {
      setIsArchiving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="outline" />}>
        {t.common.archive}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.hawala.archiveTitle}</DialogTitle>
          <DialogDescription>
            {t.hawala.archiveConfirm} ({reference})
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
            {t.common.cancel}
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
                {t.hawala.archiving}
              </>
            ) : (
              t.hawala.archiveTitle
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
