import { getSettingsPageData, SettingsView } from "@/features/settings";

export default async function SettingsPage() {
  const { settings, currencies } = await getSettingsPageData();

  return <SettingsView settings={settings} currencies={currencies} />;
}
