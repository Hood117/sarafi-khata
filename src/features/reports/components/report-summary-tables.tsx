import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Typography } from "@/design-system/typography";
import type { ReportCountRow, ReportCurrencyTotal } from "@/features/reports/domain/types";

type CountSummaryTableProps = {
  title: string;
  rows: ReportCountRow[];
  emptyLabel?: string;
};

export function CountSummaryTable({
  title,
  rows,
  emptyLabel = "No data for this period.",
}: CountSummaryTableProps) {
  return (
    <div className="space-y-2">
      <Typography variant="bodySm" className="font-semibold">
        {title}
      </Typography>
      <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
        {rows.length === 0 ? (
          <div className="px-2 py-3">
            <Typography variant="muted">{emptyLabel}</Typography>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Count</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.label}>
                  <TableCell>{row.label}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {row.count}
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

type CurrencyTotalTableProps = {
  title: string;
  rows: ReportCurrencyTotal[];
  emptyLabel?: string;
};

export function CurrencyTotalTable({
  title,
  rows,
  emptyLabel = "No data for this period.",
}: CurrencyTotalTableProps) {
  return (
    <div className="space-y-2">
      <Typography variant="bodySm" className="font-semibold">
        {title}
      </Typography>
      <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
        {rows.length === 0 ? (
          <div className="px-2 py-3">
            <Typography variant="muted">{emptyLabel}</Typography>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Currency</TableHead>
                <TableHead className="text-right">Count</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.currencyCode}>
                  <TableCell className="font-medium">
                    {row.currencyCode}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.count}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {row.totalDisplay}
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
