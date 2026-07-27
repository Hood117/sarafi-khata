import {
  TransferView,
  getTransferFormOptions,
  getTransferHistory,
} from "@/features/transfers";

type TransfersPageProps = {
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

export default async function TransfersPage({
  searchParams,
}: TransfersPageProps) {
  const params = await searchParams;
  const search = firstValue(params.q).trim();

  const [formOptions, transfers] = await Promise.all([
    getTransferFormOptions(),
    getTransferHistory({ search }),
  ]);

  return (
    <TransferView
      customers={formOptions.customers}
      currencies={formOptions.currencies}
      transfers={transfers}
      search={search}
    />
  );
}
