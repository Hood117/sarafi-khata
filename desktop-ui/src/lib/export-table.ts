/**
 * Table export for desktop reports / daybook.
 * Excel SpreadsheetML (.xls) with content-based column widths + RTL for FA/PS.
 * CSV kept as a simple UTF-8 BOM fallback.
 */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import { printPage, saveBytesExport, saveTextExport } from "@desktop/api";
import {
  ensurePdfArabicFont,
  hasArabicScript,
  PDF_ARABIC_FONT,
  shapePdfText,
} from "@desktop/lib/pdf-arabic";

export type ExportColumn = {
  key: string;
  header: string;
  /** Hint for default width when content is short. */
  kind?: "text" | "description" | "amount" | "date" | "ref" | "count";
};

export type ExportRow = Record<string, string | number | null | undefined>;

export type ExportMeta = {
  title: string;
  businessName?: string;
  subtitle?: string;
  periodLabel?: string;
  generatedBy?: string;
  generatedAt?: string;
  /** When true, Excel sheet opens right-to-left (Dari / Pashto). */
  rtl?: boolean;
};

function cellValue(value: string | number | null | undefined): string {
  if (value == null) return "";
  return String(value);
}

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function kindFloor(kind: ExportColumn["kind"]): number {
  switch (kind) {
    case "description":
      return 48;
    case "text":
      return 22;
    case "amount":
      return 14;
    case "date":
      return 16;
    case "ref":
      return 14;
    case "count":
      return 8;
    default:
      return 12;
  }
}

function kindCeil(kind: ExportColumn["kind"]): number {
  switch (kind) {
    case "description":
      return 80;
    case "text":
      return 40;
    case "amount":
      return 22;
    case "date":
      return 22;
    case "ref":
      return 24;
    case "count":
      return 12;
    default:
      return 36;
  }
}

/** Excel character-ish width from header + sample content. */
export function columnWidthChars(
  column: ExportColumn,
  rows: ExportRow[],
): number {
  let max = column.header.length;
  for (const row of rows) {
    const len = cellValue(row[column.key]).length;
    if (len > max) max = len;
  }
  // Prefer description room even when sample rows are short.
  const floored = Math.max(max + 2, kindFloor(column.kind));
  return Math.min(kindCeil(column.kind), floored);
}

function buildCsv(
  columns: ExportColumn[],
  rows: ExportRow[],
  meta?: ExportMeta,
): string {
  const lines: string[] = [];
  if (meta?.businessName) lines.push(escapeCsv(meta.businessName));
  if (meta?.title) lines.push(escapeCsv(meta.title));
  if (meta?.subtitle) lines.push(escapeCsv(meta.subtitle));
  if (meta?.periodLabel) lines.push(escapeCsv(meta.periodLabel));
  if (meta?.generatedAt) lines.push(escapeCsv(`Generated: ${meta.generatedAt}`));
  if (meta?.generatedBy) lines.push(escapeCsv(`By: ${meta.generatedBy}`));
  if (lines.length) lines.push("");
  lines.push(columns.map((c) => escapeCsv(c.header)).join(","));
  for (const row of rows) {
    lines.push(columns.map((c) => escapeCsv(cellValue(row[c.key]))).join(","));
  }
  // BOM + optional RLM so Excel opens UTF-8 (and hints RTL for FA/PS).
  const rtlMark = meta?.rtl ? "\u200F" : "";
  return `\uFEFF${rtlMark}${lines.join("\r\n")}`;
}

function buildExcelXml(
  columns: ExportColumn[],
  rows: ExportRow[],
  meta: ExportMeta,
): string {
  const info = {
    businessName: meta.businessName ?? "ASMS",
    title: meta.title,
    subtitle: meta.subtitle,
    periodLabel: meta.periodLabel,
    generatedAt: meta.generatedAt ?? new Date().toLocaleString(),
    generatedBy: meta.generatedBy,
    rtl: Boolean(meta.rtl),
  };
  const colCount = Math.max(columns.length, 1);

  const metaRows = [
    `<Row ss:StyleID="Title"><Cell ss:MergeAcross="${colCount - 1}"><Data ss:Type="String">${escapeXml(info.businessName)}</Data></Cell></Row>`,
    `<Row ss:StyleID="Subtitle"><Cell ss:MergeAcross="${colCount - 1}"><Data ss:Type="String">${escapeXml(info.title)}</Data></Cell></Row>`,
    info.subtitle
      ? `<Row><Cell ss:MergeAcross="${colCount - 1}"><Data ss:Type="String">${escapeXml(info.subtitle)}</Data></Cell></Row>`
      : "",
    info.periodLabel
      ? `<Row><Cell ss:MergeAcross="${colCount - 1}"><Data ss:Type="String">${escapeXml(info.periodLabel)}</Data></Cell></Row>`
      : "",
    `<Row><Cell ss:MergeAcross="${colCount - 1}"><Data ss:Type="String">${escapeXml(`Generated: ${info.generatedAt}`)}</Data></Cell></Row>`,
    info.generatedBy
      ? `<Row><Cell ss:MergeAcross="${colCount - 1}"><Data ss:Type="String">${escapeXml(`By: ${info.generatedBy}`)}</Data></Cell></Row>`
      : "",
    `<Row></Row>`,
  ]
    .filter(Boolean)
    .join("\n");

  const headerCells = columns
    .map(
      (c) =>
        `<Cell ss:StyleID="Header"><Data ss:Type="String">${escapeXml(c.header)}</Data></Cell>`,
    )
    .join("");

  const bodyRows = rows
    .map((row, index) => {
      const style = index % 2 === 0 ? "Cell" : "AltCell";
      const cells = columns
        .map((c) => {
          const value = cellValue(row[c.key]);
          const isNumber = value !== "" && /^-?\d+(\.\d+)?$/.test(value.trim());
          return `<Cell ss:StyleID="${style}"><Data ss:Type="${isNumber ? "Number" : "String"}">${escapeXml(value)}</Data></Cell>`;
        })
        .join("");
      return `<Row>${cells}</Row>`;
    })
    .join("\n");

  const columnDefs = columns
    .map((c) => {
      const chars = columnWidthChars(c, rows);
      // SpreadsheetML width ≈ character count * ~5.5
      const width = Math.round(chars * 5.5);
      return `<Column ss:AutoFitWidth="0" ss:Width="${width}"/>`;
    })
    .join("\n");

  const freezeAt = 7;
  const rtlOpt = info.rtl ? "<DisplayRightToLeft/>" : "";

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Title"><Font ss:Bold="1" ss:Size="16"/><Alignment ss:Horizontal="Left" ss:ReadingOrder="${info.rtl ? "RightToLeft" : "LeftToRight"}"/></Style>
  <Style ss:ID="Subtitle"><Font ss:Bold="1" ss:Size="12"/><Alignment ss:Horizontal="Left" ss:ReadingOrder="${info.rtl ? "RightToLeft" : "LeftToRight"}"/></Style>
  <Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#183A31" ss:Pattern="Solid"/><Alignment ss:Horizontal="Left" ss:Vertical="Center" ss:ReadingOrder="${info.rtl ? "RightToLeft" : "LeftToRight"}" ss:WrapText="1"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/></Borders></Style>
  <Style ss:ID="Cell"><Alignment ss:Vertical="Center" ss:ReadingOrder="${info.rtl ? "RightToLeft" : "LeftToRight"}" ss:WrapText="1"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DDDDDD"/></Borders></Style>
  <Style ss:ID="AltCell"><Interior ss:Color="#F5F8F7" ss:Pattern="Solid"/><Alignment ss:Vertical="Center" ss:ReadingOrder="${info.rtl ? "RightToLeft" : "LeftToRight"}" ss:WrapText="1"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DDDDDD"/></Borders></Style>
 </Styles>
 <Worksheet ss:Name="Report">
  <Table>
   ${columnDefs}
   ${metaRows}
   <Row>${headerCells}</Row>
   ${bodyRows}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   ${rtlOpt}
   <FreezePanes/>
   <FrozenNoSplit/>
   <SplitHorizontal>${freezeAt}</SplitHorizontal>
   <TopRowBottomPane>${freezeAt}</TopRowBottomPane>
  </WorksheetOptions>
 </Worksheet>
</Workbook>`;
}

function browserDownload(filename: string, mime: string, content: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function persistFile(
  filename: string,
  contents: string,
  mime: string,
): Promise<string | null> {
  try {
    const saved = await saveTextExport({ filename, contents });
    return saved.path;
  } catch {
    browserDownload(filename, mime, contents);
    return null;
  }
}

/** Preferred export: Excel with widths + RTL. */
export async function exportTableExcel(
  filename: string,
  columns: ExportColumn[],
  rows: ExportRow[],
  meta: ExportMeta,
): Promise<string | null> {
  const name = filename.endsWith(".xls") ? filename : `${filename.replace(/\.csv$/i, "")}.xls`;
  const xml = buildExcelXml(columns, rows, meta);
  return persistFile(
    name,
    xml,
    "application/vnd.ms-excel",
  );
}

/** Plain CSV (UTF-8 BOM, optional RTL mark). */
export async function exportTableCsv(
  filename: string,
  columns: ExportColumn[],
  rows: ExportRow[],
  meta?: ExportMeta,
): Promise<string | null> {
  const name = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  const csv = buildCsv(columns, rows, meta);
  return persistFile(name, csv, "text/csv;charset=utf-8");
}

/**
 * Export both Excel (primary) and announce path.
 * Falls back to CSV-only if needed — Excel is the main artifact for widths/RTL.
 */
export async function exportTable(
  filenameBase: string,
  columns: ExportColumn[],
  rows: ExportRow[],
  meta: ExportMeta,
): Promise<string | null> {
  return exportTableExcel(filenameBase, columns, rows, meta);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * In-page print / Save-as-PDF sheet (no pop-up — works in Tauri WebView).
 */
export function printReportSheet(input: {
  columns: ExportColumn[];
  rows: ExportRow[];
  meta: ExportMeta;
  emptyLabel?: string;
}): void {
  const { columns, rows, meta } = input;
  const emptyLabel = input.emptyLabel ?? "No rows.";
  const generatedAt = meta.generatedAt ?? new Date().toLocaleString();
  const dir = meta.rtl ? "rtl" : "ltr";

  const header = columns
    .map((c) => {
      const align =
        c.kind === "amount" || c.kind === "count" ? "num" : "";
      return `<th class="${align}">${escapeHtml(c.header)}</th>`;
    })
    .join("");

  const body = rows
    .map((row) => {
      const cells = columns
        .map((c) => {
          const align =
            c.kind === "amount" || c.kind === "count"
              ? "num"
              : c.kind === "description"
                ? "desc"
                : "";
          let toneClass = "";
          if (c.kind === "amount") {
            const raw = String(row[c.key] ?? "")
              .replace(/,/g, "")
              .replace(/−/g, "-")
              .trim();
            const n = Number.parseFloat(raw);
            if (Number.isFinite(n) && n > 0) toneClass = " money-in";
            else if (Number.isFinite(n) && n < 0) toneClass = " money-out";
            // Daybook-style explicit tones (when provided)
            const explicit = String(row[`_${c.key}Tone`] ?? "");
            if (explicit === "in") toneClass = " money-in";
            if (explicit === "out") toneClass = " money-out";
          }
          return `<td class="${align}${toneClass}">${escapeHtml(cellValue(row[c.key]))}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  const html = `<!doctype html>
<html lang="${meta.rtl ? "fa" : "en"}" dir="${dir}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(meta.title)}</title>
  <style>
    #report-print-root .sheet {
      padding: 0;
      color: #0f1b2d;
      font-family: "Segoe UI", Tahoma, Arial, sans-serif;
      direction: ${dir};
    }
    #report-print-root .brand {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-start;
      border-bottom: 3px solid #021024;
      padding-bottom: 10px;
      margin-bottom: 14px;
    }
    #report-print-root .brand h1 {
      margin: 0;
      font-size: 20px;
      color: #021024;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    #report-print-root .brand .title {
      margin: 4px 0 0;
      font-size: 15px;
      font-weight: 700;
      color: #0b6e99;
    }
    #report-print-root .meta {
      text-align: ${meta.rtl ? "left" : "right"};
      font-size: 11px;
      color: #4a5b72;
      line-height: 1.55;
    }
    #report-print-root table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 10.5px;
    }
    #report-print-root thead { display: table-header-group; }
    #report-print-root th,
    #report-print-root td {
      border: 1px solid #c3cfdf !important;
      padding: 5px 6px;
      vertical-align: top;
      word-wrap: break-word;
      color: #0f1b2d !important;
    }
    #report-print-root th {
      background: #021024 !important;
      color: #ffffff !important;
      border-color: #021024 !important;
      font-weight: 700;
      text-align: start;
    }
    #report-print-root tbody tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    #report-print-root tbody tr:nth-child(even) td { background: #f2f6fb; }
    #report-print-root td.num,
    #report-print-root th.num {
      text-align: ${meta.rtl ? "left" : "right"};
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    #report-print-root td.money-in {
      color: #1a7a45 !important;
      font-weight: 700;
    }
    #report-print-root td.money-out {
      color: #b42318 !important;
      font-weight: 700;
    }
    #report-print-root td.desc { font-size: 10px; }
    #report-print-root .empty {
      border: 1px dashed #9fb0c6;
      padding: 28px;
      text-align: center;
      color: #5d7697;
    }
    #report-print-root .footer {
      margin-top: 12px;
      padding-top: 8px;
      border-top: 1px solid #c3cfdf;
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: #5d7697;
    }
    @page { size: A4 landscape; margin: 8mm; }
    #report-print-root,
    #report-print-root * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
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
        ${meta.periodLabel ? `<div>${escapeHtml(meta.periodLabel)}</div>` : ""}
        <div>${escapeHtml(generatedAt)}</div>
        ${meta.generatedBy ? `<div>${escapeHtml(meta.generatedBy)}</div>` : ""}
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
      <span>ASMS · Reports</span>
      <span>Confidential</span>
    </div>
  </div>
</body>
</html>`;

  const rootId = "report-print-root";
  document.getElementById(rootId)?.remove();
  document.body.classList.remove("daybook-printing");

  const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/i);
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const styles = styleMatch?.[1] ?? "";
  const bodyHtml = bodyMatch?.[1] ?? html;

  const root = document.createElement("div");
  root.id = rootId;
  root.className = "daybook-print-root report-print-root";
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = `<style>${styles}</style>${bodyHtml}`;
  document.body.appendChild(root);
  document.body.classList.add("daybook-printing");

  // The print dialog is non-blocking on Windows and macOS, so the sheet stays
  // until afterprint (or the next print) instead of on a timer.
  const cleanup = () => {
    document.body.classList.remove("daybook-printing");
    root.remove();
  };
  window.addEventListener("afterprint", cleanup, { once: true });
  window.setTimeout(() => void printPage(), 60);
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function safePdfFilename(title: string): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const base = title
    .trim()
    .replace(/[^\w\u0600-\u06FF\- .]+/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return `${base || "report"}-${stamp}.pdf`;
}

function amountTone(
  row: ExportRow,
  column: ExportColumn,
): "in" | "out" | null {
  if (column.kind !== "amount") return null;
  const explicit = String(row[`_${column.key}Tone`] ?? "");
  if (explicit === "in") return "in";
  if (explicit === "out") return "out";
  const raw = String(row[column.key] ?? "")
    .replace(/,/g, "")
    .replace(/−/g, "-")
    .trim();
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n === 0) return null;
  return n > 0 ? "in" : "out";
}

/**
 * Build a landscape A4 PDF (navy theme) and save it to Downloads.
 * Returns the absolute path when saved via Tauri, otherwise null (browser download).
 */
export async function savePdfReportSheet(input: {
  columns: ExportColumn[];
  rows: ExportRow[];
  meta: ExportMeta;
  emptyLabel?: string;
  filename?: string;
}): Promise<string | null> {
  const { rows, meta } = input;
  const emptyLabel = input.emptyLabel ?? "No rows.";
  const generatedAt = meta.generatedAt ?? new Date().toLocaleString();
  const filename = input.filename ?? safePdfFilename(meta.title);
  const rtl = Boolean(meta.rtl);
  // In RTL, reverse columns so the table reads the same way as the on-screen ledger.
  const columns = rtl ? [...input.columns].reverse() : input.columns;

  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 10;
  const navy = "#021024";
  const titleBlue = "#0b6e99";
  const muted = "#4a5b72";
  const ink = "#0f1b2d";
  const moneyIn = "#1a7a45";
  const moneyOut = "#b42318";

  const sampleText = [
    meta.title,
    meta.periodLabel ?? "",
    emptyLabel,
    ...columns.map((c) => c.header),
    ...rows.flatMap((row) => columns.map((c) => cellValue(row[c.key]))),
  ].join(" ");
  const needsArabic =
    rtl || hasArabicScript(sampleText);
  let bodyFont = "helvetica";
  if (needsArabic) {
    try {
      if (await ensurePdfArabicFont(doc)) bodyFont = PDF_ARABIC_FONT;
    } catch {
      bodyFont = "helvetica";
    }
  }
  const t = (value: string) =>
    bodyFont === PDF_ARABIC_FONT ? shapePdfText(value) : value;

  doc.setTextColor(navy);
  doc.setFont(bodyFont, "bold");
  doc.setFontSize(16);
  const brand = (meta.businessName ?? "ASMS").toUpperCase();
  doc.text(t(brand), rtl ? pageW - margin : margin, 14, {
    align: rtl ? "right" : "left",
  });

  doc.setTextColor(titleBlue);
  doc.setFontSize(12);
  doc.text(t(meta.title), rtl ? pageW - margin : margin, 21, {
    align: rtl ? "right" : "left",
  });

  doc.setDrawColor(navy);
  doc.setLineWidth(0.6);
  doc.line(margin, 24, pageW - margin, 24);

  doc.setFont(bodyFont, "normal");
  doc.setFontSize(9);
  doc.setTextColor(muted);
  const metaLines = [
    meta.periodLabel,
    generatedAt,
    meta.generatedBy,
    `Rows: ${rows.length}`,
  ].filter(Boolean) as string[];
  metaLines.forEach((line, i) => {
    doc.text(t(line), rtl ? margin : pageW - margin, 12 + i * 4.2, {
      align: rtl ? "left" : "right",
    });
  });

  if (rows.length === 0) {
    doc.setTextColor(muted);
    doc.setFontSize(11);
    doc.text(t(emptyLabel), pageW / 2, 50, { align: "center" });
  } else {
    const head = [columns.map((c) => t(c.header))];
    const body = rows.map((row) =>
      columns.map((c) => t(cellValue(row[c.key]))),
    );
    autoTable(doc, {
      startY: 28,
      head,
      body,
      theme: "grid",
      styles: {
        font: bodyFont,
        fontStyle: "normal",
        fontSize: 8,
        cellPadding: 1.6,
        textColor: ink,
        lineColor: [195, 207, 223],
        lineWidth: 0.2,
        overflow: "linebreak",
        valign: "top",
        halign: rtl ? "right" : "left",
      },
      headStyles: {
        fillColor: [2, 16, 36],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        font: bodyFont,
        lineColor: [2, 16, 36],
        halign: rtl ? "right" : "left",
      },
      alternateRowStyles: { fillColor: [242, 246, 251] },
      margin: { left: margin, right: margin },
      didParseCell: (data) => {
        data.cell.styles.font = bodyFont;
        if (data.section !== "body") return;
        const col = columns[data.column.index];
        if (!col) return;
        if (col.kind === "amount" || col.kind === "count") {
          // Keep amounts LTR-aligned for readability in both locales.
          data.cell.styles.halign = rtl ? "left" : "right";
          data.cell.styles.fontStyle = "bold";
        }
        const row = rows[data.row.index];
        if (!row) return;
        const tone = amountTone(row, col);
        if (tone === "in") data.cell.styles.textColor = moneyIn;
        if (tone === "out") data.cell.styles.textColor = moneyOut;
      },
    });
  }

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    const y = doc.internal.pageSize.getHeight() - 7;
    doc.setDrawColor(195, 207, 223);
    doc.setLineWidth(0.3);
    doc.line(margin, y - 3, pageW - margin, y - 3);
    doc.setFont(bodyFont, "normal");
    doc.setFontSize(8);
    doc.setTextColor(muted);
    doc.text(t("ASMS · Reports"), rtl ? pageW - margin : margin, y, {
      align: rtl ? "right" : "left",
    });
    doc.text(
      t(`Confidential · ${i}/${pageCount}`),
      rtl ? margin : pageW - margin,
      y,
      { align: rtl ? "left" : "right" },
    );
  }

  const bytes = new Uint8Array(doc.output("arraybuffer"));
  try {
    const saved = await saveBytesExport({
      filename,
      contentsBase64: bytesToBase64(bytes),
    });
    return saved.path;
  } catch {
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    return null;
  }
}
