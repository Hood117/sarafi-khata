import {
  ExternalMoneyView,
  getExternalMoneyPageData,
  listExternalMoney,
  type ExternalMoneyArchiveFilter,
} from "@/features/external-money";

type ExternalMoneyPageProps = {
  searchParams: Promise<{
    q?: string | string[];
    status?: string | string[];
  }>;
};

function firstValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function resolveArchiveFilter(status: string): ExternalMoneyArchiveFilter {
  return status === "archived" ? "archived" : "active";
}

export default async function ExternalMoneyPage({
  searchParams,
}: ExternalMoneyPageProps) {
  const params = await searchParams;
  const search = firstValue(params.q).trim();
  const archiveFilter = resolveArchiveFilter(firstValue(params.status));

  const [pageData, items] = await Promise.all([
    getExternalMoneyPageData(),
    listExternalMoney({
      search,
      archiveFilter,
    }),
  ]);

  return (
    <ExternalMoneyView
      items={items}
      search={search}
      archiveFilter={archiveFilter}
      currencies={pageData.currencies}
      cashWallets={pageData.cashWallets}
      defaultCashWalletId={pageData.defaultCashWalletId}
    />
  );
}
