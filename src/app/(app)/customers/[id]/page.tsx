import { notFound } from "next/navigation";

import { getCurrencyList } from "@/features/currencies";
import {
  CustomerProfileView,
  getCustomerProfile,
  isCustomerError,
} from "@/features/customers";
import {
  getCustomerHistory,
  type CustomerHistorySort,
  type GetCustomerHistoryOptions,
} from "@/features/transactions";
import { getCustomerCurrencyBalances } from "@/features/wallets";

type CustomerProfilePageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    tab?: string | string[];
    from?: string | string[];
    to?: string | string[];
    type?: string | string[];
    currency?: string | string[];
    ref?: string | string[];
    sort?: string | string[];
    page?: string | string[];
  }>;
};

function firstValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function resolveProfileTab(
  tab: string,
): "information" | "balances" | "history" | undefined {
  if (tab === "balances" || tab === "history" || tab === "information") {
    return tab;
  }
  return undefined;
}

function resolveHistorySort(sort: string): CustomerHistorySort {
  return sort === "oldest" ? "oldest" : "newest";
}

function resolveHistoryPage(page: string): number | undefined {
  if (!page) {
    return undefined;
  }

  const parsed = Number.parseInt(page, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return undefined;
  }

  return parsed;
}

function resolveHistoryOptions(
  searchParams: Awaited<CustomerProfilePageProps["searchParams"]>,
): GetCustomerHistoryOptions {
  const dateFrom = firstValue(searchParams.from).trim();
  const dateTo = firstValue(searchParams.to).trim();
  const type = firstValue(searchParams.type).trim();
  const currencyCode = firstValue(searchParams.currency).trim();
  const reference = firstValue(searchParams.ref).trim();
  const sort = resolveHistorySort(firstValue(searchParams.sort).trim());
  const page = resolveHistoryPage(firstValue(searchParams.page).trim());

  return {
    sort,
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
    ...(type ? { type } : {}),
    ...(currencyCode ? { currencyCode } : {}),
    ...(reference ? { reference } : {}),
    ...(page ? { page } : {}),
  };
}

export default async function CustomerProfilePage({
  params,
  searchParams,
}: CustomerProfilePageProps) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const historyOptions = resolveHistoryOptions(resolvedSearchParams);

  let customer;

  try {
    customer = await getCustomerProfile(id);
  } catch (error) {
    if (isCustomerError(error) && error.code === "NOT_FOUND") {
      notFound();
    }

    throw error;
  }

  const [balances, history, currencies] = await Promise.all([
    getCustomerCurrencyBalances(customer.id, {
      includeArchived: customer.isArchived,
    }),
    getCustomerHistory(customer.id, historyOptions),
    getCurrencyList({ isActive: true }),
  ]);

  const initialTab = resolveProfileTab(
    firstValue(resolvedSearchParams.tab).trim(),
  );

  return (
    <CustomerProfileView
      customer={customer}
      balances={balances}
      history={history}
      currencyOptions={currencies.map((currency) => ({
        code: currency.code,
        name: currency.name,
      }))}
      initialTab={initialTab}
    />
  );
}
