export const COUNTERPARTIES = [
  "WALK_IN",
  "CUSTOMER",
  "PARTNER",
  "BANK",
  "BUSINESS",
  "SUPPLIER",
  "OTHER",
] as const;

export type CounterpartyType = (typeof COUNTERPARTIES)[number];

export const CP_LABELS: Record<CounterpartyType, string> = {
  WALK_IN: "Walk-in customer",
  CUSTOMER: "Registered customer",
  PARTNER: "Partner Sarafi",
  BANK: "Bank",
  BUSINESS: "Business",
  SUPPLIER: "Supplier",
  OTHER: "Other",
};
