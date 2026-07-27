import { notFound } from "next/navigation";

import {
  TransferDetailView,
  getTransferDetail,
} from "@/features/transfers";
import { isTransactionError } from "@/features/transactions";
import {
  backLabelForReturnTo,
  resolveSafeReturnTo,
} from "@/lib/navigation";

type TransferDetailPageProps = {
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

export default async function TransferDetailPage({
  params,
  searchParams,
}: TransferDetailPageProps) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const backHref = resolveSafeReturnTo(
    firstValue(resolvedSearchParams.returnTo),
    "/transfers",
  );
  const backLabel = backLabelForReturnTo(backHref);

  let transfer;

  try {
    transfer = await getTransferDetail(id);
  } catch (error) {
    if (isTransactionError(error) && error.code === "NOT_FOUND") {
      notFound();
    }

    throw error;
  }

  return (
    <TransferDetailView
      transfer={transfer}
      backHref={backHref}
      backLabel={backLabel}
    />
  );
}
