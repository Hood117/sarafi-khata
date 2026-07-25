import "server-only";

import type { Prisma, SystemSetting } from "@/generated/prisma/client";
import { prisma } from "@/server/db";

export type UpsertSystemSettingData = {
  key: string;
  value: string;
};

export async function getSystemSetting(
  key: string,
): Promise<SystemSetting | null> {
  return prisma.systemSetting.findUnique({
    where: { key },
  });
}

export async function listSystemSettings(): Promise<SystemSetting[]> {
  return prisma.systemSetting.findMany({
    orderBy: { key: "asc" },
  });
}

export async function upsertSystemSetting(
  data: UpsertSystemSettingData,
): Promise<SystemSetting> {
  return prisma.systemSetting.upsert({
    where: { key: data.key },
    update: { value: data.value },
    create: {
      key: data.key,
      value: data.value,
    },
  });
}

export async function updateSystemSetting(
  key: string,
  value: string,
): Promise<SystemSetting> {
  return prisma.systemSetting.update({
    where: { key },
    data: { value } satisfies Prisma.SystemSettingUpdateInput,
  });
}
