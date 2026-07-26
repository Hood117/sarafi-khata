import { notFound } from "next/navigation";

import {
  ExchangeDetailView,
  getExchangeDetail,
} from "@/features/exchange";
import { isTransactionError } from "@/features/transactions";
import {
  backLabelForReturnTo,
  resolveSafeReturnTo,
} from "@/lib/navigation";

type ExchangeDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    returnTo?: string | string[];
  }>;
};

function firstValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

export default async function ExchangeDetailPage({
  params,
  searchParams,
}: ExchangeDetailPageProps) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const backHref = resolveSafeReturnTo(
    firstValue(resolvedSearchParams.returnTo),
    "/exchange",
  );
  const backLabel = backLabelForReturnTo(backHref);

  let exchange;

  try {
    exchange = await getExchangeDetail(id);
  } catch (error) {
    if (isTransactionError(error) && error.code === "NOT_FOUND") {
      notFound();
    }

    throw error;
  }

  return (
    <ExchangeDetailView
      exchange={exchange}
      backHref={backHref}
      backLabel={backLabel}
    />
  );
}
