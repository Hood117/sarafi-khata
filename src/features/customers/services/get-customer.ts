import "server-only";

import { CustomerError } from "@/features/customers/domain/errors";
import { findCustomerById } from "@/features/customers/repositories/customer-repository";

export type CustomerFormData = {
  id: string;
  fullName: string;
  fatherName: string;
  phone: string;
  address: string;
  nationalId: string;
  notes: string;
};

export async function getCustomerForForm(id: string): Promise<CustomerFormData> {
  const customer = await findCustomerById(id);

  if (!customer) {
    throw new CustomerError("NOT_FOUND", "Customer not found.");
  }

  return {
    id: customer.id,
    fullName: customer.fullName,
    fatherName: customer.fatherName ?? "",
    phone: customer.phone ?? "",
    address: customer.address ?? "",
    nationalId: customer.nationalId ?? "",
    notes: customer.notes ?? "",
  };
}
