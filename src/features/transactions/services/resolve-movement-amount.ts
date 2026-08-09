import "server-only";

import {
  createCurrency,
  isLedgerDomainError,
  moneyFromMajorUnits,
  type CurrencyCode,
  type Money,
} from "@/features/ledger/domain";
import { findCurrencyByCode } from "@/features/ledger/repositories/currency-repository";
import { TransactionError } from "@/features/transactions/domain/transaction-errors";

export async function resolveMovementAmount(
  currencyCode: string,
  amountMajor: string,
): Promise<{ money: Money; currencyCode: CurrencyCode }> {
  const currencyRecord = await findCurrencyByCode(currencyCode);

  if (!currencyRecord) {
    throw new TransactionError("NOT_FOUND", "Currency was not found.", {
      currencyCode: "Currency was not found.",
    });
  }

  if (!currencyRecord.isActive) {
    throw new TransactionError(
      "INACTIVE",
      "Currency is inactive and cannot be used.",
      { currencyCode: "Currency is inactive." },
    );
  }

  const domainCurrency = createCurrency({
    code: currencyRecord.code,
    name: currencyRecord.name,
    symbol: currencyRecord.symbol ?? undefined,
    decimalPlaces: currencyRecord.decimalPlaces,
  });

  try {
    const money = moneyFromMajorUnits(amountMajor, domainCurrency);
    return { money, currencyCode: domainCurrency.code };
  } catch (error) {
    if (isLedgerDomainError(error)) {
      throw new TransactionError("VALIDATION", error.message, {
        amount: error.message,
      });
    }
    throw error;
  }
}
