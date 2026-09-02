/**
 * Table export for desktop reports / daybook.
 * Excel SpreadsheetML (.xls) with content-based column widths + RTL for FA/PS.
 * CSV kept as a simple UTF-8 BOM fallback.
 */

import { saveTextExport } from "@desktop/api";

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
    .report-print-root .sheet {
      padding: 0;
      color: #122018;
      font-family: "Segoe UI", Tahoma, Arial, sans-serif;
      direction: ${dir};
    }
    .report-print-root .brand {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-start;
      border-bottom: 2.5px solid #183a31;
      padding-bottom: 10px;
      margin-bottom: 14px;
    }
    .report-print-root .brand h1 {
      margin: 0;
      font-size: 20px;
      color: #183a31;
      text-transform: uppercase;
    }
    .report-print-root .brand .title {
      margin: 4px 0 0;
      font-size: 15px;
      font-weight: 700;
    }
    .report-print-root .meta {
      text-align: ${meta.rtl ? "left" : "right"};
      font-size: 11px;
      color: #4b5c55;
      line-height: 1.55;
    }
    .report-print-root table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 10.5px;
    }
    .report-print-root thead { display: table-header-group; }
    .report-print-root th,
    .report-print-root td {
      border: 1px solid #2a4038;
      padding: 5px 6px;
      vertical-align: top;
      word-wrap: break-word;
    }
    .report-print-root th {
      background: #e8ece9;
      color: #122018;
      font-weight: 700;
      text-align: start;
    }
    .report-print-root tbody tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .report-print-root tbody tr:nth-child(even) td { background: #f3f7f5; }
    .report-print-root td.num,
    .report-print-root th.num {
      text-align: ${meta.rtl ? "left" : "right"};
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .report-print-root td.money-in {
      color: #1a7a45 !important;
      font-weight: 700;
    }
    .report-print-root td.money-out {
      color: #b42318 !important;
      font-weight: 700;
    }
    .report-print-root td.desc { font-size: 10px; }
    .report-print-root .empty {
      border: 1px dashed #9aafa6;
      padding: 28px;
      text-align: center;
      color: #6b7a74;
    }
    .report-print-root .footer {
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
      .report-print-root thead {
        display: table-header-group !important;
      }
      .report-print-root th {
        background: #e8ece9 !important;
        color: #122018 !important;
        border: 1px solid #2a4038 !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .report-print-root tbody tr:nth-child(even) td {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .report-print-root td.money-in,
      .report-print-root td.money-out {
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
