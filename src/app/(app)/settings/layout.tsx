import { requireAuth } from "@/features/auth";
import { canAccessSettingsHub } from "@/features/settings/domain/settings-tabs";
import { forbidden } from "next/navigation";

export default async function SettingsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireAuth();
  if (!canAccessSettingsHub(user)) {
    forbidden();
  }
  return children;
}
