import "server-only";

import bcrypt from "bcrypt";

import { BCRYPT_ROUNDS } from "@/features/auth/domain/password-policy";

export {
  BCRYPT_ROUNDS,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
} from "@/features/auth/domain/password-policy";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}
