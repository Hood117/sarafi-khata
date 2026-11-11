import { describe, expect, it } from "vitest";

import {
  optionalPositiveAmount,
  requirePositiveAmount,
} from "./amount";

describe("requirePositiveAmount", () => {
  it("accepts western and eastern digits", () => {
    expect(requirePositiveAmount("12.5")).toEqual({
      ok: true,
      value: "12.5",
    });
    expect(requirePositiveAmount("۱۲٫۵")).toEqual({
      ok: true,
      value: "12.5",
    });
  });

  it("rejects empty and zero", () => {
    expect(requirePositiveAmount("")).toEqual({
      ok: false,
      error: "required",
    });
    expect(requirePositiveAmount("0")).toEqual({
      ok: false,
      error: "invalid",
    });
  });
});

describe("optionalPositiveAmount", () => {
  it("allows empty", () => {
    expect(optionalPositiveAmount("")).toEqual({ ok: true, value: null });
  });
});
