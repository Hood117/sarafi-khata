import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Typography } from "@/design-system/typography";
import { AuditValuesPanel } from "@/features/audit/components/audit-values-panel";
import type { AuditLogDetail } from "@/features/audit/domain/types";

type AuditDetailViewProps = {
  event: AuditLogDetail;
  backHref?: string;
  backLabel?: string;
};

function formatTimestamp(isoDate: string): string {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(isoDate));
}

function displayValue(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "—";
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-muted-foreground text-sm font-medium">{label}</dt>
      <dd className="text-sm font-medium whitespace-pre-wrap">{value}</dd>
    </div>
  );
}

function formatEntityDisplay(event: AuditLogDetail): string {
  if (event.entityType && event.entityId) {
    return `${event.entityType} · ${event.entityId}`;
  }

  return displayValue(event.entityLabel ?? event.entityType ?? event.entityId);
}

export function AuditDetailView({
  event,
  backHref = "/settings?tab=audit",
  backLabel = "Back to audit",
}: AuditDetailViewProps) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <Button
            variant="ghost"
            size="sm"
            render={<Link href={backHref} />}
            className="text-muted-foreground -ml-2 w-fit"
          >
            <ArrowLeft data-icon="inline-start" />
            {backLabel}
          </Button>

          <div className="space-y-2">
            <Typography variant="h3" as="h2">
              {event.actionLabel}
            </Typography>
            <Typography variant="muted">{event.summary}</Typography>
          </div>
        </div>
      </div>

      <section className="bg-card ring-foreground/10 space-y-2 rounded-xl p-3 shadow-sm ring-1">
        <Typography variant="h4" className="font-bold">
          Event information
        </Typography>

        <dl className="space-y-4">
          <InfoRow label="User" value={displayValue(event.userName)} />
          <InfoRow label="Timestamp" value={formatTimestamp(event.createdAt)} />
          <InfoRow label="Module" value={event.moduleLabel} />
          <InfoRow label="Action" value={event.actionLabel} />
          <InfoRow label="Entity" value={formatEntityDisplay(event)} />
          <InfoRow label="IP address" value={displayValue(event.ipAddress)} />
        </dl>
      </section>

      <AuditValuesPanel title="Before values" values={event.beforeValues} />
      <AuditValuesPanel title="After values" values={event.afterValues} />
    </div>
  );
}
