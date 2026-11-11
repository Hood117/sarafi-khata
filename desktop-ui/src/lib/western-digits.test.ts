import { describe, expect, it } from "vitest";

import {
  isAmountKeyChar,
  normalizeAmountInput,
  parseAmountNumber,
  parsePositiveAmount,
  parseSignedAmountNumber,
  toWesternDigits,
} from "./western-digits";

describe("toWesternDigits / normalizeAmountInput", () => {
  it("keeps English digits", () => {
    expect(normalizeAmountInput("12232.50")).toBe("12232.50");
  });

  it("converts Persian/Pashto digits", () => {
    expect(toWesternDigits("۱۲۲۳۲")).toBe("12232");
    expect(normalizeAmountInput("۱۲۲۳۲")).toBe("12232");
    expect(normalizeAmountInput("۲۵٬۰۰۰")).toBe("25000");
    expect(normalizeAmountInput("۱۲٫۵۰")).toBe("12.50");
  });

  it("converts Arabic-Indic digits", () => {
    expect(normalizeAmountInput("١٢٢٣٢")).toBe("12232");
    expect(normalizeAmountInput("١٢٫٥")).toBe("12.5");
  });

  it("converts fullwidth digits", () => {
    expect(normalizeAmountInput("１２３４")).toBe("1234");
  });

  it("strips letters from Pashto/English layouts", () => {
    expect(normalizeAmountInput("12ab۳")).toBe("123");
  });
});

describe("isAmountKeyChar", () => {
  it("accepts English, Arabic, and Pashto digit keys", () => {
    expect(isAmountKeyChar("5")).toBe(true);
    expect(isAmountKeyChar("٥")).toBe(true); // Arabic-Indic
    expect(isAmountKeyChar("۵")).toBe(true); // Persian/Pashto
    expect(isAmountKeyChar(".")).toBe(true);
    expect(isAmountKeyChar("٫")).toBe(true);
  });

  it("rejects letters", () => {
    expect(isAmountKeyChar("ا")).toBe(false);
    expect(isAmountKeyChar("a")).toBe(false);
  });
});

describe("parseAmountNumber / parsePositiveAmount / parseSignedAmountNumber", () => {
  it("parses Eastern digits and separators", () => {
    expect(parseAmountNumber("۱۲٬۵۰۰٫۵۰")).toBe(12500.5);
    expect(parsePositiveAmount("١٢٫٥")).toBe(12.5);
    expect(parsePositiveAmount("0")).toBeNull();
    expect(parsePositiveAmount("")).toBeNull();
  });

  it("keeps leading minus for signed display amounts", () => {
    expect(parseSignedAmountNumber("−۱٬۲۰۰")).toBe(-1200);
    expect(parseSignedAmountNumber("-25.5")).toBe(-25.5);
    expect(parseSignedAmountNumber(40)).toBe(40);
  });
});
