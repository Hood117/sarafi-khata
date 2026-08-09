"use client";

import { ReceiveHawalaDialog } from "@/features/hawala/components/receive-hawala-dialog";
import { SendHawalaDialog } from "@/features/hawala/components/send-hawala-dialog";
import { useT } from "@/lib/i18n";

type HawalaPageHeaderProps = {
  onSuccess?: (message: string) => void;
  successMessage?: string | null;
};

export function HawalaPageHeader({
  onSuccess,
  successMessage,
}: HawalaPageHeaderProps) {
  const t = useT();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <ReceiveHawalaDialog
          onSuccess={onSuccess}
          triggerLabel={t.hawala.receive}
          title={t.hawala.receiveTitle}
          submitLabel={t.hawala.receive}
        />
        <SendHawalaDialog
          onSuccess={onSuccess}
          triggerLabel={t.hawala.send}
          title={t.hawala.sendTitle}
          submitLabel={t.hawala.send}
        />
      </div>

      {successMessage ? (
        <div
          className="bg-success/10 text-success animate-in fade-in-0 slide-in-from-top-1 rounded-xl px-3.5 py-2.5 text-sm font-medium ring-1 ring-success/15 duration-200"
          role="status"
        >
          {successMessage}
        </div>
      ) : null}
    </div>
  );
}
