"use server";

import { getTransactionFormOptions } from "@/features/transactions/services/get-transaction-form-options";

export async function loadTransactionFormOptionsAction() {
  return getTransactionFormOptions();
}
