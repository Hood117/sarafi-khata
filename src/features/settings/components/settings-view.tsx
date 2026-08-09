"use client";

import { useEffect, useState } from "react";

import { AppSettingsForm } from "@/features/settings/components/app-settings-form";
import { SettingsModules } from "@/features/settings/components/settings-modules";
import type {
  AppSettings,
  SettingsCurrencyOption,
} from "@/features/settings/domain/types";

type SettingsViewProps = {
  settings: AppSettings;
  currencies: SettingsCurrencyOption[];
};

export function SettingsView({ settings, currencies }: SettingsViewProps) {
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!successMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setSuccessMessage(null);
    }, 4000);

    return () => window.clearTimeout(timeoutId);
  }, [successMessage]);

  return (
    <div className="mx-auto max-w-2xl space-y-2">
      {successMessage ? (
        <div
          className="bg-success/10 text-success rounded-lg px-3 py-2 text-sm"
          role="status"
        >
          {successMessage}
        </div>
      ) : null}

      <AppSettingsForm
        initialSettings={settings}
        currencies={currencies}
        onSuccess={setSuccessMessage}
      />

      <SettingsModules />
    </div>
  );
}
