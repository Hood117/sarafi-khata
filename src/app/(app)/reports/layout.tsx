import { requirePermission } from "@/features/auth/permissions/authorize";

export default async function ReportsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await requirePermission("reports.view");
  return children;
}
