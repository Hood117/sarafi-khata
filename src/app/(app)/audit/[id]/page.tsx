import { notFound } from "next/navigation";

import {
  AuditDetailView,
  getAuditLogDetail,
  isAuditError,
} from "@/features/audit";
import {
  backLabelForReturnTo,
  resolveSafeReturnTo,
} from "@/lib/navigation";

type AuditDetailPageProps = {
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

export default async function AuditDetailPage({
  params,
  searchParams,
}: AuditDetailPageProps) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const backHref = resolveSafeReturnTo(
    firstValue(resolvedSearchParams.returnTo),
    "/audit",
  );
  const backLabel = backLabelForReturnTo(backHref);

  let event;

  try {
    event = await getAuditLogDetail(id);
  } catch (error) {
    if (isAuditError(error) && error.code === "NOT_FOUND") {
      notFound();
    }

    throw error;
  }

  return (
    <AuditDetailView event={event} backHref={backHref} backLabel={backLabel} />
  );
}
