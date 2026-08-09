import { describe, expect, it } from "vitest";

import {
  assertLedgerBalanced,
  createCurrency,
  createMoney,
  createReversalEntry,
  isLedgerBalanced,
  oppositeDirection,
} from "@/features/ledger/domain";

const afn = createCurrency({
  code: "AFN",
  name: "Afghani",
  decimalPlaces: 0,
});

describe("ledger balance", () => {
  it("accepts balanced debit/credit pairs", () => {
    const entries = [
      {
        walletId: "w1",
        currency: afn.code,
        direction: "DEBIT" as const,
        amount: createMoney(BigInt(1000), afn.code),
      },
      {
        walletId: "w2",
        currency: afn.code,
        direction: "CREDIT" as const,
        amount: createMoney(BigInt(1000), afn.code),
      },
    ];

    expect(() => assertLedgerBalanced(entries)).not.toThrow();
    expect(isLedgerBalanced(entries)).toBe(true);
  });

  it("rejects unbalanced sets", () => {
    const entries = [
      {
        walletId: "w1",
        currency: afn.code,
        direction: "DEBIT" as const,
        amount: createMoney(BigInt(1000), afn.code),
      },
      {
        walletId: "w2",
        currency: afn.code,
        direction: "CREDIT" as const,
        amount: createMoney(BigInt(500), afn.code),
      },
    ];

    expect(isLedgerBalanced(entries)).toBe(false);
    expect(() => assertLedgerBalanced(entries)).toThrow(/not balanced/i);
  });
});

describe("createReversalEntry", () => {
  it("flips direction and keeps amount", () => {
    const original = {
      walletId: "w1",
      currency: afn.code,
      direction: "DEBIT" as const,
      amount: createMoney(BigInt(250), afn.code),
      memo: "deposit",
    };

    const reversed = createReversalEntry(original, "void");
    expect(reversed.direction).toBe(oppositeDirection(original.direction));
    expect(reversed.amount.amountMinor).toBe(original.amount.amountMinor);
    expect(reversed.walletId).toBe(original.walletId);
    expect(reversed.memo).toBe("void");
  });
});
