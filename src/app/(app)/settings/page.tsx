import { forbidden } from "next/navigation";

import { requireAuth } from "@/features/auth";
import { getAuditLogList } from "@/features/audit";
import {
  parseAuditFiltersFromSearchParams,
  parseAuditPageFromSearchParams,
} from "@/features/audit/domain/audit-filters";
import { SettingsHubView } from "@/features/settings/components/settings-hub-view";
import {
  canAccessSettingsHub,
  getSettingsTabAccess,
  resolveSettingsTab,
} from "@/features/settings/domain/settings-tabs";
import { getSettingsPageData } from "@/features/settings/services/get-settings-page-data";
import { getUserList } from "@/features/users";

type SettingsPageProps = {
  searchParams: Promise<{
    tab?: string | string[];
    q?: string | string[];
    from?: string | string[];
    to?: string | string[];
    user?: string | string[];
    module?: string | string[];
    action?: string | string[];
    page?: string | string[];
  }>;
};

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const user = await requireAuth();
  if (!canAccessSettingsHub(user)) {
    forbidden();
  }

  const params = await searchParams;
  const access = getSettingsTabAccess(user);
  const tab = resolveSettingsTab(params.tab, access);

  const generalData =
    access.general && tab === "general" ? await getSettingsPageData() : null;
  const users = access.users && tab === "users" ? await getUserList() : null;

  let audit = null;
  if (access.audit && tab === "audit") {
    const filters = parseAuditFiltersFromSearchParams(params);
    audit = await getAuditLogList({
      search: filters.search,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      userId: filters.userId,
      module: filters.module,
      action: filters.action,
      page: parseAuditPageFromSearchParams(params),
    });
  }

  return (
    <SettingsHubView
      tab={tab}
      access={access}
      username={user.username}
      settings={generalData?.settings ?? null}
      currencies={generalData?.currencies ?? []}
      users={users}
      currentUserId={access.users ? user.id : null}
      audit={audit}
    />
  );
}
