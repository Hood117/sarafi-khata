import { requirePermission } from "@/features/auth/permissions/authorize";

export default async function SettingsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await requirePermission("settings.manage");
  return children;
}
