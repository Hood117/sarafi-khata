"use server";

import { getExchangeFormOptions } from "@/features/exchange/services/get-exchange-form-options";
import type { ExchangeFormOptions } from "@/features/exchange/domain/types";

export async function loadExchangeFormOptionsAction(): Promise<ExchangeFormOptions> {
  return getExchangeFormOptions();
}
