import { getHawala, getPartner, type HawalaDetail } from "@desktop/api";
import { openWhatsApp } from "@desktop/lib/whatsapp";

export function buildHawalaWhatsAppMessage(
  detail: HawalaDetail,
  template: string,
): string {
  const paidAmount = detail.amount || "—";
  const paidCurrency = detail.currencyCode || "—";
  const receiveAmount = detail.receiveAmount?.trim() || paidAmount;
  const receiveCurrency =
    detail.receiveCurrencyCode?.trim() || paidCurrency;
  const address = [detail.destinationCity, detail.destinationCountry]
    .filter(Boolean)
    .join(", ");
  const reference =
    detail.displayRef?.trim() || detail.reference?.trim() || "—";

  return template
    .replace("{reference}", reference)
    .replace("{sender}", detail.senderName || "—")
    .replace("{receiver}", detail.receiverName || "—")
    .replace("{paidAmount}", paidAmount)
    .replace("{paidCurrency}", paidCurrency)
    .replace("{receiveAmount}", receiveAmount)
    .replace("{receiveCurrency}", receiveCurrency)
    .replace("{partner}", detail.partnerSarafi || "—")
    .replace("{address}", address || "—");
}

/**
 * Load hawala (by hawala id or transaction id), resolve partner phone, open WhatsApp.
 */
export async function sendHawalaWhatsAppToPartner(
  hawalaOrTransactionId: string,
  messageTemplate: string,
): Promise<
  | { ok: true }
  | { ok: false; reason: "missing_phone" | "load_failed"; error?: string }
> {
  try {
    const detail = await getHawala(hawalaOrTransactionId);
    let phone = "";
    if (detail.partnerSarafiId) {
      try {
        const partner = await getPartner(detail.partnerSarafiId);
        phone = partner.phone?.trim() || "";
      } catch {
        phone = "";
      }
    }
    if (!phone) {
      return { ok: false, reason: "missing_phone" };
    }
    const message = buildHawalaWhatsAppMessage(detail, messageTemplate);
    if (!(await openWhatsApp(phone, message))) {
      return { ok: false, reason: "missing_phone" };
    }
    return { ok: true };
  } catch (err: unknown) {
    return {
      ok: false,
      reason: "load_failed",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
