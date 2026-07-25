import { requireGuest } from "@/features/auth/services/require-auth";

export default async function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await requireGuest();

  return children;
}
