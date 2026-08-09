import {
  getDailyBookPageData,
  DailyBookView,
  parseDailyBookFiltersFromSearchParams,
} from "@/features/daily-book";

type DailyBookPageProps = {
  searchParams: Promise<{
    date?: string | string[];
    type?: string | string[];
    customerId?: string | string[];
    currency?: string | string[];
  }>;
};

export default async function DailyBookPage({ searchParams }: DailyBookPageProps) {
  const params = await searchParams;
  const filters = parseDailyBookFiltersFromSearchParams(params);
  const { transactions, customers, currencies } =
    await getDailyBookPageData(filters);

  return (
    <DailyBookView
      filters={filters}
      customers={customers}
      currencies={currencies}
      transactions={transactions}
    />
  );
}
