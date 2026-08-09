import { redirect } from "next/navigation";

type UsersRedirectPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function UsersRedirectPage({
  searchParams,
}: UsersRedirectPageProps) {
  const params = await searchParams;
  const query = new URLSearchParams();
  query.set("tab", "users");
  for (const [key, value] of Object.entries(params)) {
    const raw = Array.isArray(value) ? value[0] : value;
    if (raw) query.set(key, raw);
  }
  redirect(`/settings?${query.toString()}`);
}
