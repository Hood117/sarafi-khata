"use client";

import { AddCustomerDialog } from "@/features/customers/components/add-customer-dialog";

type CustomersPageHeaderProps = {
  onSuccess?: (message: string) => void;
  successMessage?: string | null;
};

export function CustomersPageHeader({
  onSuccess,
  successMessage,
}: CustomersPageHeaderProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <AddCustomerDialog onSuccess={onSuccess} />
      </div>

      {successMessage ? (
        <div
          className="bg-success/10 text-success rounded-lg px-3 py-2 text-sm"
          role="status"
        >
          {successMessage}
        </div>
      ) : null}
    </div>
  );
}
