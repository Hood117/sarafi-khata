import { redirect } from "next/navigation";

type AuditRedirectPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AuditRedirectPage({
  searchParams,
}: AuditRedirectPageProps) {
  const params = await searchParams;
  const query = new URLSearchParams();
  query.set("tab", "audit");
  for (const [key, value] of Object.entries(params)) {
    const raw = Array.isArray(value) ? value[0] : value;
    if (raw) query.set(key, raw);
  }
  redirect(`/settings?${query.toString()}`);
}
