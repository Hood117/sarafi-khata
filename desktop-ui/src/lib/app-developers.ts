/** Shared company + developer contacts (dashboard footer + license activation). */
export const APP_COMPANY = {
  name: "Radefy Systems",
  url: "https://www.radefysystems.com/",
  websiteLabel: "www.radefysystems.com",
  email: "hello@radefysystems.com",
} as const;

export const APP_DEVELOPERS = [
  {
    name: "Samsoor",
    email: "samsoor.samander@gmail.com",
    whatsapp: "93764273409",
  },
  {
    name: "Rahmatullah Zadran",
    email: "rahmatzadran@gmail.com",
    whatsapp: "93781736890",
  },
] as const;

export function formatWhatsAppDisplay(digits: string): string {
  if (digits.startsWith("93") && digits.length >= 11) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  }
  return `+${digits}`;
}
