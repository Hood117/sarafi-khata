import { notFound } from "next/navigation";

import {
  getTransactionDetail,
  isTransactionError,
  TransactionDetailView,
} from "@/features/transactions";
import {
  backLabelForReturnTo,
  resolveSafeReturnTo,
} from "@/lib/navigation";

type TransactionDetailPageProps = {
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

export default async function TransactionDetailPage({
  params,
  searchParams,
}: TransactionDetailPageProps) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const backHref = resolveSafeReturnTo(
    firstValue(resolvedSearchParams.returnTo),
    "/transactions",
  );
  const backLabel = backLabelForReturnTo(backHref);

  let transaction;

  try {
    transaction = await getTransactionDetail(id);
  } catch (error) {
    if (isTransactionError(error) && error.code === "NOT_FOUND") {
      notFound();
    }

    throw error;
  }

  return (
    <TransactionDetailView
      transaction={transaction}
      backHref={backHref}
      backLabel={backLabel}
    />
  );
}
