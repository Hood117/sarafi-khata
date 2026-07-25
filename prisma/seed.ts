import "dotenv/config";

import bcrypt from "bcrypt";
import { PrismaLibSql } from "@prisma/adapter-libsql";

import { PrismaClient, Role } from "../src/generated/prisma/client";

const DEFAULT_ADMIN = {
  username: "admin",
  fullName: "System Administrator",
  password: "ChangeMe123!",
  role: Role.ADMIN,
  isActive: true,
} as const;

const BCRYPT_ROUNDS = 12;

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

async function main() {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }

  const adapter = new PrismaLibSql({ url });
  const prisma = new PrismaClient({ adapter });

  try {
    const username = normalizeUsername(DEFAULT_ADMIN.username);
    const passwordHash = await bcrypt.hash(
      DEFAULT_ADMIN.password,
      BCRYPT_ROUNDS,
    );

    const existing = await prisma.user.findUnique({
      where: { username },
    });

    // Keep seed idempotent; only rehash if the stored hash is not bcrypt.
    const needsBcryptHash =
      !existing ||
      !(
        existing.passwordHash.startsWith("$2a$") ||
        existing.passwordHash.startsWith("$2b$")
      );

    const admin = await prisma.user.upsert({
      where: { username },
      update: needsBcryptHash ? { passwordHash } : {},
      create: {
        username,
        fullName: DEFAULT_ADMIN.fullName,
        passwordHash,
        role: DEFAULT_ADMIN.role,
        isActive: DEFAULT_ADMIN.isActive,
      },
    });

    console.log(
      `Default admin ready: ${admin.username} (${admin.role}, active=${admin.isActive})`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
