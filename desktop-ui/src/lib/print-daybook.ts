/** Daybook CSV download + print/PDF ledger (dedicated print window). */

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

  const header = columns
    .map((c) => {
      const align =
        c.key === "debit" ||
        c.key === "credit" ||
        c.key === "balanceAfter" ||
        c.key === "rowNo"
          ? "num"
          : "";
      return `<th class="${align}">${escapeHtml(c.header)}</th>`;
    })
    .join("");

  const body = rows
    .map((row) => {
      const cells = columns
        .map((c) => {
          const align =
            c.key === "debit" ||
            c.key === "credit" ||
            c.key === "balanceAfter" ||
            c.key === "rowNo"
              ? "num"
              : c.key === "description"
                ? "desc"
                : "";
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
          return `<td class="${align}${toneClass}">${escapeHtml(cell(row[c.key]))}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
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
      font-family: "Segoe UI", Tahoma, Arial, sans-serif;
    }
    .daybook-print-root .brand {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-start;
      border-bottom: 2.5px solid #183a31;
      padding-bottom: 10px;
      margin-bottom: 14px;
    }
    .daybook-print-root .brand h1 {
      margin: 0;
      font-size: 20px;
      letter-spacing: 0.03em;
      color: #183a31;
      text-transform: uppercase;
    }
    .daybook-print-root .brand .title {
      margin: 4px 0 0;
      font-size: 15px;
      font-weight: 700;
    }
    .daybook-print-root .meta {
      text-align: right;
      font-size: 11px;
      color: #4b5c55;
      line-height: 1.55;
      white-space: nowrap;
    }
    .daybook-print-root table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 10.5px;
    }
    .daybook-print-root thead { display: table-header-group; }
    .daybook-print-root th,
    .daybook-print-root td {
      border: 1px solid #2a4038;
      padding: 5px 6px;
      vertical-align: top;
      word-wrap: break-word;
    }
    .daybook-print-root th {
      background: #e8ece9;
      color: #122018;
      font-weight: 700;
      text-align: left;
    }
    .daybook-print-root tbody tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .daybook-print-root tbody tr:nth-child(even) td { background: #f3f7f5; }
    .daybook-print-root td.num,
    .daybook-print-root th.num {
      text-align: right;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .daybook-print-root td.money-in {
      color: #1a7a45 !important;
      font-weight: 700;
    }
    .daybook-print-root td.money-out {
      color: #b42318 !important;
      font-weight: 700;
    }
    .daybook-print-root td.desc { font-size: 10px; }
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
      .daybook-print-root th {
        background: #e8ece9 !important;
        color: #122018 !important;
        border: 1px solid #2a4038 !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .daybook-print-root tbody tr:nth-child(even) td {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .daybook-print-root td.money-in,
      .daybook-print-root td.money-out {
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
        <h1>${escapeHtml(meta.businessName ?? "ASMS")}</h1>
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
      <thead><tr>${header}</tr></thead>
      <tbody>${body}</tbody>
    </table>`
    }
    <div class="footer">
      <span>ASMS · Daily Book</span>
      <span>Confidential — internal use</span>
    </div>
  </div>
</body>
</html>`;

  printHtmlInPage(html);
}


