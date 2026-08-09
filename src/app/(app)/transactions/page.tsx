import {
  getTransactionListPage,
  TransactionsView,
} from "@/features/transactions";
import { buildListHref } from "@/lib/list-href";
import { parsePageSearchParam } from "@/lib/search-params";

type TransactionsPageProps = {
  searchParams: Promise<{
    page?: string | string[];
  }>;
};

export default async function TransactionsPage({
  searchParams,
}: TransactionsPageProps) {
  const params = await searchParams;
  const page = parsePageSearchParam(params.page);

  const listResult = await getTransactionListPage({ page, pageSize: 25 });

  const previousHref = buildListHref(
    "/transactions",
    {},
    listResult.page - 1,
  );
  const nextHref = buildListHref("/transactions", {}, listResult.page + 1);
  const returnTo = buildListHref("/transactions", {}, listResult.page);

  return (
    <TransactionsView
      transactions={listResult.items}
      total={listResult.total}
      page={listResult.page}
      pageSize={listResult.pageSize}
      previousHref={previousHref}
      nextHref={nextHref}
      returnTo={returnTo}
    />
  );
}
