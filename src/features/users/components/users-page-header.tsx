"use client";

import { AddUserDialog } from "@/features/users/components/add-user-dialog";

type UsersPageHeaderProps = {
  onSuccess?: (message: string) => void;
  successMessage?: string | null;
};

export function UsersPageHeader({
  onSuccess,
  successMessage,
}: UsersPageHeaderProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-foreground text-2xl font-semibold tracking-tight">
            Users
          </h2>
          <p className="text-muted-foreground text-sm">
            Manage local accounts, roles, and access.
          </p>
        </div>
        <AddUserDialog onSuccess={onSuccess} />
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
