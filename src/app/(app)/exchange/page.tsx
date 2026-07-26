import {
  ExchangeView,
  getExchangeFormOptions,
  getExchangeHistory,
} from "@/features/exchange";

type ExchangePageProps = {
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

export default async function ExchangePage({
  searchParams,
}: ExchangePageProps) {
  const params = await searchParams;
  const search = firstValue(params.q).trim();

  const [formOptions, exchanges] = await Promise.all([
    getExchangeFormOptions(),
    getExchangeHistory({ search }),
  ]);

  return (
    <ExchangeView
      customers={formOptions.customers}
      wallets={formOptions.wallets}
      currencies={formOptions.currencies}
      rates={formOptions.rates}
      allowManualRateOverride={formOptions.allowManualRateOverride}
      exchanges={exchanges}
      search={search}
    />
  );
}
