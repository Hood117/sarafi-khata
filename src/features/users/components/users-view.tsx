"use client";

import { useEffect, useState } from "react";

import { UsersPageHeader } from "@/features/users/components/users-page-header";
import { UsersTable } from "@/features/users/components/users-table";
import type { UserListItem } from "@/features/users/domain/types";

type UsersViewProps = {
  users: UserListItem[];
  currentUserId: string;
  embedded?: boolean;
};

export function UsersView({
  users,
  currentUserId,
  embedded = false,
}: UsersViewProps) {
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!successMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setSuccessMessage(null);
    }, 4000);

    return () => window.clearTimeout(timeoutId);
  }, [successMessage]);

  return (
    <div className="space-y-4">
      <UsersPageHeader
        onSuccess={setSuccessMessage}
        successMessage={successMessage}
        hideTitle={embedded}
      />
      <UsersTable
        users={users}
        currentUserId={currentUserId}
        onUserChanged={setSuccessMessage}
      />
    </div>
  );
}
