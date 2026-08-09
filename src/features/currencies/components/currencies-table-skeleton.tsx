"use client";

import { useT } from "@/lib/i18n";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const SKELETON_ROWS = 6;

export function CurrenciesTableSkeleton() {
  const t = useT();
  return (
    <div className="space-y-4" aria-busy="true" aria-label={t.currencies.loadingCurrencies}>
      <div className="flex justify-end">
        <div className="bg-muted h-8 w-32 animate-pulse rounded-lg" />
      </div>

      <div className="overflow-hidden rounded-xl shadow-sm ring-1 ring-foreground/10">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Symbol</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[180px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: SKELETON_ROWS }, (_, index) => (
              <TableRow key={index} className="hover:bg-transparent">
                {Array.from({ length: 5 }, (__, cellIndex) => (
                  <TableCell key={cellIndex}>
                    <div className="bg-muted h-4 w-full max-w-[7rem] animate-pulse rounded-md" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
