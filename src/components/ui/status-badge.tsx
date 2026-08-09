import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type StatusTone = "success" | "warning" | "danger" | "muted";

const TONE_DOT: Record<StatusTone, string> = {
  success: "bg-green-600",
  warning: "bg-amber-500",
  danger: "bg-red-600",
  muted: "bg-gray-500",
};

const TONE_VARIANT: Record<
  StatusTone,
  "success" | "warning" | "danger" | "muted"
> = {
  success: "success",
  warning: "warning",
  danger: "danger",
  muted: "muted",
};

type StatusBadgeProps = {
  label: string;
  tone: StatusTone;
  className?: string;
};

/**
 * Shared status pill with colored dot — presentation only.
 */
export function StatusBadge({ label, tone, className }: StatusBadgeProps) {
  return (
    <Badge variant={TONE_VARIANT[tone]} className={cn("gap-1.5", className)}>
      <span
        aria-hidden
        className={cn("size-1.5 shrink-0 rounded-full", TONE_DOT[tone])}
      />
      {label}
    </Badge>
  );
}

/** Map common domain statuses to a visual tone. */
export function toneForRecordStatus(
  status:
    | "COMPLETED"
    | "PENDING"
    | "CANCELLED"
    | "POSTED"
    | "DRAFT"
    | "VOIDED"
    | "ACTIVE"
    | "INACTIVE"
    | "ARCHIVED",
): StatusTone {
  switch (status) {
    case "COMPLETED":
    case "POSTED":
    case "ACTIVE":
      return "success";
    case "PENDING":
      return "warning";
    case "CANCELLED":
    case "VOIDED":
    case "ARCHIVED":
      return "danger";
    case "DRAFT":
    case "INACTIVE":
    default:
      return "muted";
  }
}
