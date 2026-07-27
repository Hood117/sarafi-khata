import { redirect } from "next/navigation";

import { requirePermission } from "@/features/auth/permissions/authorize";

/** Wallet management lives under Settings → System. */
export default async function WalletsPage() {
  await requirePermission("settings.manage");
  redirect("/settings/wallets");
}
