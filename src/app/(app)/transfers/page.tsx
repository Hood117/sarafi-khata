import {
  TransferView,
  getTransferHistoryPage,
} from "@/features/transfers";
import { buildListHref } from "@/lib/list-href";
import {
  firstSearchParam,
  parsePageSearchParam,
} from "@/lib/search-params";

type TransfersPageProps = {
  searchParams: Promise<{
    q?: string | string[];
    page?: string | string[];
  }>;
};

export default async function TransfersPage({
  searchParams,
}: TransfersPageProps) {
  const params = await searchParams;
  const search = firstSearchParam(params.q).trim();
  const page = parsePageSearchParam(params.page);

  const listResult = await getTransferHistoryPage({
    search,
    page,
    pageSize: 25,
  });

  const listParams = { q: search || undefined };
  const previousHref = buildListHref(
    "/transfers",
    listParams,
    listResult.page - 1,
  );
  const nextHref = buildListHref(
    "/transfers",
    listParams,
    listResult.page + 1,
  );
  const returnTo = buildListHref("/transfers", listParams, listResult.page);

  return (
    <TransferView
      transfers={listResult.items}
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
