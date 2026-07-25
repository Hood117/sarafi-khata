/**
 * Public API for the customers feature.
 * Import from this module only — do not reach into internal folders.
 */

export {
  createCustomer,
  findCustomerById,
  findCustomerByCode,
  listCustomers,
  updateCustomer,
  softDeleteCustomer,
  type CreateCustomerData,
  type UpdateCustomerData,
  type CustomerListOptions,
} from "@/features/customers/repositories/customer-repository";
