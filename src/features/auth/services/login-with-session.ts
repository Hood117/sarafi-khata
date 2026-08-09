import "server-only";

import type { AuthenticatedUser } from "@/features/auth/domain/types";
import {
  authenticateUser,
  type AuthenticateUserInput,
} from "@/features/auth/services/authenticate-user";
import { createSession } from "@/features/auth/services/session";

export async function loginWithSession(
  input: AuthenticateUserInput,
): Promise<AuthenticatedUser> {
  const user = await authenticateUser(input);
  await createSession(user.id);
  return user;
}
