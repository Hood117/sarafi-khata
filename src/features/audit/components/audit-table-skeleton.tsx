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

const SKELETON_ROWS = 8;
const COLUMN_COUNT = 7;

export function AuditTableSkeleton() {
  const t = useT();
  return (
    <div className="space-y-4" aria-busy="true" aria-label={t.audit.loadingAudit}>
      <div className="space-y-2">
        <div className="bg-muted h-6 w-40 animate-pulse rounded-md" />
        <div className="bg-muted h-4 w-72 max-w-full animate-pulse rounded-md" />
      </div>

      <div className="bg-muted h-10 w-full max-w-md animate-pulse rounded-lg" />

      <div className="overflow-hidden rounded-xl shadow-sm ring-1 ring-foreground/10">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Timestamp</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Module</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Summary</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: SKELETON_ROWS }, (_, index) => (
              <TableRow key={index} className="hover:bg-transparent">
                {Array.from({ length: COLUMN_COUNT }, (__, cellIndex) => (
                  <TableCell key={cellIndex}>
                    <div className="bg-muted h-4 w-full max-w-[8rem] animate-pulse rounded-md" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="bg-muted h-4 w-48 animate-pulse rounded-md" />
        <div className="flex gap-2">
          <div className="bg-muted h-8 w-20 animate-pulse rounded-lg" />
          <div className="bg-muted h-8 w-16 animate-pulse rounded-lg" />
        </div>
      </div>
    </div>
  );
}
