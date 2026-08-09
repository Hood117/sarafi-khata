import { describe, expect, it } from "vitest";

import {
  calculatePartnerCommission,
  formatPartnerCommissionRateLabel,
} from "@/features/partner-sarafi/domain/commission";

describe("calculatePartnerCommission", () => {
  const rate = {
    enabled: true,
    perAmount: "100000",
    feeAmount: "100",
    currencyCode: "AFN",
  };

  it("calculates SEND payable commission for full slabs", () => {
    const result = calculatePartnerCommission({
      hawalaAmount: "200000",
      hawalaCurrencyCode: "AFN",
      hawalaDirection: "SEND",
      rate,
      decimalPlaces: 0,
    });

    expect(result).toEqual({
      applies: true,
      amount: "200",
      currencyCode: "AFN",
      side: "PAYABLE",
    });
  });

  it("calculates RECEIVE receivable commission proportionally", () => {
    const result = calculatePartnerCommission({
      hawalaAmount: "150000",
      hawalaCurrencyCode: "AFN",
      hawalaDirection: "RECEIVE",
      rate,
      decimalPlaces: 0,
    });

    expect(result).toEqual({
      applies: true,
      amount: "150",
      currencyCode: "AFN",
      side: "RECEIVABLE",
    });
  });

  it("skips when rate disabled", () => {
    const result = calculatePartnerCommission({
      hawalaAmount: "200000",
      hawalaCurrencyCode: "AFN",
      hawalaDirection: "SEND",
      rate: { ...rate, enabled: false },
      decimalPlaces: 0,
    });
    expect(result).toEqual({ applies: false, reason: "disabled" });
  });

  it("skips when hawala currency differs from rate currency", () => {
    const result = calculatePartnerCommission({
      hawalaAmount: "200000",
      hawalaCurrencyCode: "USD",
      hawalaDirection: "SEND",
      rate,
      decimalPlaces: 2,
    });
    expect(result).toEqual({ applies: false, reason: "currency_mismatch" });
  });
});

describe("formatPartnerCommissionRateLabel", () => {
  it("formats enabled rate", () => {
    expect(
      formatPartnerCommissionRateLabel({
        enabled: true,
        perAmount: "100000",
        feeAmount: "100",
        currencyCode: "AFN",
      }),
    ).toBe("100 AFN per 100000 AFN");
  });
});
