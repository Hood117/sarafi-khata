import type { TransactionDetail } from "@desktop/api";
import { printPage } from "@desktop/api";
import {
  fmtAmountPart,
  formatTransactionLine,
  type AmountPart,
  type TransactionLineLabels,
} from "@desktop/lib/format-transaction-line";
import { txDisplayRef } from "@desktop/lib/tx-ref";

/** Thermal receipt paper width used for HTML / WebView print. */
export const RECEIPT_PRINT_WIDTH_MM = 60;

const RECEIPT_ROOT_ID = "saraf-receipt-print-root";
const RECEIPT_PAGE_STYLE_ID = "saraf-receipt-page-style";

export type TransactionReceiptLabels = {
  receiptTitle: string;
  reference: string;
  date: string;
  time: string;
  customer: string;
  type: string;
  amount: string;
  currency: string;
  description: string;
  status: string;
  thankYou: string;
  sender: string;
  receiver: string;
  cashier: string;
  print: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatWhen(value: string | null | undefined): string {
  if (!value) return "—";
  return value.length >= 19 ? value.slice(0, 19).replace("T", " ") : value.slice(0, 10);
}

/** Measure CSS px per mm so @page height matches the rendered receipt. */
function pxPerMm(): number {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:absolute;left:-9999px;top:0;width:100mm;height:100mm;visibility:hidden;pointer-events:none;";
  document.body.appendChild(probe);
  const w = probe.offsetWidth || 378;
  probe.remove();
  return w / 100;
}

function armExactReceiptPage(widthMm: number, heightMm: number): () => void {
  document.getElementById(RECEIPT_PAGE_STYLE_ID)?.remove();
  const el = document.createElement("style");
  el.id = RECEIPT_PAGE_STYLE_ID;
  // Fixed height (not `auto`) — WebView2/Chromium often mishandles `auto` and
  // leaves a blank first page when combined with break-avoid rules.
  el.textContent = `
@media print {
  @page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
  html, body {
    width: ${widthMm}mm !important;
    height: ${heightMm}mm !important;
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
    overflow: hidden !important;
  }
  body.receipt-printing > *:not(#${RECEIPT_ROOT_ID}) {
    display: none !important;
  }
  #${RECEIPT_ROOT_ID} {
    display: block !important;
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    width: ${widthMm}mm !important;
    max-width: ${widthMm}mm !important;
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
    color: #111 !important;
    overflow: hidden !important;
    z-index: 1 !important;
  }
}
`;
  document.head.appendChild(el);
  return () => el.remove();
}

function receiptShellCss(widthMm: number): string {
  return `
#${RECEIPT_ROOT_ID}, #${RECEIPT_ROOT_ID} * { box-sizing: border-box; }
#${RECEIPT_ROOT_ID} {
  color-scheme: only light;
  background: #fff;
  color: #111;
  font-family: "Courier New", Courier, ui-monospace, monospace;
  font-size: 11px;
  line-height: 1.35;
}
#${RECEIPT_ROOT_ID} .sheet {
  width: ${widthMm}mm;
  max-width: ${widthMm}mm;
  margin: 0;
  padding: 2mm 2.5mm;
  background: #fff;
  color: #111;
}
#${RECEIPT_ROOT_ID} .brand,
#${RECEIPT_ROOT_ID} .tx-print-brand {
  text-align: center;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  margin: 0 0 2px;
  word-break: break-word;
  color: #000;
}
#${RECEIPT_ROOT_ID} .subtitle,
#${RECEIPT_ROOT_ID} .tx-print-subtitle {
  text-align: center;
  font-size: 10px;
  margin: 0 0 6px;
  color: #222;
}
#${RECEIPT_ROOT_ID} .rule,
#${RECEIPT_ROOT_ID} .tx-print-rule {
  border: 0;
  border-top: 1px dashed #111;
  margin: 5px 0;
}
#${RECEIPT_ROOT_ID} .summary,
#${RECEIPT_ROOT_ID} .tx-print-summary {
  text-align: center;
  font-weight: 700;
  font-size: 11px;
  margin: 0 0 6px;
  word-break: break-word;
  color: #000;
}
#${RECEIPT_ROOT_ID} .row,
#${RECEIPT_ROOT_ID} .tx-print-row {
  display: flex;
  justify-content: space-between;
  gap: 6px;
  padding: 1px 0;
  font-size: 10px;
  color: #000;
}
#${RECEIPT_ROOT_ID} .label,
#${RECEIPT_ROOT_ID} .tx-print-row > span {
  color: #333;
  flex: 0 0 36%;
}
#${RECEIPT_ROOT_ID} .value,
#${RECEIPT_ROOT_ID} .tx-print-row > strong {
  flex: 1;
  text-align: right;
  font-weight: 600;
  word-break: break-word;
}
#${RECEIPT_ROOT_ID} .amount,
#${RECEIPT_ROOT_ID} .tx-print-amount {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
#${RECEIPT_ROOT_ID} .thanks,
#${RECEIPT_ROOT_ID} .tx-print-thanks {
  text-align: center;
  margin-top: 8px;
  font-size: 10px;
}
#${RECEIPT_ROOT_ID} .sig,
#${RECEIPT_ROOT_ID} .tx-print-sig {
  display: flex;
  gap: 8px;
  margin-top: 14px;
}
#${RECEIPT_ROOT_ID} .sig div,
#${RECEIPT_ROOT_ID} .tx-print-sig div {
  flex: 1;
  border-top: 1px solid #111;
  padding-top: 4px;
  font-size: 9px;
  text-align: center;
}
`;
}

/**
 * Mount a dedicated receipt print root at the document origin, size the page
 * to the content, and print. Avoids blank first pages from off-screen roots,
 * leftover app chrome, or `page-break-inside: avoid` overflow.
 */
function printReceiptMarkup(innerHtml: string): void {
  document.getElementById(RECEIPT_ROOT_ID)?.remove();
  document.body.classList.remove("receipt-printing", "daybook-printing", "tx-printing");

  const w = RECEIPT_PRINT_WIDTH_MM;
  const root = document.createElement("div");
  root.id = RECEIPT_ROOT_ID;
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = `<style>${receiptShellCss(w)}</style><div class="sheet">${innerHtml}</div>`;

  // Place at origin immediately (not off-screen) so layout height is real
  // and WebView print does not invent a blank leading page.
  root.style.cssText = [
    "position:fixed",
    "left:0",
    "top:0",
    `width:${w}mm`,
    "max-width:60mm",
    "margin:0",
    "padding:0",
    "background:#fff",
    "color:#111",
    "z-index:2147483646",
    "pointer-events:none",
    "overflow:hidden",
  ].join(";");

  document.body.insertBefore(root, document.body.firstChild);
  document.body.classList.add("receipt-printing");

  const sheet = root.querySelector(".sheet") as HTMLElement | null;
  const scale = pxPerMm();
  const contentPx = Math.max(
    sheet?.scrollHeight ?? 0,
    sheet?.offsetHeight ?? 0,
    root.scrollHeight,
    80,
  );
  const heightMm = Math.max(40, Math.ceil(contentPx / scale) + 2);
  const disarm = armExactReceiptPage(w, heightMm);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    document.body.classList.remove("receipt-printing");
    disarm();
    root.remove();
    window.removeEventListener("afterprint", cleanup);
  };

  window.addEventListener("afterprint", cleanup);
  // Two frames: let layout settle at origin before opening the dialog.
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      void printPage();
      window.setTimeout(cleanup, 2500);
    });
  });
}

/**
 * Print the on-page `.tx-print-receipt` sheet (modals / detail views).
 * Clones into a dedicated 60mm root so the app UI cannot create a blank page.
 */
export function printTxReceiptFromDom(): void {
  const source =
    document.querySelector<HTMLElement>(".tx-print-receipt:not([data-print-clone])") ??
    document.querySelector<HTMLElement>(".tx-print-receipt");
  if (!source) return;
  printReceiptMarkup(source.innerHTML);
}

/**
 * Opens a print-ready receipt (black & white, no app chrome).
 * Exactly 60mm wide on a single page sized to the content height.
 */
export function printTransactionReceipt(input: {
  businessName: string;
  detail: TransactionDetail;
  amounts: AmountPart[];
  typeLabel: string;
  statusLabel: string;
  labels: TransactionReceiptLabels;
  txLineLabels?: TransactionLineLabels;
}): void {
  const { businessName, detail, amounts, typeLabel, statusLabel, labels, txLineLabels } =
    input;
  const customer = (detail.customerName ?? detail.walkInName ?? "—").trim() || "—";
  const currency =
    amounts.length === 1
      ? amounts[0].currency
      : amounts.map((a) => a.currency).filter(Boolean).join(" · ") || "—";
  const amountHtml =
    amounts.length === 0
      ? "—"
      : amounts.map((a) => escapeHtml(fmtAmountPart(a))).join(" &middot; ");
  const isTransfer = detail.type.toUpperCase() === "TRANSFER";
  const summary = formatTransactionLine(
    {
      type: detail.type,
      reference: detail.reference,
      customerName: detail.customerName,
      walkInName: detail.walkInName,
      description: detail.description,
      amountSummary: amounts.map((a) => `${a.sign} ${a.currency} ${a.amount}`).join(" · "),
      senderName: detail.senderName,
      receiverName: detail.receiverName,
    },
    txLineLabels,
  );
  const transferAmountHtml = (() => {
    if (!isTransfer || amounts.length === 0) return null;
    const pick =
      amounts.find((a) => a.sign === "−") ??
      amounts.find((a) => a.sign === "+") ??
      amounts[0];
    return escapeHtml(`${pick.amount} ${pick.currency}`.trim());
  })();
  const date = formatWhen(detail.valueDate);
  const time = formatWhen(detail.postedAt ?? detail.createdAt);
  const description = (detail.description ?? "").trim() || "—";
  const sender = (detail.senderName ?? detail.customerName ?? "—").trim() || "—";
  const receiver = (detail.receiverName ?? "—").trim() || "—";
  const shownRef = txDisplayRef(detail);

  const inner = `
    <h1 class="brand">${escapeHtml(businessName)}</h1>
    <p class="subtitle">${escapeHtml(labels.receiptTitle)}</p>
    <hr class="rule" />
    <p class="summary">${escapeHtml(summary)}</p>
    <hr class="rule" />
    <div class="row"><span class="label">${escapeHtml(labels.reference)}</span><span class="value">${escapeHtml(shownRef)}</span></div>
    <div class="row"><span class="label">${escapeHtml(labels.date)}</span><span class="value">${escapeHtml(date)}</span></div>
    <div class="row"><span class="label">${escapeHtml(labels.time)}</span><span class="value">${escapeHtml(time)}</span></div>
    <div class="row"><span class="label">${escapeHtml(labels.customer)}</span><span class="value">${escapeHtml(customer)}</span></div>
    ${
      isTransfer
        ? `<div class="row"><span class="label">${escapeHtml(labels.sender)}</span><span class="value">${escapeHtml(sender)}</span></div>
    <div class="row"><span class="label">${escapeHtml(labels.receiver)}</span><span class="value">${escapeHtml(receiver)}</span></div>`
        : ""
    }
    <div class="row"><span class="label">${escapeHtml(labels.type)}</span><span class="value">${escapeHtml(typeLabel)}</span></div>
    <div class="row"><span class="label">${escapeHtml(labels.amount)}</span><span class="value amount">${transferAmountHtml ?? amountHtml}</span></div>
    <div class="row"><span class="label">${escapeHtml(labels.currency)}</span><span class="value">${escapeHtml(currency)}</span></div>
    <div class="row"><span class="label">${escapeHtml(labels.description)}</span><span class="value">${escapeHtml(description)}</span></div>
    <div class="row"><span class="label">${escapeHtml(labels.status)}</span><span class="value">${escapeHtml(statusLabel)}</span></div>
    <hr class="rule" />
    <p class="thanks">${escapeHtml(labels.thankYou)}</p>
    <div class="sig">
      <div>${escapeHtml(labels.customer)}</div>
      <div>${escapeHtml(labels.cashier)}</div>
    </div>
  `;

  printReceiptMarkup(inner);
}
