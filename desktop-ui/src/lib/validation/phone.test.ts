import { describe, expect, it } from "vitest";

import {
  isValidPhoneFormat,
  normalizePhoneInput,
  validatePhone,
} from "./phone";

describe("normalizePhoneInput", () => {
  it("westernizes Persian digits and drops illegal chars", () => {
    expect(normalizePhoneInput("۰۷۰۰۱۲۳۴۵۶")).toBe("0700123456");
    expect(normalizePhoneInput("07abc00123456")).toBe("0700123456");
  });

  it("keeps + spaces and dashes", () => {
    expect(normalizePhoneInput("+93 700-123")).toBe("+93 700-123");
  });
});

describe("validatePhone (desktop)", () => {
  it("accepts normalized local numbers", () => {
    expect(isValidPhoneFormat("0799123456")).toBe(true);
    expect(validatePhone("0799123456", { required: true }).ok).toBe(true);
  });
});
