"use client";

import {
  StatusBadge,
  toneForRecordStatus,
} from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CurrenciesEmptyState } from "@/features/currencies/components/currencies-empty-state";
import { EditCurrencyDialog } from "@/features/currencies/components/edit-currency-dialog";
import { SetCurrencyActiveButton } from "@/features/currencies/components/set-currency-active-button";
import type { CurrencyListItem } from "@/features/currencies/domain/types";
import { resolveCurrencySymbolForDisplay } from "@/features/transactions/domain/currency-display";
import { useLocale, useT } from "@/lib/i18n";

type CurrenciesTableProps = {
  currencies: CurrencyListItem[];
  onCurrencyChanged?: (message: string) => void;
};

function displayValue(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "—";
}

export function CurrenciesTable({
  currencies,
  onCurrencyChanged,
}: CurrenciesTableProps) {
  const t = useT();
  const { locale } = useLocale();
  const total = currencies.length;

  return (
    <div className="space-y-4">
      <div className="bg-card overflow-hidden rounded-xl shadow-sm ring-1 ring-foreground/10">
        {total === 0 ? (
          <CurrenciesEmptyState />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Code</TableHead>
                <TableHead>{t.common.name}</TableHead>
                <TableHead>Symbol</TableHead>
                <TableHead>{t.common.status}</TableHead>
                <TableHead className="w-[180px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {currencies.map((currency) => (
                <TableRow key={currency.id} className="hover:bg-transparent">
                  <TableCell className="font-semibold">{currency.code}</TableCell>
                  <TableCell>{currency.name}</TableCell>
                  <TableCell>
                    {displayValue(
                      resolveCurrencySymbolForDisplay(
                        currency.symbol,
                        locale,
                      ),
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      label={currency.isActive ? "Active" : "Inactive"}
                      tone={toneForRecordStatus(
                        currency.isActive ? "ACTIVE" : "INACTIVE",
                      )}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <EditCurrencyDialog
                        currencyId={currency.id}
                        onSuccess={onCurrencyChanged}
                      />
                      <SetCurrencyActiveButton
                        currencyId={currency.id}
                        currencyCode={currency.code}
                        isActive={currency.isActive}
                        onSuccess={onCurrencyChanged}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
