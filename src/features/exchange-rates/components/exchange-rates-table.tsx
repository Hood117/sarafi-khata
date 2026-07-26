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
import { EditExchangeRateDialog } from "@/features/exchange-rates/components/edit-exchange-rate-dialog";
import { ExchangeRatesEmptyState } from "@/features/exchange-rates/components/exchange-rates-empty-state";
import { SetExchangeRateActiveButton } from "@/features/exchange-rates/components/set-exchange-rate-active-button";
import type {
  ExchangeRateCurrencyOption,
  ExchangeRateListItem,
} from "@/features/exchange-rates/domain/types";

type ExchangeRatesTableProps = {
  rates: ExchangeRateListItem[];
  currencies: ExchangeRateCurrencyOption[];
  onRateChanged?: (message: string) => void;
};

export function ExchangeRatesTable({
  rates,
  currencies,
  onRateChanged,
}: ExchangeRatesTableProps) {
  const total = rates.length;

  return (
    <div className="space-y-4">
      <div className="bg-card overflow-hidden rounded-xl shadow-sm ring-1 ring-foreground/10">
        {total === 0 ? (
          <ExchangeRatesEmptyState />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Base Currency</TableHead>
                <TableHead>Quote Currency</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[180px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rates.map((rate) => {
                const pairLabel = `${rate.baseCurrencyCode} / ${rate.quoteCurrencyCode}`;
                const rateLabel = `1 ${rate.baseCurrencyCode} = ${rate.rateDisplay} ${rate.quoteCurrencyCode}`;

                return (
                  <TableRow key={rate.id} className="hover:bg-transparent">
                    <TableCell className="font-semibold">
                      {rate.baseCurrencyCode}
                    </TableCell>
                    <TableCell className="font-semibold">
                      {rate.quoteCurrencyCode}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        <div className="text-muted-foreground text-xs">
                          {pairLabel}
                        </div>
                        <div>{rateLabel}</div>
                      </div>
                    </TableCell>
                    <TableCell>{rate.effectiveDate}</TableCell>
                    <TableCell>
                      <StatusBadge
                        label={rate.isActive ? "Active" : "Inactive"}
                        tone={toneForRecordStatus(
                          rate.isActive ? "ACTIVE" : "INACTIVE",
                        )}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <EditExchangeRateDialog
                          exchangeRateId={rate.id}
                          currencies={currencies}
                          onSuccess={onRateChanged}
                        />
                        <SetExchangeRateActiveButton
                          exchangeRateId={rate.id}
                          pairLabel={pairLabel}
                          isActive={rate.isActive}
                          onSuccess={onRateChanged}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
