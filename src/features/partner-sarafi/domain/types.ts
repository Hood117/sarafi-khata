export type PartnerSarafiInput = {
  name: string;
  phone?: string | null;
  city?: string | null;
  country?: string | null;
  notes?: string | null;
  isActive: boolean;
  commissionEnabled: boolean;
  commissionPerAmount?: string | null;
  commissionFeeAmount?: string | null;
  commissionCurrencyCode?: string | null;
};

export type PartnerSarafiListItem = {
  id: string;
  customerId: string | null;
  needsCustomerLink: boolean;
  name: string;
  phone: string | null;
  city: string | null;
  country: string | null;
  notes: string | null;
  isActive: boolean;
  commissionEnabled: boolean;
  commissionPerAmount: string | null;
  commissionFeeAmount: string | null;
  commissionCurrencyCode: string | null;
  commissionRateLabel: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PartnerSarafiFormData = {
  id: string;
  customerId: string | null;
  name: string;
  phone: string | null;
  city: string | null;
  country: string | null;
  notes: string | null;
  isActive: boolean;
  commissionEnabled: boolean;
  commissionPerAmount: string;
  commissionFeeAmount: string;
  commissionCurrencyCode: string;
};

export type PartnerSarafiOption = {
  id: string;
  name: string;
  label: string;
  phone: string | null;
  city: string | null;
  country: string | null;
  commissionEnabled: boolean;
  commissionPerAmount: string | null;
  commissionFeeAmount: string | null;
  commissionCurrencyCode: string | null;
  commissionDecimalPlaces: number;
};

export type PartnerCommissionBalance = {
  currencyCode: string;
  currencyId: string;
  /** Commission accrued on SEND (we owe partner). */
  payableAccrued: string;
  /** Commission accrued on RECEIVE (partner owes us). */
  receivableAccrued: string;
  /** Already paid to partner. */
  paid: string;
  /** Already collected from partner. */
  collected: string;
  /** Still to pay the partner (display). */
  youOwe: string;
  /** Still to collect from the partner (display). */
  theyOweYou: string;
  /** Raw major-unit strings for settlement forms. */
  youOweRaw: string;
  theyOweYouRaw: string;
};

export type PartnerCommissionSettlementItem = {
  id: string;
  kind: "PAY_PARTNER" | "COLLECT_FROM_PARTNER";
  kindLabel: string;
  amountDisplay: string;
  currencyCode: string;
  notes: string | null;
  valueDate: string;
  transactionId: string;
  operatorName: string | null;
};

export type PartnerCommissionSummary = {
  partnerId: string;
  partnerName: string;
  rateLabel: string | null;
  balances: PartnerCommissionBalance[];
  settlements: PartnerCommissionSettlementItem[];
  hawalaCommissionRows: Array<{
    id: string;
    reference: string;
    direction: "SEND" | "RECEIVE";
    directionLabel: string;
    hawalaAmountDisplay: string;
    commissionAmountDisplay: string;
    commissionSide: "PAYABLE" | "RECEIVABLE" | null;
    commissionSideLabel: string | null;
    currencyCode: string;
    valueDate: string;
  }>;
};
