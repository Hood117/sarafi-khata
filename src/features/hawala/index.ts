/**
 * Public API for the hawala feature.
 * Import from this module only — do not reach into internal folders.
 *
 * Financial legs are posted only through `postTransaction` (via send/receive/complete).
 */

export { HawalaError, isHawalaError } from "@/features/hawala/domain/errors";
export type {
  HawalaErrorCode,
  HawalaField,
} from "@/features/hawala/domain/errors";

export {
  HAWALA_DIRECTION_LABELS,
  HAWALA_STATUS_LABELS,
} from "@/features/hawala/domain/labels";

export type {
  HawalaDirection,
  HawalaStatus,
  HawalaPartySource,
  HawalaPartyInput,
  SendHawalaInput,
  ReceiveHawalaInput,
  HawalaTransferRecord,
  HawalaListItem,
  HawalaCustomerOption,
  HawalaWalletOption,
  HawalaCurrencyOption,
  HawalaFormOptions,
  GetHawalaListOptions,
  HawalaTimelineEvent,
  HawalaDetail,
} from "@/features/hawala/domain/types";

export {
  assertCashWallet,
  assertClearingWallet,
  assertDistinctWallets,
} from "@/features/hawala/domain/rules";

export {
  hawalaPartySchema,
  sendHawalaSchema,
  receiveHawalaSchema,
  toHawalaFieldErrors,
  type HawalaPartySchemaInput,
  type HawalaPartySchemaOutput,
  type HawalaFieldErrors,
} from "@/features/hawala/schemas/hawala";

export {
  createHawalaTransfer,
  findHawalaTransferById,
  findHawalaTransferByReference,
  listHawalaTransfers,
  markHawalaCompleted,
  markHawalaCancelled,
  type CreateHawalaTransferData,
  type HawalaListOptions,
} from "@/features/hawala/repositories/hawala-repository";

export { sendHawala } from "@/features/hawala/services/send-hawala";
export { receiveHawala } from "@/features/hawala/services/receive-hawala";
export { completeHawala } from "@/features/hawala/services/complete-hawala";
export { cancelHawala } from "@/features/hawala/services/cancel-hawala";

export {
  sendHawalaAction,
  receiveHawalaAction,
  cancelHawalaAction,
  type SendHawalaActionInput,
  type ReceiveHawalaActionInput,
  type CancelHawalaActionInput,
  type SendHawalaActionResult,
  type ReceiveHawalaActionResult,
  type CancelHawalaActionResult,
  type HawalaMutationActionResult,
  type HawalaFieldErrors as HawalaActionFieldErrors,
} from "@/features/hawala/actions/hawala-actions";

export { getHawalaList } from "@/features/hawala/services/list-hawala";
export { getHawalaFormOptions } from "@/features/hawala/services/get-hawala-form-options";
export { getHawalaDetail } from "@/features/hawala/services/get-hawala-detail";

export { HawalaView } from "@/features/hawala/components/hawala-view";
export { HawalaDetailView } from "@/features/hawala/components/hawala-detail";
export { HawalaDetailSkeleton } from "@/features/hawala/components/hawala-detail-skeleton";
export { CancelHawalaButton } from "@/features/hawala/components/cancel-hawala-button";
export { HawalaTable } from "@/features/hawala/components/hawala-table";
export { HawalaTableSkeleton } from "@/features/hawala/components/hawala-table-skeleton";
export { HawalaEmptyState } from "@/features/hawala/components/hawala-empty-state";
export { HawalaFilters } from "@/features/hawala/components/hawala-filters";
export { HawalaPageHeader } from "@/features/hawala/components/hawala-page-header";
export { SendHawalaDialog } from "@/features/hawala/components/send-hawala-dialog";
export { ReceiveHawalaDialog } from "@/features/hawala/components/receive-hawala-dialog";
export {
  HawalaForm,
  emptyHawalaFormValues,
  type HawalaFormValues,
} from "@/features/hawala/components/hawala-form";
