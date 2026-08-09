import { redirect } from "next/navigation";

type BackupRedirectPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BackupRedirectPage({
  searchParams,
}: BackupRedirectPageProps) {
  const params = await searchParams;
  const query = new URLSearchParams();
  query.set("tab", "backup");
  for (const [key, value] of Object.entries(params)) {
    const raw = Array.isArray(value) ? value[0] : value;
    if (raw) query.set(key, raw);
  }
  redirect(`/settings?${query.toString()}`);
}
