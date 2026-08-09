import "server-only";

import type { Wallet } from "@/generated/prisma/client";
import { findCustomerById } from "@/features/customers/repositories/customer-repository";
import { WalletError } from "@/features/wallets/domain/errors";
import type { WalletInput } from "@/features/wallets/domain/types";
import { normalizeWalletInput } from "@/features/wallets/domain/wallet-rules";
import { createWallet } from "@/features/wallets/repositories/wallet-repository";
import { queueAutoBackup } from "@/features/backup/services/auto-backup";

export type CreateWalletResult = Wallet;

export async function createWalletRecord(
  input: WalletInput | unknown,
): Promise<CreateWalletResult> {
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

  const wallet = await createWallet({
    name: data.name,
    type: data.type,
    ...(data.customerId
      ? { customer: { connect: { id: data.customerId } } }
      : {}),
  });
  queueAutoBackup("wallet-create");
  return wallet;
}
