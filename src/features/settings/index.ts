/**
 * Public API for the settings feature.
 * Import from this module only — do not reach into internal folders.
 */

export {
  getSystemSetting,
  listSystemSettings,
  upsertSystemSetting,
  updateSystemSetting,
  type UpsertSystemSettingData,
} from "@/features/settings/repositories/system-setting-repository";
