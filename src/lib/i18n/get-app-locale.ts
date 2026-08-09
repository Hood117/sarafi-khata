import "server-only";

import { cache } from "react";

import { getSystemSetting } from "@/features/settings/repositories/system-setting-repository";
import { isAppLocale, type AppLocale } from "@/lib/i18n/locale";

/** Shared server locale resolver (layout + shell). */
export const getAppLocale = cache(async (): Promise<AppLocale> => {
  try {
    const setting = await getSystemSetting("app.locale");
    const value = setting?.value?.trim() ?? "en";
    return isAppLocale(value) ? value : "en";
  } catch {
    return "en";
  }
});
