import { openExternalUrl } from "@desktop/api";

/** Normalize a local phone number to WhatsApp digits (country code, no +). */
export function toWhatsAppDigits(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("0")) {
    digits = `93${digits.slice(1)}`;
  } else if (digits.length === 9 && digits.startsWith("7")) {
    digits = `93${digits}`;
  }
  return digits;
}

/**
 * Open WhatsApp Desktop (preferred) or wa.me with a pre-filled message.
 * Uses the native OS opener inside Tauri so it is not blocked like window.open.
 */
export async function openWhatsApp(
  phone: string,
  message: string,
): Promise<boolean> {
  const digits = toWhatsAppDigits(phone);
  if (!digits) return false;
  const text = encodeURIComponent(message);
  const desktop = `whatsapp://send?phone=${digits}&text=${text}`;
  const web = `https://wa.me/${digits}?text=${text}`;
  try {
    await openExternalUrl(desktop);
    return true;
  } catch {
    try {
      await openExternalUrl(web);
      return true;
    } catch {
      const opened = window.open(web, "_blank", "noopener,noreferrer");
      return Boolean(opened);
    }
  }
}
