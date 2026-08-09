import { notFound } from "next/navigation";

import {
  getHawalaDetail,
  getHawalaFormOptions,
  HawalaDetailView,
  isHawalaError,
} from "@/features/hawala";
import {
  backLabelForReturnTo,
  resolveSafeReturnTo,
} from "@/lib/navigation";

type HawalaDetailPageProps = {
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

export default async function HawalaDetailPage({
  params,
  searchParams,
}: HawalaDetailPageProps) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const backHref = resolveSafeReturnTo(
    firstValue(resolvedSearchParams.returnTo),
    "/hawala",
  );
  const backLabel = backLabelForReturnTo(backHref);

  let hawala;

  try {
    hawala = await getHawalaDetail(id);
  } catch (error) {
    if (isHawalaError(error) && error.code === "NOT_FOUND") {
      notFound();
    }

    throw error;
  }

  const formOptions = await getHawalaFormOptions();

  return (
    <HawalaDetailView
      hawala={hawala}
      customers={formOptions.customers}
      partners={formOptions.partners}
      currencies={formOptions.currencies}
      backHref={backHref}
      backLabel={backLabel}
    />
  );
}
