import "server-only";

import bcrypt from "bcrypt";

import { AuthError } from "@/features/auth/domain/errors";
import type { AuthenticatedUser } from "@/features/auth/domain/types";
import { parseAllowedScreens } from "@/features/auth/permissions/screens";
import { normalizeUsername } from "@/features/auth/services/username";
import { prisma } from "@/server/db";

export type AuthenticateUserInput = {
  username: string;
  password: string;
};

const MAX_PASSWORD_LENGTH = 128;

// Precomputed bcrypt hash used only to keep verify timing similar when no user exists.
const DUMMY_PASSWORD_HASH =
  "$2b$12$fKTMqgf.IFERW4XRmimaR.mhlJuIAAEvf9TrjEKIi9cuyvIbr./ym";

export async function authenticateUser(
  input: AuthenticateUserInput,
): Promise<AuthenticatedUser> {
  const username = normalizeUsername(input.username);
  const password = input.password;

  if (!username || !password) {
    throw new AuthError("INVALID_CREDENTIALS", "Invalid username or password.");
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new AuthError("INVALID_CREDENTIALS", "Invalid username or password.");
  }

  const user = await prisma.user.findUnique({
    where: { username },
  });

  let passwordMatches = false;

  try {
    passwordMatches = await bcrypt.compare(
      password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
  } catch {
    throw new AuthError("INVALID_CREDENTIALS", "Invalid username or password.");
  }

  if (!user || !passwordMatches) {
    throw new AuthError("INVALID_CREDENTIALS", "Invalid username or password.");
  }

  // Check activity only after credential verification to avoid account probing.
  if (!user.isActive) {
    throw new AuthError("INACTIVE_USER", "This user account is inactive.");
  }

  return {
    id: user.id,
    fullName: user.fullName,
    username: user.username,
    role: user.role,
    isActive: user.isActive,
    allowedScreens: parseAllowedScreens(user.allowedScreens),
  };
}
