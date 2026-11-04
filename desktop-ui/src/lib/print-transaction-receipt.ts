import type { TransactionDetail } from "@desktop/api";
import {
  fmtAmountPart,
  formatTransactionLine,
  type AmountPart,
  type TransactionLineLabels,
} from "@desktop/lib/format-transaction-line";
import { txDisplayRef } from "@desktop/lib/tx-ref";

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

/**
 * Print HTML in-page (no pop-up). Tauri WebView blocks window.open and may
 * ignore iframe.print() — same approach as the daybook ledger printer.
 */
function printHtmlInPage(html: string): void {
  const rootId = "daybook-print-root";
  document.getElementById(rootId)?.remove();
  document.body.classList.remove("daybook-printing");

  const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/i);
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const styles = styleMatch?.[1] ?? "";
  const bodyHtml = bodyMatch?.[1] ?? html;

  const root = document.createElement("div");
  root.id = rootId;
  root.className = "daybook-print-root tx-receipt-print-root";
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = `<style id="daybook-print-styles">${styles}</style>${bodyHtml}`;
  document.body.appendChild(root);
  document.body.classList.add("daybook-printing");

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    document.body.classList.remove("daybook-printing");
    root.remove();
    window.removeEventListener("afterprint", cleanup);
  };

  window.addEventListener("afterprint", cleanup);
  window.setTimeout(() => {
    window.print();
    window.setTimeout(cleanup, 2500);
  }, 60);
}

/**
 * Opens a print-ready receipt (black & white, no app chrome).
 * Uses in-page print so it works in Tauri as well as the browser.
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

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(labels.receiptTitle)} · ${escapeHtml(shownRef)}</title>
  <style>
    .tx-receipt-print-root {
      color-scheme: only light;
      background: #fff;
      color: #111;
      font-family: "Courier New", Courier, ui-monospace, monospace;
      font-size: 13px;
      line-height: 1.45;
    }
    .tx-receipt-print-root * { box-sizing: border-box; }
    .tx-receipt-print-root .sheet {
      width: 80mm;
      max-width: 100%;
      margin: 0 auto;
      padding: 12mm 8mm;
      background: #fff;
      color: #111;
    }
    .tx-receipt-print-root .brand {
      text-align: center;
      font-size: 18px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      margin: 0 0 4px;
    }
    .tx-receipt-print-root .subtitle {
      text-align: center;
      font-size: 12px;
      margin: 0 0 14px;
      color: #222;
    }
    .tx-receipt-print-root .rule {
      border: 0;
      border-top: 1px dashed #111;
      margin: 10px 0;
    }
    .tx-receipt-print-root .summary {
      text-align: center;
      font-weight: 700;
      font-size: 13px;
      margin: 0 0 10px;
    }
    .tx-receipt-print-root .row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 3px 0;
    }
    .tx-receipt-print-root .label {
      color: #333;
      flex: 0 0 38%;
    }
    .tx-receipt-print-root .value {
      flex: 1;
      text-align: right;
      font-weight: 600;
      word-break: break-word;
    }
    .tx-receipt-print-root .amount {
      font-size: 16px;
      font-weight: 700;
      letter-spacing: 0.02em;
    }
    .tx-receipt-print-root .thanks {
      text-align: center;
      margin-top: 18px;
      font-size: 12px;
    }
    .tx-receipt-print-root .sig {
      display: flex;
      gap: 16px;
      margin-top: 28px;
    }
    .tx-receipt-print-root .sig div {
      flex: 1;
      border-top: 1px solid #111;
      padding-top: 6px;
      font-size: 11px;
      text-align: center;
    }
    .tx-receipt-print-root .screen-only { display: none !important; }
    @media print {
      @page { margin: 8mm; size: auto; }
      .tx-receipt-print-root .sheet { width: 100%; padding: 0; }
    }
  </style>
</head>
<body>
  <div class="sheet">
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
  </div>
</body>
</html>`;

  printHtmlInPage(html);
}
