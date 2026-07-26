import "server-only";

import {
  DEFAULT_APP_SETTINGS,
  SETTING_KEYS,
} from "@/features/settings/domain/setting-keys";
import type { AppSettings } from "@/features/settings/domain/types";
import {
  getSystemSetting,
  listSystemSettings,
} from "@/features/settings/repositories/system-setting-repository";

function readSetting(
  map: Map<string, string>,
  key: string,
  fallback: string,
): string {
  const value = map.get(key)?.trim();
  return value && value.length > 0 ? value : fallback;
}

export async function getAppSettings(): Promise<AppSettings> {
  const rows = await listSystemSettings();
  const map = new Map(rows.map((row) => [row.key, row.value] as const));

  const locale = readSetting(
    map,
    SETTING_KEYS.locale,
    DEFAULT_APP_SETTINGS.locale,
  );

  return {
    businessName: readSetting(
      map,
      SETTING_KEYS.businessName,
      DEFAULT_APP_SETTINGS.businessName,
    ),
    baseCurrencyCode: readSetting(
      map,
      SETTING_KEYS.baseCurrencyCode,
      DEFAULT_APP_SETTINGS.baseCurrencyCode,
    ).toUpperCase(),
    // Only English is supported in the UI for now.
    locale: locale === "en" ? "en" : DEFAULT_APP_SETTINGS.locale,
  };
}

export async function getBusinessName(): Promise<string> {
  const setting = await getSystemSetting(SETTING_KEYS.businessName);
  const value = setting?.value.trim();
  return value && value.length > 0
    ? value
    : DEFAULT_APP_SETTINGS.businessName;
}

export async function getBaseCurrencyCode(): Promise<string> {
  const setting = await getSystemSetting(SETTING_KEYS.baseCurrencyCode);
  const value = setting?.value.trim().toUpperCase();
  return value && value.length > 0
    ? value
    : DEFAULT_APP_SETTINGS.baseCurrencyCode;
}
