"use client";

import {
  HardDrive,
  LogOut,
  ScrollText,
  Settings2,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Typography } from "@/design-system/typography";
import { logoutAction } from "@/features/auth/actions/session-actions";
import { AuditView } from "@/features/audit/components/audit-view";
import type { AuditLogListResult } from "@/features/audit/domain/types";
import { BackupRestoreView } from "@/features/backup/components/backup-restore-view";
import { AppSettingsForm } from "@/features/settings/components/app-settings-form";
import { SettingsModules } from "@/features/settings/components/settings-modules";
import type {
  AppSettings,
  SettingsCurrencyOption,
} from "@/features/settings/domain/types";
import {
  buildSettingsTabHref,
  type SettingsTabAccess,
  type SettingsTabId,
} from "@/features/settings/domain/settings-tabs";
import { UsersView } from "@/features/users/components/users-view";
import type { UserListItem } from "@/features/users/domain/types";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type SettingsHubViewProps = {
  tab: SettingsTabId;
  access: SettingsTabAccess;
  username: string;
  settings: AppSettings | null;
  currencies: SettingsCurrencyOption[];
  users: UserListItem[] | null;
  currentUserId: string | null;
  audit: AuditLogListResult | null;
};

export function SettingsHubView({
  tab,
  access,
  username,
  settings,
  currencies,
  users,
  currentUserId,
  audit,
}: SettingsHubViewProps) {
  const t = useT();
  const router = useRouter();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoggingOut, startLogout] = useTransition();

  const tabMeta: Record<
    SettingsTabId,
    { label: string; description: string; icon: LucideIcon }
  > = {
    general: {
      label: t.settings.general,
      description: t.settings.shopPreferences,
      icon: Settings2,
    },
    users: {
      label: t.settings.users,
      description: t.settings.users,
      icon: Users,
    },
    audit: {
      label: t.settings.auditLogs,
      description: t.settings.auditLogs,
      icon: ScrollText,
    },
    backup: {
      label: t.settings.backup,
      description: t.settings.backup,
      icon: HardDrive,
    },
  };

  const activeMeta = tabMeta[tab];
  const ActiveIcon = activeMeta.icon;

  function handleTabChange(next: string | number | null) {
    if (typeof next !== "string") return;
    if (
      next !== "general" &&
      next !== "users" &&
      next !== "audit" &&
      next !== "backup"
    ) {
      return;
    }
    if (!access[next]) return;
    router.push(buildSettingsTabHref(next));
  }

  function handleLogout() {
    startLogout(async () => {
      try {
        const result = await logoutAction();
        if (result.ok) {
          router.replace("/login");
          router.refresh();
        }
      } catch {
        // Keep settings usable if logout fails.
      }
    });
  }

  const availableTabs = (
    [
      access.general ? "general" : null,
      access.users ? "users" : null,
      access.audit ? "audit" : null,
      access.backup ? "backup" : null,
    ] as const
  ).filter((value): value is SettingsTabId => value !== null);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="space-y-1">
        <Typography variant="h3" as="h2">
          Settings
        </Typography>
        <Typography variant="muted">
          Shop preferences, users, audit history, backups, and sign out.
        </Typography>
      </div>

      <Tabs
        key={tab}
        value={tab}
        onValueChange={handleTabChange}
        className="w-full gap-5"
      >
        <div className="bg-card space-y-3 rounded-2xl p-3 shadow-sm ring-1 ring-foreground/10 sm:p-4">
          <Typography variant="overline" as="p">
            Sections
          </Typography>
          <TabsList
            className={cn(
              "bg-muted/70 flex h-auto w-full flex-wrap justify-start gap-2 rounded-xl p-2",
            )}
          >
            {availableTabs.map((tabId) => {
              const meta = tabMeta[tabId];
              const Icon = meta.icon;
              return (
                <TabsTrigger
                  key={tabId}
                  value={tabId}
                  className={cn(
                    "h-auto min-h-11 flex-none justify-start gap-2 rounded-xl px-3.5 py-2.5 text-left text-sm font-semibold",
                    "data-active:bg-primary data-active:text-primary-foreground data-active:shadow-md",
                    "hover:bg-background/80 hover:text-foreground",
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  <span>{meta.label}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        <div
          key={tab}
          className="animate-in fade-in slide-in-from-bottom-1 space-y-3 duration-200"
        >
          <div className="bg-primary/5 flex items-start gap-3 rounded-2xl px-4 py-3 ring-1 ring-primary/15">
            <span className="bg-primary/15 text-primary mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-xl">
              <ActiveIcon className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 space-y-1">
              <Typography variant="h4" as="h3" className="font-semibold">
                {activeMeta.label}
              </Typography>
              <Typography variant="muted">{activeMeta.description}</Typography>
            </div>
          </div>

          {access.general && settings ? (
            <TabsContent value="general" className="outline-none">
              <div className="mx-auto max-w-2xl space-y-2">
                {successMessage ? (
                  <div
                    className="bg-success/10 text-success rounded-lg px-3 py-2 text-sm"
                    role="status"
                  >
                    {successMessage}
                  </div>
                ) : null}
                <AppSettingsForm
                  initialSettings={settings}
                  currencies={currencies}
                  onSuccess={setSuccessMessage}
                />
                <SettingsModules />
              </div>
            </TabsContent>
          ) : null}

          {access.users && users && currentUserId ? (
            <TabsContent value="users" className="outline-none">
              <UsersView
                users={users}
                currentUserId={currentUserId}
                embedded
              />
            </TabsContent>
          ) : null}

          {access.audit && audit ? (
            <TabsContent value="audit" className="outline-none">
              <AuditView result={audit} embedded />
            </TabsContent>
          ) : null}

          {access.backup ? (
            <TabsContent value="backup" className="outline-none">
              <BackupRestoreView embedded />
            </TabsContent>
          ) : null}
        </div>
      </Tabs>

      <div className="bg-card ring-foreground/10 space-y-3 rounded-xl p-4 shadow-sm ring-1">
        <div className="space-y-1">
          <Typography variant="h4" className="font-semibold">
            Session
          </Typography>
          <Typography variant="muted">
            Signed in as {username}. Sign out ends this session on this device.
          </Typography>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={handleLogout}
          disabled={isLoggingOut}
        >
          <LogOut data-icon="inline-start" />
          {isLoggingOut ? "Signing out..." : "Sign out"}
        </Button>
      </div>
    </div>
  );
}
