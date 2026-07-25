import { AppShell } from "@/components/layout";
import { requireAuth } from "@/features/auth/services/require-auth";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await requireAuth();

  return <AppShell>{children}</AppShell>;
}
