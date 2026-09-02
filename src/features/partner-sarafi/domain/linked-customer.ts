export function partnerDisplayFromCustomer(
  partner: { name: string; phone: string | null },
  customer: { fullName: string; phone: string | null } | null | undefined,
): { name: string; phone: string | null } {
  if (!customer) {
    return { name: partner.name, phone: partner.phone };
  }
  const name = customer.fullName.trim() || partner.name;
  const phone = customer.phone?.trim() || partner.phone;
  return { name, phone };
}
