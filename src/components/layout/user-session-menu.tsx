"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { logoutAction } from "@/features/auth/actions/session-actions";
import type { AuthenticatedUser } from "@/features/auth/domain/types";
import { useT } from "@/lib/i18n";

function formatRole(role: AuthenticatedUser["role"]) {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

type UserSessionMenuProps = {
  user: AuthenticatedUser;
};

export function UserSessionMenu({ user }: UserSessionMenuProps) {
  const t = useT();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  async function handleLogout() {
    setIsLoggingOut(true);
    setLogoutError(null);

    try {
      const result = await logoutAction();

      if (!result.ok) {
        setLogoutError(result.message);
        setIsLoggingOut(false);
        return;
      }

      router.replace("/login");
      router.refresh();
    } catch {
      setLogoutError(t.common.error);
      setIsLoggingOut(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-3">
        <div className="hidden text-end sm:block">
          <p className="text-foreground text-sm font-medium leading-none">
            {user.username}
          </p>
          <p className="text-muted-foreground mt-1 text-xs leading-none">
            {formatRole(user.role)}
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-11 rounded-full px-4"
          disabled={isLoggingOut}
          onClick={handleLogout}
        >
          <LogOut />
          {isLoggingOut ? t.session.signingOut : t.session.signOut}
        </Button>
      </div>

      {logoutError ? (
        <p className="text-destructive max-w-56 text-end text-xs" role="alert">
          {logoutError}
        </p>
      ) : null}
    </div>
  );
}
