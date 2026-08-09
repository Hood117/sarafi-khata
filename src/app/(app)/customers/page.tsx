import {
  CustomersView,
  getCustomerListPage,
  type CustomerArchiveFilter,
} from "@/features/customers";
import { getCurrencyList } from "@/features/currencies";
import { buildListHref } from "@/lib/list-href";
import {
  firstSearchParam,
  parsePageSearchParam,
} from "@/lib/search-params";

type CustomersPageProps = {
  searchParams: Promise<{
    q?: string | string[];
    status?: string | string[];
    page?: string | string[];
  }>;
};

function resolveArchiveFilter(status: string): CustomerArchiveFilter {
  return status === "archived" ? "archived" : "active";
}

export default async function CustomersPage({
  searchParams,
}: CustomersPageProps) {
  const params = await searchParams;
  const search = firstSearchParam(params.q).trim();
  const archiveFilter = resolveArchiveFilter(firstSearchParam(params.status));
  const page = parsePageSearchParam(params.page);

  const [listResult, currencies] = await Promise.all([
    getCustomerListPage({
      search,
      archiveFilter,
      page,
      pageSize: 25,
    }),
    getCurrencyList({ isActive: true }),
  ]);

  const listParams = {
    q: search || undefined,
    status: archiveFilter === "archived" ? "archived" : undefined,
  };
  const previousHref = buildListHref(
    "/customers",
    listParams,
    listResult.page - 1,
  );
  const nextHref = buildListHref(
    "/customers",
    listParams,
    listResult.page + 1,
  );

  return (
    <CustomersView
      customers={listResult.items}
      search={search}
      archiveFilter={archiveFilter}
      total={listResult.total}
      page={listResult.page}
      pageSize={listResult.pageSize}
      previousHref={previousHref}
      nextHref={nextHref}
      currencyOptions={currencies.map((currency) => ({
        code: currency.code,
        name: currency.name,
      }))}
    />
  );
}
