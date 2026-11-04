import type { HawalaDetail, PrinterInfo } from "@desktop/api";
import { listPrinters, printPlainText } from "@desktop/api";
import { getPreferredPrinterName } from "@desktop/lib/preferred-printer";
import { hawalaNumberRef } from "@desktop/lib/tx-ref";
import { formatMoney, parseMoney } from "@desktop/pages/hawala-helpers";

function payoutAmount(detail: HawalaDetail): string {
  const net = (detail.receiveAmount ?? "").trim();
  if (net) return net;
  const gross = parseMoney(detail.amount);
  const fee = parseMoney(detail.ownCommissionAmount ?? "0");
  return formatMoney(Math.max(0, gross - fee));
}

export type HawalaReceiptLabels = {
  title: string;
  hawalaNumber: string;
  sender: string;
  receiver: string;
  collector: string;
  phone: string;
  nationalId: string;
  amount: string;
  netPayout: string;
  currency: string;
  commission: string;
  partnerCommission: string;
  date: string;
  time: string;
  status: string;
  reference: string;
  transaction: string;
  thankYou: string;
  noPrinterConfigured: string;
  printerUnavailable: string;
};

function present(value: string | null | undefined): string {
  const t = value?.trim();
  return t ? t : "—";
}

function formatWhen(value: string | null | undefined): string {
  if (!value) return "—";
  return value.length >= 19
    ? value.slice(0, 19).replace("T", " ")
    : value.slice(0, 10);
}

function lineWidth(formFactor: string): number {
  return formFactor === "thermal" ? 42 : 64;
}

function rule(width: number): string {
  return "-".repeat(width);
}

function row(label: string, value: string, width: number): string {
  const left = `${label}:`;
  const gap = 1;
  const avail = Math.max(8, width - left.length - gap);
  const v = value.trim() || "—";
  if (v.length <= avail) {
    return `${left}${" ".repeat(gap)}${v}`;
  }
  const lines = [left];
  let rest = v;
  while (rest.length > 0) {
    lines.push(rest.slice(0, width));
    rest = rest.slice(width);
  }
  return lines.join("\n");
}

/** Build plain-text receipt from completed Hawala detail (no invented fields). */
export function buildHawalaReceiptText(input: {
  businessName: string;
  detail: HawalaDetail;
  statusLabel: string;
  labels: HawalaReceiptLabels;
  formFactor: string;
}): string {
  const { businessName, detail, statusLabel, labels, formFactor } = input;
  const w = lineWidth(formFactor);
  const net = payoutAmount(detail);
  const lines: string[] = [
    businessName.trim() || "Radefy Sarafi Offline",
    labels.title,
    rule(w),
    row(labels.hawalaNumber, hawalaNumberRef(detail) || present(detail.reference), w),
    row(labels.status, statusLabel, w),
    row(labels.date, formatWhen(detail.valueDate), w),
    row(
      labels.time,
      formatWhen(detail.completedAt ?? detail.updatedAt ?? detail.createdAt),
      w,
    ),
    rule(w),
    row(labels.sender, present(detail.senderName), w),
    row(labels.receiver, present(detail.receiverName), w),
    row(labels.phone, present(detail.receiverPhone), w),
    row(labels.nationalId, present(detail.receiverNationalId), w),
    rule(w),
    row(labels.amount, `${present(detail.amount)} ${present(detail.currencyCode)}`, w),
    row(labels.netPayout, `${present(net)} ${present(detail.currencyCode)}`, w),
    row(labels.commission, present(detail.ownCommissionAmount), w),
    row(labels.partnerCommission, present(detail.partnerCommissionAmount), w),
    rule(w),
  ];
  const txRef =
    present(detail.payoutDisplayRef).replace(/^—$/, "") ||
    present(detail.displayRef).replace(/^—$/, "") ||
    present(detail.reference);
  if (txRef && txRef !== "—") {
    lines.push(row(labels.reference, txRef, w));
  }
  if (detail.payoutTransactionId || detail.transactionId) {
    lines.push(
      row(
        labels.transaction,
        present(detail.payoutTransactionId ?? detail.transactionId),
        w,
      ),
    );
  }
  lines.push(rule(w), labels.thankYou, "");
  return lines.join("\n");
}

export type PrintHawalaReceiptResult =
  | { ok: true; message: string; printer: PrinterInfo }
  | { ok: false; message: string };

/**
 * Resolve preferred printer and send the receipt text. Does not invent ledger data.
 */
export async function printHawalaReceipt(input: {
  businessName: string;
  detail: HawalaDetail;
  statusLabel: string;
  labels: HawalaReceiptLabels;
}): Promise<PrintHawalaReceiptResult> {
  const preferred = getPreferredPrinterName()?.trim() || null;
  if (!preferred) {
    return { ok: false, message: input.labels.noPrinterConfigured };
  }

  let printers: PrinterInfo[] = [];
  try {
    const listed = await listPrinters();
    printers = listed.printers ?? [];
  } catch {
    return { ok: false, message: input.labels.printerUnavailable.replace("{name}", preferred) };
  }

  const printer = printers.find((p) => p.name === preferred);
  if (!printer) {
    return {
      ok: false,
      message: input.labels.printerUnavailable.replace("{name}", preferred),
    };
  }

  const text = buildHawalaReceiptText({
    ...input,
    formFactor: printer.formFactor || "unknown",
  });

  try {
    const result = await printPlainText({
      printerName: printer.name,
      text,
      formFactor: printer.formFactor,
    });
    if (!result.ok) {
      return { ok: false, message: result.message || input.labels.printerUnavailable.replace("{name}", preferred) };
    }
    return { ok: true, message: result.message, printer };
  } catch (err: unknown) {
    const msg =
      err && typeof err === "object" && "message" in err
        ? String((err as { message: unknown }).message)
        : String(err ?? "");
    return {
      ok: false,
      message: msg.trim() || input.labels.printerUnavailable.replace("{name}", preferred),
    };
  }
}
