export type ReportCardDefinition = {
  href: string;
  title: string;
  description: string;
};

export const REPORT_CARDS: ReportCardDefinition[] = [
  {
    href: "/reports/monthly",
    title: "Monthly Report",
    description: "Daily and monthly posted activity with business cash snapshot.",
  },
  {
    href: "/reports/customer-statement",
    title: "Customer Statement",
    description: "Balances and history for a selected customer.",
  },
  {
    href: "/reports/hawala",
    title: "Hawala Report",
    description: "Hawala documents, status, direction, and currency totals.",
  },
  {
    href: "/reports/exchange",
    title: "Exchange Report",
    description: "Exchange tickets and pair activity for the selected period.",
  },
  {
    href: "/reports/transfers",
    title: "Transfers Report",
    description: "Internal transfers with currency totals.",
  },
  {
    href: "/reports/transactions",
    title: "Transactions Report",
    description: "Full filtered transaction list for the selected dates.",
  },
  {
    href: "/reports/fx-pnl",
    title: "FX Gain / Loss",
    description:
      "Exchange Difference wallet P&L by currency for the selected period.",
  },
];
