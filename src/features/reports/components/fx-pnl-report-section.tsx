"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Typography } from "@/design-system/typography";
import type { FxPnlReport } from "@/features/reports/services/get-fx-pnl-report";
import { formatCurrencyLabel } from "@/features/transactions/domain/currency-display";
import { useLocale } from "@/lib/i18n";

type FxPnlReportSectionProps = {
  report: FxPnlReport;
};

export function FxPnlReportSection({ report }: FxPnlReportSectionProps) {
  const { locale } = useLocale();

  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <Typography variant="h3">FX Gain / Loss</Typography>
        <Typography variant="muted">
          Ledger activity on {report.walletName}. Positive net means credits
          exceeded debits on the difference wallet for that currency.
        </Typography>
      </div>

      <div className="bg-card overflow-hidden rounded-xl shadow-sm ring-1 ring-foreground/10">
        {report.rows.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <Typography variant="muted">
              No exchange difference activity for this period.
            </Typography>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Currency</TableHead>
                <TableHead>Debit</TableHead>
                <TableHead>Credit</TableHead>
                <TableHead>Net</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.rows.map((row) => (
                <TableRow key={row.currencyCode} className="hover:bg-transparent">
                  <TableCell className="font-semibold">
                    {formatCurrencyLabel({
                      code: row.currencyCode,
                      symbol: row.currencySymbol,
                      locale,
                    })}
                  </TableCell>
                  <TableCell>{row.debitDisplay}</TableCell>
                  <TableCell>{row.creditDisplay}</TableCell>
                  <TableCell className="font-semibold">
                    {row.netDisplay}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </section>
  );
}
