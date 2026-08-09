import {
  ExchangeView,
  getExchangeHistoryPage,
} from "@/features/exchange";
import { buildListHref } from "@/lib/list-href";
import {
  firstSearchParam,
  parsePageSearchParam,
} from "@/lib/search-params";

type ExchangePageProps = {
  searchParams: Promise<{
    q?: string | string[];
    page?: string | string[];
  }>;
};

export default async function ExchangePage({
  searchParams,
}: ExchangePageProps) {
  const params = await searchParams;
  const search = firstSearchParam(params.q).trim();
  const page = parsePageSearchParam(params.page);

  const listResult = await getExchangeHistoryPage({
    search,
    page,
    pageSize: 25,
  });

  const listParams = { q: search || undefined };
  const previousHref = buildListHref(
    "/exchange",
    listParams,
    listResult.page - 1,
  );
  const nextHref = buildListHref(
    "/exchange",
    listParams,
    listResult.page + 1,
  );
  const returnTo = buildListHref("/exchange", listParams, listResult.page);

  return (
    <ExchangeView
      exchanges={listResult.items}
      search={search}
      total={listResult.total}
      page={listResult.page}
      pageSize={listResult.pageSize}
      previousHref={previousHref}
      nextHref={nextHref}
      returnTo={returnTo}
    />
  );
}
