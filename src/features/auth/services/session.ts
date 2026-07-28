import "server-only";

import { createHash, randomBytes } from "node:crypto";

import type { AuthenticatedUser } from "@/features/auth/domain/types";
import { SESSION_TTL_MS } from "@/features/auth/services/session-config";
import {
  clearSessionCookie,
  getSessionTokenFromCookie,
  setSessionCookie,
} from "@/features/auth/services/session-cookie";
import { prisma } from "@/server/db";

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function toAuthenticatedUser(user: {
  id: string;
  fullName: string;
  username: string;
  role: AuthenticatedUser["role"];
  isActive: boolean;
}): AuthenticatedUser {
  return {
    id: user.id,
    fullName: user.fullName,
    username: user.username,
    role: user.role,
    isActive: user.isActive,
  };
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.$transaction(async (tx) => {
    await tx.session.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    await tx.session.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });
  });

  await setSessionCookie(token);
}

export async function destroySession(): Promise<void> {
  const token = await getSessionTokenFromCookie();

  try {
    if (token) {
      const tokenHash = hashSessionToken(token);

      await prisma.session.updateMany({
        where: {
          tokenHash,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    }
  } catch (error) {
    // Cookie clear below still signs the browser out; DB revoke is best-effort.
    console.error("Failed to revoke session in database", error);
  } finally {
    await clearSessionCookie();
  }
}

/** Revoke every active session for a user (deactivate / password reset). */
export async function revokeUserSessions(userId: string): Promise<void> {
  await prisma.session.updateMany({
    where: {
      userId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
}

/**
 * Resolve the current user from the session cookie.
 * Read-only for cookies: clearing cookies here breaks Next.js RSC layouts.
 */
export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const token = await getSessionTokenFromCookie();

  if (!token) {
    return null;
  }

  const tokenHash = hashSessionToken(token);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: {
      user: true,
    },
  });

  if (!session) {
    return null;
  }

  const isExpired = session.expiresAt.getTime() <= Date.now();
  const isRevoked = session.revokedAt != null;

  if (isRevoked) {
    return null;
  }

  if (isExpired || !session.user.isActive) {
    await prisma.session.updateMany({
      where: {
        id: session.id,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
    return null;
  }

  return toAuthenticatedUser(session.user);
}
