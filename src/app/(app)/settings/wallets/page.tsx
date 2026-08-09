import { redirect } from "next/navigation";

import { requirePermission } from "@/features/auth/permissions/authorize";

/** Wallets moved to the sidebar (`/wallets`). */
export default async function SettingsWalletsPage() {
  await requirePermission("wallets.manage");
  redirect("/wallets");
}
