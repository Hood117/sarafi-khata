export type AppSettings = {
  businessName: string;
  baseCurrencyCode: string;
  locale: string;
};

export type SettingsCurrencyOption = {
  id: string;
  code: string;
  label: string;
};

export type SettingsPageData = {
  settings: AppSettings;
  currencies: SettingsCurrencyOption[];
};
