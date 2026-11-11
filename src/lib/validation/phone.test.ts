import { describe, expect, it } from "vitest";

import {
  filterPhoneChars,
  isValidPhoneFormat,
  phoneDigits,
  validatePhone,
} from "./phone";

describe("isValidPhoneFormat", () => {
  it("accepts loose international and local phones", () => {
    expect(isValidPhoneFormat("0700123456")).toBe(true);
    expect(isValidPhoneFormat("+93 700 123 456")).toBe(true);
    expect(isValidPhoneFormat("93-700-123456")).toBe(true);
    expect(isValidPhoneFormat("1234567")).toBe(true);
  });

  it("rejects empty, short, long, and illegal characters", () => {
    expect(isValidPhoneFormat("")).toBe(false);
    expect(isValidPhoneFormat("123")).toBe(false);
    expect(isValidPhoneFormat("abc700123456")).toBe(false);
    expect(isValidPhoneFormat("0700#123456")).toBe(false);
    expect(isValidPhoneFormat("1".repeat(16))).toBe(false);
  });
});

describe("validatePhone", () => {
  it("allows empty when optional", () => {
    expect(validatePhone("", { required: false })).toEqual({
      ok: true,
      value: null,
    });
  });

  it("requires a value when required", () => {
    expect(validatePhone("", { required: true })).toEqual({
      ok: false,
      error: "required",
    });
  });

  it("returns trimmed value when valid", () => {
    expect(validatePhone(" 0700123456 ", { required: true })).toEqual({
      ok: true,
      value: "0700123456",
    });
  });
});

describe("filterPhoneChars / phoneDigits", () => {
  it("keeps allowed characters only", () => {
    expect(filterPhoneChars("+93 700-abc")).toBe("+93 700-");
  });

  it("strips to digits", () => {
    expect(phoneDigits("+93 700-123")).toBe("93700123");
  });
});
