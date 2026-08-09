import { getHawalaList, HawalaView } from "@/features/hawala";
import {
  firstSearchParam,
  parsePageSearchParam,
} from "@/lib/search-params";

type HawalaPageProps = {
  searchParams: Promise<{
    q?: string | string[];
    status?: string | string[];
    page?: string | string[];
  }>;
};

export default async function HawalaPage({ searchParams }: HawalaPageProps) {
  const params = await searchParams;
  const search = firstSearchParam(params.q).trim();
  const archiveFilter =
    firstSearchParam(params.status).trim() === "archived"
      ? "archived"
      : "active";
  const page = parsePageSearchParam(params.page);

  const listResult = await getHawalaList({
    search,
    archiveFilter,
    page,
    pageSize: 25,
  });

  return (
    <HawalaView
      transfers={listResult.items}
      total={listResult.total}
      page={listResult.page}
      pageSize={listResult.pageSize}
      search={search}
      archiveFilter={archiveFilter}
    />
  );
}
