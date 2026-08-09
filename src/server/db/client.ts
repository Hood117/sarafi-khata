import "server-only";

import path from "node:path";

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

import { applyPendingRestoreIfAny } from "@/features/backup/services/backup-engine";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  sqliteReady: Promise<void> | undefined;
};

/** Delegates that must exist; stale HMR clients after `prisma generate` lack new models. */
const REQUIRED_MODEL_DELEGATES = [
  "partnerSarafi",
  "partnerCommissionSettlement",
  "hawalaTransfer",
] as const;

function isStalePrismaClient(client: PrismaClient): boolean {
  for (const key of REQUIRED_MODEL_DELEGATES) {
    const delegate = Reflect.get(client, key);
    if (delegate == null || typeof delegate !== "object") {
      return true;
    }
  }
  return false;
}

/**
 * Resolve DATABASE_URL to an absolute `file:` URL so the native SQLite
 * binding always opens the same on-disk database (cwd-independent).
 */
function resolveSqliteUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed.startsWith("file:")) {
    return trimmed;
  }

  const withoutScheme = trimmed.slice("file:".length);
  if (path.isAbsolute(withoutScheme)) {
    return trimmed;
  }

  const absolutePath = path.resolve(
    /* turbopackIgnore: true */ process.cwd(),
    withoutScheme,
  );
  // Prisma / better-sqlite3 expect forward slashes in file URLs on Windows too.
  return `file:${absolutePath.replace(/\\/g, "/")}`;
}

async function configureSqlite(client: PrismaClient) {
  // Native SQLite defaults for an offline desk with large ledger history:
  // integrity, WAL concurrency, lock waits, and a larger page cache.
  await client.$executeRawUnsafe("PRAGMA foreign_keys = ON");
  await client.$executeRawUnsafe("PRAGMA journal_mode = WAL");
  await client.$executeRawUnsafe("PRAGMA busy_timeout = 5000");
  await client.$executeRawUnsafe("PRAGMA synchronous = NORMAL");
  await client.$executeRawUnsafe("PRAGMA temp_store = MEMORY");
  // Negative cache_size = KB units → ~64 MiB page cache.
  await client.$executeRawUnsafe("PRAGMA cache_size = -65536");
  await client.$executeRawUnsafe("PRAGMA mmap_size = 268435456");
  await client.$executeRawUnsafe("PRAGMA wal_autocheckpoint = 1000");
}

function createPrismaClient() {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }

  // Apply any staged restore before opening the live database.
  try {
    applyPendingRestoreIfAny();
  } catch (error) {
    console.error("Pending restore failed", error);
  }

  const adapter = new PrismaBetterSqlite3({
    url: resolveSqliteUrl(url),
  });

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
}

function getPrismaClient() {
  if (globalForPrisma.prisma && isStalePrismaClient(globalForPrisma.prisma)) {
    // Drop cached client so a newly generated schema (new models) is picked up
    // without requiring a full process restart after `prisma generate`.
    void globalForPrisma.prisma.$disconnect().catch(() => undefined);
    globalForPrisma.prisma = undefined;
    globalForPrisma.sqliteReady = undefined;
  }

  if (!globalForPrisma.prisma) {
    const client = createPrismaClient();
    globalForPrisma.prisma = client;
    globalForPrisma.sqliteReady = configureSqlite(client).catch(
      (error: unknown) => {
        globalForPrisma.sqliteReady = undefined;
        console.error("Failed to configure SQLite pragmas", error);
        throw error;
      },
    );
  }

  return globalForPrisma.prisma;
}

async function ensureSqliteReady() {
  getPrismaClient();
  await globalForPrisma.sqliteReady;
}

function wrapDelegate<T extends object>(delegate: T): T {
  return new Proxy(delegate, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);

      if (typeof value !== "function") {
        return value;
      }

      return async (...args: unknown[]) => {
        await ensureSqliteReady();
        return value.apply(target, args);
      };
    },
  });
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    const client = getPrismaClient();
    const value = Reflect.get(client, property, receiver);

    if (typeof property === "string" && property.startsWith("$")) {
      if (typeof value !== "function") {
        return value;
      }

      return async (...args: unknown[]) => {
        await ensureSqliteReady();
        return value.apply(client, args);
      };
    }

    if (value && typeof value === "object") {
      return wrapDelegate(value);
    }

    return value;
  },
});
