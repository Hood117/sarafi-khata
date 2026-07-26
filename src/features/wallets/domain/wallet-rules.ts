import { WalletError } from "@/features/wallets/domain/errors";
import type { WalletInput } from "@/features/wallets/domain/types";
import {
  toWalletFormFieldErrors,
  walletFormSchema,
  type WalletFormSchemaOutput,
} from "@/features/wallets/schemas/wallet-form";

export function normalizeWalletInput(
  input: WalletInput | unknown,
): WalletFormSchemaOutput {
  const parsed = walletFormSchema.safeParse(input);

  if (!parsed.success) {
    throw new WalletError(
      "VALIDATION",
      "Please correct the highlighted fields.",
      toWalletFormFieldErrors(parsed.error),
    );
  }

  return parsed.data;
}
