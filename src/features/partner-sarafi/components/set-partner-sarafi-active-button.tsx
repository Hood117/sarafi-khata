"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { setPartnerSarafiActiveAction } from "@/features/partner-sarafi/actions/partner-sarafi-actions";
import { useT } from "@/lib/i18n";

type SetPartnerSarafiActiveButtonProps = {
  partnerId: string;
  partnerName: string;
  isActive: boolean;
  onSuccess?: (message: string) => void;
};

export function SetPartnerSarafiActiveButton({
  partnerId,
  partnerName,
  isActive,
  onSuccess,
}: SetPartnerSarafiActiveButtonProps) {
  const t = useT();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    const confirmed = window.confirm(
      isActive ? t.partner.deactivateConfirm : t.partner.activateConfirm,
    );
    if (!confirmed) {
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await setPartnerSarafiActiveAction(partnerId, !isActive);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onSuccess?.(result.message);
      router.refresh();
    });
  }

  const pendingLabel = isActive
    ? t.partner.deactivating
    : t.partner.activating;
  const actionLabel = isActive ? t.common.deactivate : t.common.activate;

  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={isPending}
        onClick={handleClick}
        aria-label={`${actionLabel} ${partnerName}`}
      >
        {isPending ? pendingLabel : actionLabel}
      </Button>
      {error ? (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
