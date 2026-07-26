import {
  CustomersView,
  getCustomerList,
  type CustomerArchiveFilter,
} from "@/features/customers";

type CustomersPageProps = {
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

function resolveArchiveFilter(status: string): CustomerArchiveFilter {
  return status === "archived" ? "archived" : "active";
}

export default async function CustomersPage({
  searchParams,
}: CustomersPageProps) {
  const params = await searchParams;
  const search = firstValue(params.q).trim();
  const archiveFilter = resolveArchiveFilter(firstValue(params.status));

  const customers = await getCustomerList({
    search,
    archiveFilter,
  });

  return (
    <CustomersView
      customers={customers}
      search={search}
      archiveFilter={archiveFilter}
    />
  );
}
