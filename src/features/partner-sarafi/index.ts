/**
 * Public API for partner sarafi master data.
 */

export {
  PartnerSarafiError,
  isPartnerSarafiError,
  type PartnerSarafiErrorCode,
  type PartnerSarafiField,
} from "@/features/partner-sarafi/domain/errors";

export type {
  PartnerSarafiFormData,
  PartnerSarafiInput,
  PartnerSarafiListItem,
  PartnerSarafiOption,
  PartnerCommissionSummary,
  PartnerCommissionBalance,
  PartnerCommissionSettlementItem,
} from "@/features/partner-sarafi/domain/types";

export {
  calculatePartnerCommission,
  formatPartnerCommissionRateLabel,
  resolveHawalaCommissionRate,
} from "@/features/partner-sarafi/domain/commission";

export {
  createPartnerSarafiSchema,
  updatePartnerSarafiSchema,
  settlePartnerCommissionSchema,
  toPartnerSarafiFormFieldErrors,
  type PartnerSarafiFormFieldErrors,
} from "@/features/partner-sarafi/schemas/partner-sarafi-form";

export { getPartnerSarafiList } from "@/features/partner-sarafi/services/list-partner-sarafi";
export {
  getPartnerSarafiForForm,
  listActivePartnerSarafiOptions,
} from "@/features/partner-sarafi/services/get-partner-sarafi";
export { getPartnerSarafiProfile } from "@/features/partner-sarafi/services/get-partner-sarafi-profile";
export { getPartnerCommissionSummary } from "@/features/partner-sarafi/services/get-partner-commission-summary";
export { settlePartnerCommission } from "@/features/partner-sarafi/services/settle-partner-commission";
export { createPartnerSarafiRecord } from "@/features/partner-sarafi/services/create-partner-sarafi";
export { updatePartnerSarafiRecord } from "@/features/partner-sarafi/services/update-partner-sarafi";
export { setPartnerSarafiActiveRecord } from "@/features/partner-sarafi/services/set-partner-sarafi-active";

export {
  createPartnerSarafiAction,
  updatePartnerSarafiAction,
  setPartnerSarafiActiveAction,
  getPartnerSarafiForEditAction,
  settlePartnerCommissionAction,
  type PartnerSarafiFieldErrors,
  type PartnerSarafiMutationActionResult,
} from "@/features/partner-sarafi/actions/partner-sarafi-actions";

export { PartnerSarafiView } from "@/features/partner-sarafi/components/partner-sarafi-view";
export { PartnerSarafiTable } from "@/features/partner-sarafi/components/partner-sarafi-table";
export { PartnerSarafiForm } from "@/features/partner-sarafi/components/partner-sarafi-form";
export { AddPartnerSarafiDialog } from "@/features/partner-sarafi/components/add-partner-sarafi-dialog";
export { EditPartnerSarafiDialog } from "@/features/partner-sarafi/components/edit-partner-sarafi-dialog";
export { PartnerSarafiProfileView } from "@/features/partner-sarafi/components/partner-sarafi-profile";
export { PartnerSarafiTableSkeleton } from "@/features/partner-sarafi/components/partner-sarafi-table-skeleton";
export { PartnerSarafiProfileSkeleton } from "@/features/partner-sarafi/components/partner-sarafi-profile-skeleton";
export { PartnerSarafiSearchSelect } from "@/features/partner-sarafi/components/partner-sarafi-search-select";
export { PartnerSarafiCommissionSection } from "@/features/partner-sarafi/components/partner-sarafi-commission-section";
