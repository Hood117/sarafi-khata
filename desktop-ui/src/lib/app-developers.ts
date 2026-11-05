/** Shared company + license activation contact. */
export const APP_COMPANY = {
  name: "Radefy Systems",
  url: "https://www.radefysystems.com/",
  websiteLabel: "www.radefysystems.com",
  email: "hello@radefysystems.com",
} as const;

/** Primary contact shown on the license activation page. */
export const APP_LICENSE_CONTACT = {
  name: "Rahim Rad",
  whatsapp: "93771707272",
} as const;

export function formatWhatsAppDisplay(digits: string): string {
  if (digits.startsWith("93") && digits.length >= 11) {
    // +93 77 170 7272
    return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  return `+${digits}`;
}
