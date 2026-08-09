import "server-only";

import type { Prisma, Role, User } from "@/generated/prisma/client";
import { prisma } from "@/server/db";

export type CreateUserData = {
  fullName: string;
  username: string;
  passwordHash: string;
  role: Role;
  isActive?: boolean;
  allowedScreens: string[];
};

export type UpdateUserData = {
  fullName?: string;
  role?: Role;
  isActive?: boolean;
  passwordHash?: string;
  allowedScreens?: string[];
};

export type UserListOptions = {
  isActive?: boolean;
  role?: Role;
};

export async function createUser(data: CreateUserData): Promise<User> {
  return prisma.user.create({
    data: {
      fullName: data.fullName,
      username: data.username,
      passwordHash: data.passwordHash,
      role: data.role,
      isActive: data.isActive ?? true,
      allowedScreens: data.allowedScreens as Prisma.InputJsonValue,
    },
  });
}

export async function findUserById(id: string): Promise<User | null> {
  return prisma.user.findUnique({
    where: { id },
  });
}

export async function findUserByUsername(
  username: string,
): Promise<User | null> {
  return prisma.user.findUnique({
    where: { username },
  });
}

export async function listUsers(
  options: UserListOptions = {},
): Promise<User[]> {
  return prisma.user.findMany({
    where: {
      ...(typeof options.isActive === "boolean"
        ? { isActive: options.isActive }
        : {}),
      ...(options.role ? { role: options.role } : {}),
    },
    orderBy: [{ isActive: "desc" }, { fullName: "asc" }],
  });
}

export async function updateUser(
  id: string,
  data: UpdateUserData,
): Promise<User> {
  return prisma.user.update({
    where: { id },
    data: {
      ...(data.fullName !== undefined ? { fullName: data.fullName } : {}),
      ...(data.role !== undefined ? { role: data.role } : {}),
      ...(typeof data.isActive === "boolean" ? { isActive: data.isActive } : {}),
      ...(data.passwordHash !== undefined
        ? { passwordHash: data.passwordHash }
        : {}),
      ...(data.allowedScreens !== undefined
        ? {
            allowedScreens: data.allowedScreens as Prisma.InputJsonValue,
          }
        : {}),
    },
  });
}

export async function countActiveAdmins(
  options: { excludeUserId?: string } = {},
): Promise<number> {
  return prisma.user.count({
    where: {
      role: "ADMIN",
      isActive: true,
      ...(options.excludeUserId
        ? { id: { not: options.excludeUserId } }
        : {}),
    },
  });
}
