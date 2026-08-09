"use client";

import {
  StatusBadge,
  toneForRecordStatus,
} from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EditUserDialog } from "@/features/users/components/edit-user-dialog";
import { ResetPasswordDialog } from "@/features/users/components/reset-password-dialog";
import { SetUserActiveButton } from "@/features/users/components/set-user-active-button";
import { UsersEmptyState } from "@/features/users/components/users-empty-state";
import { formatRole } from "@/features/users/domain/format-role";
import type { UserListItem } from "@/features/users/domain/types";
import { useT } from "@/lib/i18n";

type UsersTableProps = {
  users: UserListItem[];
  currentUserId: string;
  onUserChanged?: (message: string) => void;
};

export function UsersTable({
  users,
  currentUserId,
  onUserChanged,
}: UsersTableProps) {
  const t = useT();
  const total = users.length;

  return (
    <div className="space-y-4">
      <div className="bg-card overflow-hidden rounded-xl shadow-sm ring-1 ring-foreground/10">
        {total === 0 ? (
          <UsersEmptyState />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t.common.name}</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>{t.common.status}</TableHead>
                <TableHead className="w-[280px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => {
                const isCurrentUser = user.id === currentUserId;

                return (
                  <TableRow key={user.id} className="hover:bg-transparent">
                    <TableCell className="font-semibold">
                      {user.fullName}
                      {isCurrentUser ? (
                        <span className="text-muted-foreground ml-2 text-xs font-normal">
                          (you)
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>{user.username}</TableCell>
                    <TableCell>{formatRole(user.role)}</TableCell>
                    <TableCell>
                      <StatusBadge
                        label={user.isActive ? "Active" : "Inactive"}
                        tone={toneForRecordStatus(
                          user.isActive ? "ACTIVE" : "INACTIVE",
                        )}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        <EditUserDialog
                          userId={user.id}
                          isCurrentUser={isCurrentUser}
                          onSuccess={onUserChanged}
                        />
                        <ResetPasswordDialog
                          userId={user.id}
                          username={user.username}
                          onSuccess={onUserChanged}
                        />
                        <SetUserActiveButton
                          userId={user.id}
                          fullName={user.fullName}
                          isActive={user.isActive}
                          disabled={isCurrentUser}
                          onSuccess={onUserChanged}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
