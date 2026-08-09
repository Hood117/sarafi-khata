import "server-only";

import type { Wallet } from "@/generated/prisma/client";
import { findCustomerById } from "@/features/customers/repositories/customer-repository";
import { WalletError } from "@/features/wallets/domain/errors";
import type { WalletInput } from "@/features/wallets/domain/types";
import { normalizeWalletInput } from "@/features/wallets/domain/wallet-rules";
import {
  findWalletById,
  updateWallet,
} from "@/features/wallets/repositories/wallet-repository";

export type UpdateWalletResult = Wallet;

export async function updateWalletRecord(
  id: string,
  input: WalletInput | unknown,
): Promise<UpdateWalletResult> {
  const existing = await findWalletById(id);

  if (!existing) {
    throw new WalletError("NOT_FOUND", "Wallet not found.");
  }

  const data = normalizeWalletInput(input);

  if (data.customerId) {
    const customer = await findCustomerById(data.customerId);

    if (!customer) {
      throw new WalletError(
        "VALIDATION",
        "Please correct the highlighted fields.",
        { customerId: "Customer not found." },
      );
    }
  }

  // Prisma `@updatedAt` refreshes `updatedAt`; `createdAt` is intentionally omitted.
  return updateWallet(id, {
    name: data.name,
    type: data.type,
    ...(data.customerId
      ? { customer: { connect: { id: data.customerId } } }
      : { customer: { disconnect: true } }),
  });
}
