import { requirePermission } from "@/features/auth/permissions/authorize";

export default async function AuditLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await requirePermission("audit.view");
  return children;
}
