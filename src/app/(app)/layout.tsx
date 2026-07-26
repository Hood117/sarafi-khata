import { AppShell } from "@/components/layout";
import { requireAuth } from "@/features/auth/services/require-auth";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireAuth();

  return <AppShell user={user}>{children}</AppShell>;
}
