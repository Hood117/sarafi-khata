"use server";

import { getTransferFormOptions } from "@/features/transfers/services/get-transfer-form-options";
import type { TransferFormOptions } from "@/features/transfers/domain/types";

export async function loadTransferFormOptionsAction(): Promise<TransferFormOptions> {
  return getTransferFormOptions();
}
