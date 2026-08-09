/**
 * Public API for external money (saraf capital into shop cash).
 */

export type {
  ExternalMoneyArchiveFilter,
  ExternalMoneyListItem,
  ExternalMoneyListOptions,
} from "@/features/external-money/domain/types";

export {
  addExternalMoneySchema,
  archiveExternalMoneySchema,
  toAddExternalMoneyFieldErrors,
  toUpdateExternalMoneyFieldErrors,
  updateExternalMoneySchema,
  type AddExternalMoneyFieldErrors,
  type AddExternalMoneyInput,
  type ArchiveExternalMoneyInput,
  type UpdateExternalMoneyFieldErrors,
  type UpdateExternalMoneyInput,
} from "@/features/external-money/schemas/external-money-form";

export {
  postExternalMoney,
  type PostExternalMoneyParams,
} from "@/features/external-money/services/post-external-money";

export { listExternalMoney } from "@/features/external-money/services/list-external-money";
export { updateExternalMoneyRecord } from "@/features/external-money/services/update-external-money";
export { archiveExternalMoneyRecord } from "@/features/external-money/services/archive-external-money";

export {
  getExternalMoneyPageData,
  type ExternalMoneyCashWalletOption,
  type ExternalMoneyCurrencyOption,
  type ExternalMoneyPageData,
} from "@/features/external-money/services/get-external-money-page-data";

export {
  addExternalMoneyAction,
  archiveExternalMoneyAction,
  updateExternalMoneyAction,
  type AddExternalMoneyActionInput,
  type AddExternalMoneyActionResult,
  type ArchiveExternalMoneyActionInput,
  type ArchiveExternalMoneyActionResult,
  type UpdateExternalMoneyActionInput,
  type UpdateExternalMoneyActionResult,
} from "@/features/external-money/actions/external-money-actions";

export { ExternalMoneyView } from "@/features/external-money/components/external-money-view";
export { AddExternalMoneyDialog } from "@/features/external-money/components/add-external-money-dialog";
export { EditExternalMoneyDialog } from "@/features/external-money/components/edit-external-money-dialog";
export { ArchiveExternalMoneyButton } from "@/features/external-money/components/archive-external-money-button";
