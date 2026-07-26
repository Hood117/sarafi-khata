/**
 * Public API for the customers feature.
 * Import from this module only — do not reach into internal folders.
 */

export {
  createCustomer,
  findCustomerById,
  findCustomerByCode,
  findCustomerByPhone,
  listCustomerCodes,
  listCustomers,
  updateCustomer,
  softDeleteCustomer,
  type CreateCustomerData,
  type UpdateCustomerData,
  type CustomerListOptions,
} from "@/features/customers/repositories/customer-repository";

export {
  getCustomerList,
  type GetCustomerListOptions,
} from "@/features/customers/services/list-customers";
export { createCustomerRecord } from "@/features/customers/services/create-customer";
export { updateCustomerRecord } from "@/features/customers/services/update-customer";
export { getCustomerForForm } from "@/features/customers/services/get-customer";
export type { CustomerFormData } from "@/features/customers/services/get-customer";
export { getCustomerProfile } from "@/features/customers/services/get-customer-profile";
export { archiveCustomerRecord } from "@/features/customers/services/archive-customer";
export type {
  CustomerArchiveFilter,
  CustomerListItem,
  CustomerProfile,
} from "@/features/customers/domain/types";
export { CustomerError, isCustomerError } from "@/features/customers/domain/errors";
export {
  CUSTOMER_CODE_START,
  computeNextCustomerCode,
  parseCustomerCodeSequence,
} from "@/features/customers/domain/customer-code";
export { formatCustomerLabel } from "@/features/customers/domain/format-customer-label";
export {
  buildCustomerHistoryHref,
  buildCustomerHistoryHrefFromFilters,
  buildTransactionDetailHrefFromHistory,
  type CustomerHistoryHrefInput,
} from "@/features/customers/domain/customer-history-url";

export {
  createCustomerSchema,
  toCreateCustomerFieldErrors,
  type CreateCustomerInput,
  type CreateCustomerFieldErrors,
} from "@/features/customers/schemas/create-customer";

export {
  createCustomerAction,
  updateCustomerAction,
  getCustomerForEditAction,
  archiveCustomerAction,
  type CreateCustomerActionInput,
  type CreateCustomerActionResult,
  type UpdateCustomerActionInput,
  type UpdateCustomerActionResult,
  type GetCustomerForEditActionResult,
  type ArchiveCustomerActionResult,
  type CustomerFormActionInput,
  type CustomerMutationActionResult,
} from "@/features/customers/actions/customer-actions";

export { CustomersTable } from "@/features/customers/components/customers-table";
export { CustomersTableSkeleton } from "@/features/customers/components/customers-table-skeleton";
export { CustomersEmptyState } from "@/features/customers/components/customers-empty-state";
export { AddCustomerDialog } from "@/features/customers/components/add-customer-dialog";
export { EditCustomerDialog } from "@/features/customers/components/edit-customer-dialog";
export { ArchiveCustomerButton } from "@/features/customers/components/archive-customer-button";
export { CustomersPageHeader } from "@/features/customers/components/customers-page-header";
export { CustomersFilters } from "@/features/customers/components/customers-filters";
export { CustomersView } from "@/features/customers/components/customers-view";
export { CustomerForm } from "@/features/customers/components/customer-form";
export { CustomerProfileView } from "@/features/customers/components/customer-profile";
export { CustomerProfileSkeleton } from "@/features/customers/components/customer-profile-skeleton";
export { CustomerWalletsSection } from "@/features/customers/components/customer-wallets-section";
export { CustomerHistorySection } from "@/features/customers/components/customer-history-section";
export { CustomerHistoryEmptyState } from "@/features/customers/components/customer-history-empty-state";
export { CustomerHistoryFiltersForm } from "@/features/customers/components/customer-history-filters";
export { CustomerHistorySkeleton } from "@/features/customers/components/customer-history-skeleton";
