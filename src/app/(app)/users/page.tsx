import { requirePermission } from "@/features/auth/permissions/authorize";
import { getUserList, UsersView } from "@/features/users";

export default async function UsersPage() {
  const actor = await requirePermission("users.manage");
  const users = await getUserList();

  return <UsersView users={users} currentUserId={actor.id} />;
}
