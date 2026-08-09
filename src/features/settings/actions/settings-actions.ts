"use server";

import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  AUDIT_MODULES,
  auditAction,
  toSettingsAuditValues,
} from "@/features/audit";
import { requirePermission } from "@/features/auth/permissions/authorize";
import { isSettingsError } from "@/features/settings/domain/errors";
import type { AppSettings } from "@/features/settings/domain/types";
import type { AppSettingsFieldErrors } from "@/features/settings/schemas/app-settings";
import { getAppSettings } from "@/features/settings/services/get-app-settings";
import { updateAppSettingsRecord } from "@/features/settings/services/update-app-settings";

export type SettingsFieldErrors = AppSettingsFieldErrors;

export type UpdateAppSettingsActionResult =
  | {
      ok: true;
      message: string;
      settings: AppSettings;
    }
  | {
      ok: false;
      code: "VALIDATION" | "CURRENCY_NOT_FOUND" | "UNKNOWN";
      message: string;
      fieldErrors?: SettingsFieldErrors;
    };

export type UpdateAppSettingsActionInput = {
  businessName: string;
  baseCurrencyCode: string;
  locale: string;
};

export async function updateAppSettingsAction(
  input: UpdateAppSettingsActionInput,
): Promise<UpdateAppSettingsActionResult> {
  const user = await requirePermission("settings.manage");

  try {
    const before = await getAppSettings();
    const settings = await updateAppSettingsRecord({
      businessName: input.businessName,
      baseCurrencyCode: input.baseCurrencyCode,
      locale: input.locale,
    });

    await auditAction({
      userId: user.id,
      action: AUDIT_ACTIONS.SETTINGS_UPDATE,
      module: AUDIT_MODULES.SETTINGS,
      entityType: AUDIT_ENTITY_TYPES.SYSTEM_SETTING,
      entityId: "app",
      beforeValues: toSettingsAuditValues(before),
      afterValues: toSettingsAuditValues(settings),
    });

    return {
      ok: true,
      message: "Settings were saved successfully.",
      settings,
    };
  } catch (error) {
    if (isSettingsError(error)) {
      return {
        ok: false,
        code: error.code,
        message: error.message,
        fieldErrors: error.fieldErrors,
      };
    }

    return {
      ok: false,
      code: "UNKNOWN",
      message: "Unable to save settings. Please try again.",
    };
  }
}
