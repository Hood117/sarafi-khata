import "server-only";

import { PrismaLibSql } from "@prisma/adapter-libsql";

import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  sqliteReady: Promise<void> | undefined;
};

async function configureSqlite(client: PrismaClient) {
  // Offline desktop SQLite defaults: integrity, concurrency, lock waits.
  await client.$executeRawUnsafe("PRAGMA foreign_keys = ON");
  await client.$executeRawUnsafe("PRAGMA journal_mode = WAL");
  await client.$executeRawUnsafe("PRAGMA busy_timeout = 5000");
  await client.$executeRawUnsafe("PRAGMA synchronous = NORMAL");
}

function createPrismaClient() {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }

  const adapter = new PrismaLibSql({ url });

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
}

function getPrismaClient() {
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
