/**
 * Partner hawala commission math.
 *
 * Desk convention (Afghanistan sarafi practice): quote a fee per slab,
 * e.g. "100 AFN for every 100,000 AFN of hawala".
 *
 * commission = hawalaAmount × (feeAmount / perAmount)
 * Rounded to the currency's decimal places (half-up).
 */

export type PartnerCommissionRateInput = {
  enabled: boolean;
  /** e.g. 100000 */
  perAmount: string | number | null | undefined;
  /** e.g. 100 */
  feeAmount: string | number | null | undefined;
  currencyCode: string | null | undefined;
};

export type CalculatePartnerCommissionInput = {
  hawalaAmount: string | number;
  hawalaCurrencyCode: string;
  hawalaDirection: "SEND" | "RECEIVE";
  rate: PartnerCommissionRateInput;
  decimalPlaces: number;
};

export type PartnerCommissionCalculation =
  | {
      applies: false;
      reason:
        | "disabled"
        | "incomplete_rate"
        | "currency_mismatch"
        | "zero_amount";
    }
  | {
      applies: true;
      /** Major-unit decimal string. */
      amount: string;
      currencyCode: string;
      /** SEND → we owe partner; RECEIVE → partner owes us. */
      side: "PAYABLE" | "RECEIVABLE";
    };

function toPositiveNumber(value: string | number | null | undefined): number | null {
  if (value == null || value === "") {
    return null;
  }
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  return n;
}

function roundHalfUp(value: number, decimalPlaces: number): string {
  const places = Math.max(0, Math.min(8, Math.trunc(decimalPlaces)));
  const factor = 10 ** places;
  const rounded = Math.round((value + Number.EPSILON) * factor) / factor;
  return rounded.toFixed(places);
}

/**
 * Calculate partner commission for a hawala amount using the partner's rate.
 * Only applies when the hawala currency matches the rate currency.
 */
export function calculatePartnerCommission(
  input: CalculatePartnerCommissionInput,
): PartnerCommissionCalculation {
  const rate = input.rate;
  if (!rate.enabled) {
    return { applies: false, reason: "disabled" };
  }

  const perAmount = toPositiveNumber(rate.perAmount);
  const feeAmount = toPositiveNumber(rate.feeAmount);
  const rateCurrency = rate.currencyCode?.trim().toUpperCase() ?? "";
  const hawalaCurrency = input.hawalaCurrencyCode.trim().toUpperCase();

  if (perAmount == null || feeAmount == null || !rateCurrency) {
    return { applies: false, reason: "incomplete_rate" };
  }

  if (rateCurrency !== hawalaCurrency) {
    return { applies: false, reason: "currency_mismatch" };
  }

  const hawalaAmount = toPositiveNumber(input.hawalaAmount);
  if (hawalaAmount == null) {
    return { applies: false, reason: "zero_amount" };
  }

  const raw = (hawalaAmount * feeAmount) / perAmount;
  const amount = roundHalfUp(raw, input.decimalPlaces);
  if (Number(amount) <= 0) {
    return { applies: false, reason: "zero_amount" };
  }

  return {
    applies: true,
    amount,
    currencyCode: hawalaCurrency,
    side: input.hawalaDirection === "SEND" ? "PAYABLE" : "RECEIVABLE",
  };
}

/** Human-readable rate, e.g. "100 AFN per 100,000 AFN". */
export function formatPartnerCommissionRateLabel(input: {
  enabled: boolean;
  perAmount: string | null;
  feeAmount: string | null;
  currencyCode: string | null;
}): string | null {
  if (!input.enabled) {
    return null;
  }
  const per = input.perAmount?.trim();
  const fee = input.feeAmount?.trim();
  const code = input.currencyCode?.trim();
  if (!per || !fee || !code) {
    return null;
  }
  return `${fee} ${code} per ${per} ${code}`;
}

/**
 * Resolve the commission rate for a hawala.
 * Explicit per-hawala rate (both fields set) applies in the hawala currency.
 * Partner default rate uses the same fee/per ratio in the hawala currency
 * (desk practice: the ratio travels with the transfer currency).
 */
export function resolveHawalaCommissionRate(input: {
  hawalaCurrencyCode: string;
  overridePerAmount?: string | null;
  overrideFeeAmount?: string | null;
  partner: PartnerCommissionRateInput;
}): PartnerCommissionRateInput & { source: "override" | "partner" | "none" } {
  const hawalaCurrency = input.hawalaCurrencyCode.trim().toUpperCase();
  const overridePer = input.overridePerAmount?.trim() || null;
  const overrideFee = input.overrideFeeAmount?.trim() || null;

  if (overridePer && overrideFee) {
    return {
      enabled: true,
      perAmount: overridePer,
      feeAmount: overrideFee,
      currencyCode: hawalaCurrency,
      source: "override",
    };
  }

  const partnerPer =
    input.partner.perAmount == null
      ? null
      : String(input.partner.perAmount).trim() || null;
  const partnerFee =
    input.partner.feeAmount == null
      ? null
      : String(input.partner.feeAmount).trim() || null;

  if (input.partner.enabled && partnerPer && partnerFee) {
    return {
      enabled: true,
      perAmount: partnerPer,
      feeAmount: partnerFee,
      currencyCode: hawalaCurrency,
      source: "partner",
    };
  }

  return {
    enabled: false,
    perAmount: null,
    feeAmount: null,
    currencyCode: null,
    source: "none",
  };
}
