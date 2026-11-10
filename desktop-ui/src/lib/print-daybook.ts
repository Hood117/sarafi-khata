/** Daybook CSV download + print/PDF ledger (in-page print sheet). */

import { saveTextExport } from "@desktop/api";

export type DaybookExportColumn = {
  key: string;
  header: string;
};

export type DaybookExportRow = Record<string, string>;

export type DaybookExportMeta = {
  title: string;
  businessName?: string;
  businessDate?: string;
  generatedBy?: string;
  generatedAt?: string;
  currencyFilter?: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function cell(value: string | number | null | undefined): string {
  return value == null ? "" : String(value);
}

/** Format plain amount strings (9700 → 9,700) while keeping currency suffixes. */
function formatPrintAmount(raw: string): string {
  const text = raw.trim();
  if (!text) return "";
  return text.replace(/-?\d+(?:\.\d+)?/g, (num) => {
    const n = Number(num);
    if (!Number.isFinite(n)) return num;
    return n.toLocaleString("en-US", {
      maximumFractionDigits: 4,
    });
  });
}

function buildCsv(
  columns: DaybookExportColumn[],
  rows: DaybookExportRow[],
  meta?: DaybookExportMeta,
): string {
  const lines: string[] = [];
  if (meta?.businessName) lines.push(escapeCsv(meta.businessName));
  if (meta?.title) lines.push(escapeCsv(meta.title));
  if (meta?.businessDate) lines.push(escapeCsv(`Date: ${meta.businessDate}`));
  if (meta?.currencyFilter) lines.push(escapeCsv(`Currency: ${meta.currencyFilter}`));
  if (meta?.generatedAt) lines.push(escapeCsv(`Generated: ${meta.generatedAt}`));
  if (meta?.generatedBy) lines.push(escapeCsv(`By: ${meta.generatedBy}`));
  if (lines.length) lines.push("");
  lines.push(columns.map((c) => escapeCsv(c.header)).join(","));
  for (const row of rows) {
    lines.push(columns.map((c) => escapeCsv(cell(row[c.key]))).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}`;
}

function browserDownloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Save CSV via Tauri Downloads folder when available; otherwise browser download. */
export async function downloadDaybookCsv(
  filename: string,
  columns: DaybookExportColumn[],
  rows: DaybookExportRow[],
  meta?: DaybookExportMeta,
): Promise<string | null> {
  const safeName = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  const csv = buildCsv(columns, rows, meta);
  try {
    const saved = await saveTextExport({ filename: safeName, contents: csv });
    return saved.path;
  } catch {
    browserDownloadCsv(safeName, csv);
    return null;
  }
}

/**
 * Print a ledger HTML sheet in-page (no pop-up). Used because Tauri WebView
 * blocks window.open and may ignore iframe.print().
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
  root.className = "daybook-print-root";
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
    // Some WebViews never fire afterprint.
    window.setTimeout(cleanup, 2500);
  }, 60);
}

function colClass(key: string): string {
  switch (key) {
    case "rowNo":
      return "col-row num";
    case "valueDate":
      return "col-when";
    case "accountCode":
      return "col-code";
    case "accountName":
      return "col-name";
    case "oppositeAccount":
      return "col-opp";
    case "description":
      return "col-desc";
    case "debit":
      return "col-debit num";
    case "credit":
      return "col-credit num";
    case "balanceAfter":
      return "col-balance num";
    case "currencyCode":
      return "col-ccy";
    case "reference":
      return "col-ref";
    default:
      return "";
  }
}

function displayCell(key: string, raw: string): string {
  if (key === "valueDate") return raw.slice(0, 10);
  if (key === "debit" || key === "credit" || key === "balanceAfter") {
    return formatPrintAmount(raw);
  }
  return raw;
}

/**
 * Opens a landscape ledger sheet and triggers the system print dialog
 * (user can choose “Save as PDF”). No pop-up window required.
 */
export function printDaybookLedger(input: {
  columns: Array<{ key: string; header: string }>;
  rows: Array<Record<string, string | number | null | undefined>>;
  meta: DaybookExportMeta;
  emptyLabel?: string;
  printLabel?: string;
}): void {
  const { columns, rows, meta } = input;
  const emptyLabel = input.emptyLabel ?? "No journal lines for this day.";
  const generatedAt = meta.generatedAt ?? new Date().toLocaleString();

  const colgroup = columns
    .map((c) => {
      const width =
        c.key === "rowNo"
          ? "3%"
          : c.key === "valueDate"
            ? "7%"
            : c.key === "accountCode" || c.key === "oppositeAccount"
              ? "5%"
              : c.key === "accountName"
                ? "9%"
                : c.key === "description"
                  ? "28%"
                  : c.key === "debit" || c.key === "credit"
                    ? "7%"
                    : c.key === "balanceAfter"
                      ? "9%"
                      : c.key === "currencyCode"
                        ? "5%"
                        : c.key === "reference"
                          ? "8%"
                          : undefined;
      return width ? `<col style="width:${width}" />` : "<col />";
    })
    .join("");

  const header = columns
    .map((c) => `<th class="${colClass(c.key)}">${escapeHtml(c.header)}</th>`)
    .join("");

  const body = rows
    .map((row, index) => {
      const cells = columns
        .map((c) => {
          const toneKey =
            c.key === "debit"
              ? "_debitTone"
              : c.key === "credit"
                ? "_creditTone"
                : c.key === "balanceAfter"
                  ? "_balanceTone"
                  : "";
          const tone = toneKey ? String(row[toneKey] ?? "") : "";
          const toneClass =
            tone === "in" ? " money-in" : tone === "out" ? " money-out" : "";
          const raw = cell(row[c.key]);
          const shown = displayCell(c.key, raw);
          return `<td class="${colClass(c.key)}${toneClass}">${escapeHtml(shown)}</td>`;
        })
        .join("");
      const zebra = index % 2 === 1 ? " is-alt" : "";
      return `<tr class="${zebra.trim()}">${cells}</tr>`;
    })
    .join("");

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(meta.title)}</title>
  <style>
    .daybook-print-root .sheet {
      padding: 0;
      color: #122018;
      font-family: "Segoe UI", Tahoma, "Noto Naskh Arabic", "Noto Sans Arabic", Arial, sans-serif;
    }
    .daybook-print-root .brand {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-start;
      border-bottom: 2px solid #2f5d8c;
      padding-bottom: 10px;
      margin-bottom: 12px;
    }
    .daybook-print-root .brand h1 {
      margin: 0;
      font-size: 18px;
      letter-spacing: 0.02em;
      color: #1a3354;
      text-transform: uppercase;
    }
    .daybook-print-root .brand .title {
      margin: 4px 0 0;
      font-size: 14px;
      font-weight: 700;
      color: #243447;
    }
    .daybook-print-root .meta {
      text-align: right;
      font-size: 10.5px;
      color: #5a6b78;
      line-height: 1.5;
      white-space: nowrap;
    }
    .daybook-print-root table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 10.5px;
      line-height: 1.35;
    }
    .daybook-print-root thead { display: table-header-group; }
    .daybook-print-root th,
    .daybook-print-root td {
      border: 1px solid #c5d0ca;
      padding: 6px 7px;
      vertical-align: middle;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .daybook-print-root th {
      background: #e8eef5;
      color: #1a3354;
      font-weight: 700;
      font-size: 9.5px;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      text-align: start;
      vertical-align: bottom;
      border-bottom: 1.5px solid #8aa0b5;
    }
    .daybook-print-root th.num { text-align: end; }
    .daybook-print-root tbody tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .daybook-print-root tbody tr.is-alt td:not(.money-in):not(.money-out) {
      background: #f5f8f6;
    }
    .daybook-print-root td {
      color: #1c2a33;
      text-align: start;
    }
    .daybook-print-root td.num,
    .daybook-print-root th.num {
      text-align: end;
      font-variant-numeric: tabular-nums;
      font-weight: 650;
      white-space: nowrap;
      font-feature-settings: "tnum" 1;
    }
    .daybook-print-root td.col-row {
      text-align: center;
      color: #6b7a84;
      font-weight: 600;
    }
    .daybook-print-root td.col-when,
    .daybook-print-root td.col-code,
    .daybook-print-root td.col-opp,
    .daybook-print-root td.col-ccy,
    .daybook-print-root td.col-ref {
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }
    .daybook-print-root td.col-code,
    .daybook-print-root td.col-opp,
    .daybook-print-root td.col-ref {
      font-weight: 700;
      font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
      font-size: 10px;
    }
    .daybook-print-root td.col-name {
      font-weight: 600;
    }
    .daybook-print-root td.col-desc {
      font-size: 10.5px;
      line-height: 1.4;
      vertical-align: top;
      text-align: start;
    }
    .daybook-print-root td.col-debit {
      background: rgba(180, 35, 24, 0.04);
    }
    .daybook-print-root td.col-credit {
      background: rgba(26, 122, 69, 0.05);
    }
    .daybook-print-root td.money-in {
      color: #1a7a45 !important;
      font-weight: 700;
      background: rgba(26, 122, 69, 0.1) !important;
    }
    .daybook-print-root td.money-out {
      color: #b42318 !important;
      font-weight: 700;
      background: rgba(180, 35, 24, 0.08) !important;
    }
    .daybook-print-root td.col-balance {
      font-weight: 750;
    }
    .daybook-print-root .empty {
      border: 1px dashed #9aafa6;
      padding: 28px;
      text-align: center;
      color: #6b7a74;
    }
    .daybook-print-root .footer {
      margin-top: 12px;
      padding-top: 8px;
      border-top: 1px solid #c5d2cc;
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: #6b7a74;
    }
    @page { size: A4 landscape; margin: 8mm; }
    @media print {
      .daybook-print-root thead {
        display: table-header-group !important;
      }
      .daybook-print-root th,
      .daybook-print-root td.money-in,
      .daybook-print-root td.money-out,
      .daybook-print-root tbody tr.is-alt td:not(.money-in):not(.money-out),
      .daybook-print-root td.col-debit,
      .daybook-print-root td.col-credit {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="brand">
      <div>
        <h1>${escapeHtml(meta.businessName ?? "Radefy Sarafi Offline")}</h1>
        <p class="title">${escapeHtml(meta.title)}</p>
      </div>
      <div class="meta">
        ${meta.businessDate ? `<div>Date: ${escapeHtml(meta.businessDate)}</div>` : ""}
        ${meta.currencyFilter ? `<div>Currency: ${escapeHtml(meta.currencyFilter)}</div>` : ""}
        <div>Generated: ${escapeHtml(generatedAt)}</div>
        ${meta.generatedBy ? `<div>By: ${escapeHtml(meta.generatedBy)}</div>` : ""}
        <div>Rows: ${rows.length}</div>
      </div>
    </div>
    ${
      rows.length === 0
        ? `<div class="empty">${escapeHtml(emptyLabel)}</div>`
        : `<table>
      <colgroup>${colgroup}</colgroup>
      <thead><tr>${header}</tr></thead>
      <tbody>${body}</tbody>
    </table>`
    }
    <div class="footer">
      <span>Radefy Sarafi Offline · Daily Book</span>
      <span>Confidential — internal use</span>
    </div>
  </div>
</body>
</html>`;

  printHtmlInPage(html);
}
