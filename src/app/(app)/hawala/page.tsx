import {
  getHawalaFormOptions,
  getHawalaList,
  HawalaView,
} from "@/features/hawala";

type HawalaPageProps = {
  searchParams: Promise<{
    q?: string | string[];
  }>;
};

function firstValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

export default async function HawalaPage({ searchParams }: HawalaPageProps) {
  const params = await searchParams;
  const search = firstValue(params.q).trim();

  const [transfers, formOptions] = await Promise.all([
    getHawalaList({ search }),
    getHawalaFormOptions(),
  ]);

  return (
    <HawalaView
      transfers={transfers}
      search={search}
      customers={formOptions.customers}
      cashWallets={formOptions.cashWallets}
      clearingWallets={formOptions.clearingWallets}
      currencies={formOptions.currencies}
    />
  );
}
