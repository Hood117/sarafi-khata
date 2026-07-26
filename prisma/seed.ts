import "dotenv/config";

import bcrypt from "bcrypt";
import { PrismaLibSql } from "@prisma/adapter-libsql";

import { PrismaClient, Role, WalletType } from "../src/generated/prisma/client";

const DEFAULT_ADMIN = {
  username: "admin",
  fullName: "System Administrator",
  password: "ChangeMe123!",
  role: Role.ADMIN,
  isActive: true,
} as const;

const BCRYPT_ROUNDS = 12;

const SUPPORTED_CURRENCIES = [
  { code: "AFN", name: "Afghan Afghani", symbol: "؋", decimalPlaces: 2 },
  { code: "USD", name: "US Dollar", symbol: "$", decimalPlaces: 2 },
  { code: "PKR", name: "Pakistani Rupee", symbol: "₨", decimalPlaces: 2 },
  { code: "EUR", name: "Euro", symbol: "€", decimalPlaces: 2 },
] as const;

const DEFAULT_SYSTEM_SETTINGS = [
  { key: "app.name", value: "Saraf" },
  { key: "app.baseCurrencyCode", value: "AFN" },
  { key: "app.locale", value: "en" },
] as const;

const DEFAULT_SYSTEM_WALLETS = [
  { name: "Main Vault", type: WalletType.VAULT },
  { name: "Cash Till", type: WalletType.TILL },
  { name: "Exchange Difference", type: WalletType.SYSTEM },
  { name: "Hawala Clearing", type: WalletType.SYSTEM },
] as const;

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

async function seedAdmin(prisma: PrismaClient) {
  const username = normalizeUsername(DEFAULT_ADMIN.username);
  const passwordHash = await bcrypt.hash(
    DEFAULT_ADMIN.password,
    BCRYPT_ROUNDS,
  );

  const existing = await prisma.user.findUnique({
    where: { username },
  });

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
}

async function seedCurrencies(prisma: PrismaClient) {
  for (const currency of SUPPORTED_CURRENCIES) {
    await prisma.currency.upsert({
      where: { code: currency.code },
      update: {
        name: currency.name,
        symbol: currency.symbol,
        decimalPlaces: currency.decimalPlaces,
        isActive: true,
        deletedAt: null,
      },
      create: {
        code: currency.code,
        name: currency.name,
        symbol: currency.symbol,
        decimalPlaces: currency.decimalPlaces,
        isActive: true,
      },
    });
  }

  console.log(
    `Currencies ready: ${SUPPORTED_CURRENCIES.map((c) => c.code).join(", ")}`,
  );
}

async function seedExchangeRates(prisma: PrismaClient) {
  // Intentionally empty — rates are entered by the shop later.
  const count = await prisma.exchangeRate.count({
    where: { deletedAt: null },
  });
  console.log(`Exchange rates ready: ${count} (none seeded)`);
}

async function seedSystemSettings(prisma: PrismaClient) {
  for (const setting of DEFAULT_SYSTEM_SETTINGS) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: { value: setting.value },
      create: {
        key: setting.key,
        value: setting.value,
      },
    });
  }

  console.log(
    `System settings ready: ${DEFAULT_SYSTEM_SETTINGS.map((s) => s.key).join(", ")}`,
  );
}

async function seedSystemWallets(prisma: PrismaClient) {
  for (const wallet of DEFAULT_SYSTEM_WALLETS) {
    const existing = await prisma.wallet.findFirst({
      where: {
        name: wallet.name,
        type: wallet.type,
        deletedAt: null,
      },
    });

    if (!existing) {
      await prisma.wallet.create({
        data: {
          name: wallet.name,
          type: wallet.type,
          isActive: true,
        },
      });
    }
  }

  console.log(
    `System wallets ready: ${DEFAULT_SYSTEM_WALLETS.map((w) => w.name).join(", ")}`,
  );
}

async function main() {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }

  const adapter = new PrismaLibSql({ url });
  const prisma = new PrismaClient({ adapter });

  try {
    await seedAdmin(prisma);
    await seedCurrencies(prisma);
    await seedExchangeRates(prisma);
    await seedSystemSettings(prisma);
    await seedSystemWallets(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
