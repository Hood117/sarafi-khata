import "server-only";

import { findCurrencyByCode } from "@/features/currencies/repositories/currency-repository";
import { SettingsError } from "@/features/settings/domain/errors";
import { SETTING_KEYS } from "@/features/settings/domain/setting-keys";
import type { AppSettings } from "@/features/settings/domain/types";
import {
  toAppSettingsFieldErrors,
  updateAppSettingsSchema,
} from "@/features/settings/schemas/app-settings";
import { upsertSystemSetting } from "@/features/settings/repositories/system-setting-repository";
import { getAppSettings } from "@/features/settings/services/get-app-settings";

export type UpdateAppSettingsResult = AppSettings;

export async function updateAppSettingsRecord(
  input: unknown,
): Promise<UpdateAppSettingsResult> {
  const parsed = updateAppSettingsSchema.safeParse(input);

  if (!parsed.success) {
    throw new SettingsError(
      "VALIDATION",
      "Please correct the highlighted fields.",
      toAppSettingsFieldErrors(parsed.error),
    );
  }

  const data = parsed.data;
  const currency = await findCurrencyByCode(data.baseCurrencyCode);

  if (!currency) {
    throw new SettingsError(
      "CURRENCY_NOT_FOUND",
      "Selected base currency was not found.",
      { baseCurrencyCode: "Selected base currency was not found." },
    );
  }

  if (!currency.isActive) {
    throw new SettingsError(
      "VALIDATION",
      "Please correct the highlighted fields.",
      { baseCurrencyCode: "Base currency must be an active currency." },
    );
  }

  await Promise.all([
    upsertSystemSetting({
      key: SETTING_KEYS.businessName,
      value: data.businessName,
    }),
    upsertSystemSetting({
      key: SETTING_KEYS.baseCurrencyCode,
      value: data.baseCurrencyCode,
    }),
    upsertSystemSetting({
      key: SETTING_KEYS.locale,
      value: data.locale,
    }),
  ]);

  return getAppSettings();
}
