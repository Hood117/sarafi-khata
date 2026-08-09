"use client";

import { ArrowLeftRight, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { loadExchangeFormOptionsAction } from "@/features/exchange/actions/exchange-form-options-action";
import { ExchangeForm } from "@/features/exchange/components/exchange-form";
import type { ExchangeFormOptions } from "@/features/exchange/domain/types";
import { useT } from "@/lib/i18n";

type NewExchangeDialogProps = {
  onSuccess?: (message: string) => void;
};

export function NewExchangeDialog({ onSuccess }: NewExchangeDialogProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [options, setOptions] = useState<ExchangeFormOptions | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || options) {
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    void loadExchangeFormOptionsAction()
      .then((next) => {
        if (!cancelled) {
          setOptions(next);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError(t.common.error);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, options, t.common.error]);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setFormKey((current) => current + 1);
      setOptions(null);
      setLoadError(null);
    }
  }

  function handleSuccess(message: string) {
    onSuccess?.(message);
    handleOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button />}>
        <ArrowLeftRight data-icon="inline-start" />
        {t.exchange.newExchange}
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t.exchange.newExchange}</DialogTitle>
          <DialogDescription>{t.exchange.historyHint}</DialogDescription>
        </DialogHeader>

        {loading || !options ? (
          <div className="text-muted-foreground flex items-center gap-2 py-8 text-sm">
            <Loader2 className="size-4 animate-spin" />
            {loadError ?? t.common.loading}
          </div>
        ) : (
          <ExchangeForm
            key={formKey}
            customers={options.customers}
            wallets={options.wallets}
            currencies={options.currencies}
            rates={options.rates}
            allowManualRateOverride={options.allowManualRateOverride}
            onSuccess={handleSuccess}
            onCancel={() => handleOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
