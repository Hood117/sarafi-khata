import { describe, expect, it } from "vitest";

import {
  isNonNegativeAmountString,
  isPositiveAmountString,
  positiveAmountSchema,
} from "./amount";

describe("amount string helpers", () => {
  it("accepts positive major-unit amounts", () => {
    expect(isPositiveAmountString("12.50")).toBe(true);
    expect(isPositiveAmountString("1")).toBe(true);
    expect(isPositiveAmountString("0")).toBe(false);
    expect(isPositiveAmountString("-1")).toBe(false);
    expect(isPositiveAmountString("12.50.1")).toBe(false);
  });

  it("accepts zero for non-negative", () => {
    expect(isNonNegativeAmountString("0")).toBe(true);
    expect(isNonNegativeAmountString("0.00")).toBe(true);
    expect(isNonNegativeAmountString("-1")).toBe(false);
  });
});

describe("positiveAmountSchema", () => {
  it("parses valid amounts", () => {
    expect(positiveAmountSchema.safeParse("100.5").success).toBe(true);
  });

  it("rejects empty and zero", () => {
    expect(positiveAmountSchema.safeParse("").success).toBe(false);
    expect(positiveAmountSchema.safeParse("0").success).toBe(false);
  });
});
