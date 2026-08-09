import {
  hasPermission,
  hasScreenAccess,
} from "@/features/auth/permissions/catalog";
import type { AuthenticatedUser } from "@/features/auth/domain/types";

export const SETTINGS_TABS = [
  "general",
  "users",
  "audit",
  "backup",
] as const;

export type SettingsTabId = (typeof SETTINGS_TABS)[number];

export type SettingsTabAccess = {
  general: boolean;
  users: boolean;
  audit: boolean;
  backup: boolean;
};

export function getSettingsTabAccess(
  user: Pick<AuthenticatedUser, "role" | "allowedScreens">,
): SettingsTabAccess {
  return {
    general: hasPermission(user, "settings.manage"),
    users: hasPermission(user, "users.manage"),
    audit: hasPermission(user, "audit.view"),
    backup: hasPermission(user, "backup.manage"),
  };
}

export function canAccessSettingsHub(
  user: Pick<AuthenticatedUser, "role" | "allowedScreens">,
): boolean {
  const access = getSettingsTabAccess(user);
  return access.general || access.users || access.audit || access.backup;
}

export function resolveSettingsTab(
  raw: string | string[] | undefined,
  access: SettingsTabAccess,
): SettingsTabId {
  const value = Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? "");
  const requested = value.trim().toLowerCase();

  if (
    requested === "users" ||
    requested === "audit" ||
    requested === "backup" ||
    requested === "general"
  ) {
    if (access[requested as SettingsTabId]) {
      return requested as SettingsTabId;
    }
  }

  if (access.general) return "general";
  if (access.users) return "users";
  if (access.audit) return "audit";
  if (access.backup) return "backup";
  return "general";
}

/** Prefer settings hub for users who only have nested admin screens. */
export function canSeeSettingsNavItem(
  user: Pick<AuthenticatedUser, "role" | "allowedScreens">,
): boolean {
  return (
    canAccessSettingsHub(user) ||
    hasScreenAccess(user, "settings") ||
    hasScreenAccess(user, "users") ||
    hasScreenAccess(user, "audit") ||
    hasScreenAccess(user, "backup")
  );
}

export function buildSettingsTabHref(
  tab: SettingsTabId,
  extraParams?: URLSearchParams | Record<string, string>,
): string {
  const params = new URLSearchParams();
  params.set("tab", tab);

  if (extraParams instanceof URLSearchParams) {
    for (const [key, value] of extraParams.entries()) {
      if (key === "tab") continue;
      params.set(key, value);
    }
  } else if (extraParams) {
    for (const [key, value] of Object.entries(extraParams)) {
      if (key === "tab") continue;
      params.set(key, value);
    }
  }

  return `/settings?${params.toString()}`;
}
