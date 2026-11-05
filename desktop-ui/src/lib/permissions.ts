/** Screen-rights helpers shared by layout, route guards, and quick actions. */

import type { AuthSession } from "@desktop/api";

export type ScreenAccess = "read" | "write";
export type ScreenRightsMap = Record<string, ScreenAccess>;

/** Parse session/DB JSON: legacy string[] (write) or { screen: "read"|"write" }. */
export function parseScreenRights(
  raw: string | null | undefined,
): ScreenRightsMap | null {
  if (raw == null || raw.trim() === "") return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      const out: ScreenRightsMap = {};
      for (const item of parsed) {
        if (typeof item === "string" && item.trim()) {
          out[item.trim()] = "write";
        }
      }
      return out;
    }
    if (parsed && typeof parsed === "object") {
      const out: ScreenRightsMap = {};
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        const id = key.trim();
        if (!id) continue;
        const access = String(value).trim().toLowerCase();
        if (access === "read" || access === "r") out[id] = "read";
        else if (
          access === "write" ||
          access === "w" ||
          access === "full" ||
          access === "rw"
        ) {
          out[id] = "write";
        }
      }
      return out;
    }
    return null;
  } catch {
    return null;
  }
}

/** @deprecated Prefer parseScreenRights — kept for callers expecting id lists. */
export function parseAllowedScreens(
  raw: string | null | undefined,
): string[] | null {
  const rights = parseScreenRights(raw);
  if (rights === null) return null;
  return Object.keys(rights);
}

export function pathToScreenId(path: string): string {
  if (path === "/" || path === "") return "dashboard";
  if (path.startsWith("/partners")) return "partners";
  if (path.startsWith("/capital")) return "capital";
  if (path.startsWith("/expenses")) return "expenses";
  if (path.startsWith("/employees")) return "employees";
  if (path.startsWith("/daybook")) return "daybook";
  if (path.startsWith("/cash")) return "cash";
  if (path.startsWith("/vaults")) return "vaults";
  if (path.startsWith("/trading")) return "trading";
  if (path.startsWith("/customers")) return "customers";
  if (path.startsWith("/debtors-creditors")) return "debtorsCreditors";
  if (path.startsWith("/hawala")) return "hawala";
  if (path.startsWith("/account-orders")) return "accountOrders";
  if (path.startsWith("/reports")) return "reports";
  if (path.startsWith("/transactions")) return "transactions";
  if (path.startsWith("/rates")) return "rates";
  if (path.startsWith("/calculator")) return "calculator";
  if (path.startsWith("/settings")) return "settings";
  if (path.startsWith("/support")) return "support";
  if (path.startsWith("/movements")) return "cash";
  return path.replace(/^\//, "").split("/")[0] || "dashboard";
}

export function isSystemAdminUsername(username: string | null | undefined): boolean {
  const u = username?.trim().toLowerCase() ?? "";
  return u === "saraf@@" || u === "admin";
}

export function isAdminRole(session: AuthSession | null | undefined): boolean {
  if (!session) return false;
  if (isSystemAdminUsername(session.username)) return true;
  return session.role?.toUpperCase() === "ADMIN";
}

/** Built-in system admin, or a legacy user with no rights list stored. */
function hasUnrestrictedScreens(session: AuthSession): boolean {
  if (isSystemAdminUsername(session.username)) return true;
  return parseScreenRights(session.allowedScreens) === null;
}

/** Whether the session may open a desk screen id (read or write). */
export function canAccessScreen(
  session: AuthSession | null | undefined,
  screenId: string,
): boolean {
  if (!session) return false;
  if (hasUnrestrictedScreens(session)) return true;
  const rights = parseScreenRights(session.allowedScreens);
  if (rights === null) return true;
  return Object.prototype.hasOwnProperty.call(rights, screenId);
}

/** Whether the session may create / edit / post on a screen. */
export function canWriteScreen(
  session: AuthSession | null | undefined,
  screenId: string,
): boolean {
  if (!session) return false;
  if (hasUnrestrictedScreens(session)) return true;
  const rights = parseScreenRights(session.allowedScreens);
  if (rights === null) return true;
  return rights[screenId] === "write";
}

export function canAccessPath(
  session: AuthSession | null | undefined,
  path: string,
): boolean {
  // Support / About is available to every signed-in desk user.
  if (path.startsWith("/support")) return Boolean(session);
  return canAccessScreen(session, pathToScreenId(path));
}

export function canWritePath(
  session: AuthSession | null | undefined,
  path: string,
): boolean {
  return canWriteScreen(session, pathToScreenId(path));
}

/** First allowed route for redirect after access denied. */
export function firstAllowedPath(session: AuthSession | null | undefined): string {
  const candidates = [
    "/",
    "/cash",
    "/vaults",
    "/customers",
    "/daybook",
    "/transactions",
    "/calculator",
    "/hawala",
    "/partners",
    "/trading",
    "/expenses",
    "/capital",
    "/debtors-creditors",
    "/reports",
    "/rates",
    "/employees",
    "/settings",
  ];
  for (const path of candidates) {
    if (canAccessPath(session, path)) return path;
  }
  return "/";
}
