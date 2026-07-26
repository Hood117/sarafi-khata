/**
 * Public API for the settings feature.
 * Import from this module only — do not reach into internal folders.
 */

export {
  SETTING_KEYS,
  DEFAULT_APP_SETTINGS,
  LOCALE_OPTIONS,
  type SettingKey,
} from "@/features/settings/domain/setting-keys";

export {
  SettingsError,
  isSettingsError,
  type SettingsErrorCode,
  type SettingsField,
} from "@/features/settings/domain/errors";

export type {
  AppSettings,
  SettingsCurrencyOption,
  SettingsPageData,
} from "@/features/settings/domain/types";

export {
  updateAppSettingsSchema,
  toAppSettingsFieldErrors,
  type UpdateAppSettingsInput,
  type AppSettingsFieldErrors,
} from "@/features/settings/schemas/app-settings";

export {
  getSystemSetting,
  listSystemSettings,
  upsertSystemSetting,
  updateSystemSetting,
  type UpsertSystemSettingData,
} from "@/features/settings/repositories/system-setting-repository";

export {
  getAppSettings,
  getBusinessName,
  getBaseCurrencyCode,
} from "@/features/settings/services/get-app-settings";
export { updateAppSettingsRecord } from "@/features/settings/services/update-app-settings";
export { getSettingsPageData } from "@/features/settings/services/get-settings-page-data";

export {
  updateAppSettingsAction,
  type UpdateAppSettingsActionInput,
  type UpdateAppSettingsActionResult,
  type SettingsFieldErrors,
} from "@/features/settings/actions/settings-actions";

export { SettingsView } from "@/features/settings/components/settings-view";
export { AppSettingsForm } from "@/features/settings/components/app-settings-form";
export { SettingsModules } from "@/features/settings/components/settings-modules";
