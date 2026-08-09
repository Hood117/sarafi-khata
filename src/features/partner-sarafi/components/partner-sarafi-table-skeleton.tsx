"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useT } from "@/lib/i18n";

const SKELETON_ROWS = 6;

export function PartnerSarafiTableSkeleton() {
  const t = useT();

  return (
    <div
      className="space-y-4"
      aria-busy="true"
      aria-label={t.partner.loadingPartners}
    >
      <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t.common.name}</TableHead>
              <TableHead>{t.common.phone}</TableHead>
              <TableHead>{t.common.location}</TableHead>
              <TableHead>{t.common.status}</TableHead>
              <TableHead className="w-[180px]">{t.common.actions}</TableHead>
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
