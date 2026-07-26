import { Users } from "lucide-react";

import { Typography } from "@/design-system/typography";

type CustomersEmptyStateProps = {
  hasFilters?: boolean;
  viewingArchived?: boolean;
};

export function CustomersEmptyState({
  hasFilters = false,
  viewingArchived = false,
}: CustomersEmptyStateProps) {
  const title = hasFilters
    ? "No matching customers"
    : viewingArchived
      ? "No archived customers"
      : "No customers yet";

  const description = hasFilters
    ? "Try a different name, phone, or customer code."
    : viewingArchived
      ? "Archived customers will appear here."
      : "Customer records will appear here once they are added.";

  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
        <Users className="size-5" aria-hidden />
      </div>
      <div className="space-y-1">
        <Typography variant="h4">{title}</Typography>
        <Typography variant="muted" className="max-w-sm">
          {description}
        </Typography>
      </div>
    </div>
  );
}
