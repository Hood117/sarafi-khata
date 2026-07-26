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
      : "Add a customer to start managing wallets, deposits, and hawala transfers.";

  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center sm:py-20">
      <div className="bg-primary/10 text-primary flex size-14 items-center justify-center rounded-full">
        <Users className="size-6" aria-hidden />
      </div>
      <div className="space-y-1.5">
        <Typography variant="h4" className="font-bold">
          {title}
        </Typography>
        <Typography variant="muted" className="max-w-md">
          {description}
        </Typography>
      </div>
    </div>
  );
}
