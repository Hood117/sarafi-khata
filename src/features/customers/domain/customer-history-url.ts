import type {
  CustomerHistoryFilters,
  CustomerHistorySort,
} from "@/features/transactions/domain/types";

export type CustomerHistoryHrefInput = {
  dateFrom?: string | null;
  dateTo?: string | null;
  type?: string | null;
  currencyCode?: string | null;
  reference?: string | null;
  sort?: CustomerHistorySort;
  page?: number | null;
};

/**
 * Builds the customer profile URL including history filter/sort query params.
 */
export function buildCustomerHistoryHref(
  customerId: string,
  input: CustomerHistoryHrefInput = {},
): string {
  const params = new URLSearchParams();

  const dateFrom = input.dateFrom?.trim();
  const dateTo = input.dateTo?.trim();
  const type = input.type?.trim();
  const currencyCode = input.currencyCode?.trim();
  const reference = input.reference?.trim();

  if (dateFrom) {
    params.set("from", dateFrom);
  }

  if (dateTo) {
    params.set("to", dateTo);
  }

  if (type) {
    params.set("type", type);
  }

  if (currencyCode) {
    params.set("currency", currencyCode);
  }

  if (reference) {
    params.set("ref", reference);
  }

  if (input.sort === "oldest") {
    params.set("sort", "oldest");
  }

  if (
    typeof input.page === "number" &&
    Number.isFinite(input.page) &&
    input.page > 1
  ) {
    params.set("page", String(Math.floor(input.page)));
  }

  const query = params.toString();
  return query
    ? `/customers/${customerId}?${query}`
    : `/customers/${customerId}`;
}

export function buildCustomerHistoryHrefFromFilters(
  customerId: string,
  filters: CustomerHistoryFilters,
  sort: CustomerHistorySort,
  page: number = 1,
): string {
  return buildCustomerHistoryHref(customerId, {
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    type: filters.type,
    currencyCode: filters.currencyCode,
    reference: filters.reference,
    sort,
    page,
  });
}

/**
 * Link to the existing transaction detail page, with a return path that
 * preserves customer history filters when navigating back.
 */
export function buildTransactionDetailHrefFromHistory(
  transactionId: string,
  returnTo: string,
): string {
  const params = new URLSearchParams();
  params.set("returnTo", returnTo);
  return `/transactions/${transactionId}?${params.toString()}`;
}
