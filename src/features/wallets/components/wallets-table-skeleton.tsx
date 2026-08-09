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

export function WalletsTableSkeleton() {
  const t = useT();
  return (
    <div className="space-y-4" aria-busy="true" aria-label={t.wallets.loadingWallets}>
      <div className="flex justify-end">
        <div className="bg-muted h-8 w-28 animate-pulse rounded-lg" />
      </div>

      <div className="overflow-hidden rounded-xl shadow-sm ring-1 ring-foreground/10">
        <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t.wallets.walletName}</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[160px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: SKELETON_ROWS }, (_, index) => (
                <TableRow key={index} className="hover:bg-transparent">
                  {Array.from({ length: 6 }, (__, cellIndex) => (
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
