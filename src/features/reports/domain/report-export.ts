export type ReportExportColumn = {
  key: string;
  header: string;
};

export type ReportExportRow = Record<string, string | number | null | undefined>;

export type ReportExportMeta = {
  title: string;
  subtitle?: string;
  periodLabel?: string;
  generatedAt?: string;
  companyName?: string;
};

function escapeCsvValue(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

function cellValue(value: string | number | null | undefined): string {
  if (value == null) {
    return "";
  }
  return String(value);
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function downloadBlob(filename: string, mime: string, content: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function defaultMeta(title: string, meta?: ReportExportMeta): ReportExportMeta {
  return {
    title,
    companyName: "Saraf",
    generatedAt: new Date().toLocaleString(),
    ...meta,
  };
}

export function downloadReportCsv(
  filename: string,
  columns: ReportExportColumn[],
  rows: ReportExportRow[],
  meta?: ReportExportMeta,
) {
  const info = defaultMeta(filename, meta);
  const lines = [
    escapeCsvValue(info.companyName ?? "Saraf"),
    escapeCsvValue(info.title),
    info.periodLabel ? escapeCsvValue(`Period: ${info.periodLabel}`) : "",
    info.generatedAt ? escapeCsvValue(`Generated: ${info.generatedAt}`) : "",
    "",
    columns.map((column) => escapeCsvValue(column.header)).join(","),
    ...rows.map((row) =>
      columns
        .map((column) => escapeCsvValue(cellValue(row[column.key])))
        .join(","),
    ),
  ].filter((line, index) => !(index < 5 && line === "" && index !== 4));

  const csv = `\uFEFF${lines.join("\r\n")}`;
  downloadBlob(
    filename.endsWith(".csv") ? filename : `${filename}.csv`,
    "text/csv;charset=utf-8",
    csv,
  );
}

/** Excel SpreadsheetML with title block, styled header row, and autosize hints. */
export function downloadReportExcel(
  filename: string,
  columns: ReportExportColumn[],
  rows: ReportExportRow[],
  meta?: ReportExportMeta,
) {
  const info = defaultMeta(filename, meta);
  const columnCount = Math.max(columns.length, 1);

  const titleRow = `<Row ss:StyleID="Title"><Cell ss:MergeAcross="${columnCount - 1}"><Data ss:Type="String">${escapeXml(info.companyName ?? "Saraf")}</Data></Cell></Row>`;
  const reportRow = `<Row ss:StyleID="Subtitle"><Cell ss:MergeAcross="${columnCount - 1}"><Data ss:Type="String">${escapeXml(info.title)}</Data></Cell></Row>`;
  const periodRow = info.periodLabel
    ? `<Row><Cell ss:MergeAcross="${columnCount - 1}"><Data ss:Type="String">${escapeXml(`Period: ${info.periodLabel}`)}</Data></Cell></Row>`
    : "";
  const generatedRow = info.generatedAt
    ? `<Row><Cell ss:MergeAcross="${columnCount - 1}"><Data ss:Type="String">${escapeXml(`Generated: ${info.generatedAt}`)}</Data></Cell></Row>`
    : "";
  const blankRow = `<Row></Row>`;

  const headerCells = columns
    .map(
      (column) =>
        `<Cell ss:StyleID="Header"><Data ss:Type="String">${escapeXml(column.header)}</Data></Cell>`,
    )
    .join("");

  const bodyRows = rows
    .map((row, index) => {
      const style = index % 2 === 0 ? "Cell" : "AltCell";
      const cells = columns
        .map((column) => {
          const value = cellValue(row[column.key]);
          const isNumber =
            value !== "" && /^-?\d+(\.\d+)?$/.test(value.trim());
          return `<Cell ss:StyleID="${style}"><Data ss:Type="${isNumber ? "Number" : "String"}">${escapeXml(value)}</Data></Cell>`;
        })
        .join("");
      return `<Row>${cells}</Row>`;
    })
    .join("");

  const columnDefs = columns
    .map((column) => {
      const width = Math.min(
        80,
        Math.max(12, column.header.length + 8),
      );
      return `<Column ss:AutoFitWidth="1" ss:Width="${width * 5}"/>`;
    })
    .join("");

  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Title"><Font ss:Bold="1" ss:Size="16"/><Alignment ss:Horizontal="Left"/></Style>
  <Style ss:ID="Subtitle"><Font ss:Bold="1" ss:Size="12"/><Alignment ss:Horizontal="Left"/></Style>
  <Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#183A31" ss:Pattern="Solid"/><Alignment ss:Horizontal="Left" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/></Borders></Style>
  <Style ss:ID="Cell"><Alignment ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DDDDDD"/></Borders></Style>
  <Style ss:ID="AltCell"><Interior ss:Color="#F5F8F7" ss:Pattern="Solid"/><Alignment ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DDDDDD"/></Borders></Style>
 </Styles>
 <Worksheet ss:Name="Report">
  <Table>
   ${columnDefs}
   ${titleRow}
   ${reportRow}
   ${periodRow}
   ${generatedRow}
   ${blankRow}
   <Row>${headerCells}</Row>
   ${bodyRows}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <FreezePanes/>
   <FrozenNoSplit/>
   <SplitHorizontal>6</SplitHorizontal>
   <TopRowBottomPane>6</TopRowBottomPane>
  </WorksheetOptions>
 </Worksheet>
</Workbook>`;

  downloadBlob(
    filename.endsWith(".xls") ? filename : `${filename}.xls`,
    "application/vnd.ms-excel",
    xml,
  );
}

export function printReportElement(elementId = "report-print-root") {
  const root = document.getElementById(elementId);
  if (!root) {
    window.print();
    return;
  }

  document.body.classList.add("printing-report");
  window.print();
  window.setTimeout(() => {
    document.body.classList.remove("printing-report");
  }, 500);
}

/**
 * Opens a professionally formatted print window for Save as PDF.
 */
export function downloadReportPdf(
  title: string,
  columns: ReportExportColumn[],
  rows: ReportExportRow[],
  meta?: ReportExportMeta,
) {
  const info = defaultMeta(title, meta);
  const header = columns
    .map((column) => `<th>${escapeXml(column.header)}</th>`)
    .join("");
  const body = rows
    .map((row) => {
      const cells = columns
        .map(
          (column) => `<td>${escapeXml(cellValue(row[column.key]))}</td>`,
        )
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeXml(info.title)}</title>
  <style>
    @page { margin: 16mm; }
    body { font-family: "Segoe UI", Arial, sans-serif; color: #122018; margin: 0; padding: 0; }
    .sheet { max-width: 1100px; margin: 0 auto; }
    .brand { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #183a31; padding-bottom: 12px; margin-bottom: 16px; }
    .brand h1 { margin: 0; font-size: 22px; letter-spacing: 0.04em; color: #183a31; }
    .brand .meta { text-align: right; font-size: 11px; color: #4b5c55; line-height: 1.5; }
    .title { font-size: 18px; font-weight: 700; margin: 0 0 4px; }
    .subtitle { font-size: 12px; color: #4b5c55; margin: 0 0 14px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    thead { display: table-header-group; }
    th { background: #183a31; color: #fff; text-align: left; padding: 8px 10px; font-weight: 600; }
    td { border-bottom: 1px solid #d7e0dc; padding: 7px 10px; vertical-align: top; }
    tbody tr:nth-child(even) td { background: #f5f8f7; }
    .footer { margin-top: 18px; padding-top: 10px; border-top: 1px solid #d7e0dc; font-size: 10px; color: #6b7a74; display: flex; justify-content: space-between; }
    .empty { padding: 24px; text-align: center; color: #6b7a74; border: 1px dashed #c5d2cc; }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="brand">
      <div>
        <h1>${escapeXml(info.companyName ?? "Saraf")}</h1>
        <div class="title">${escapeXml(info.title)}</div>
        ${info.subtitle ? `<p class="subtitle">${escapeXml(info.subtitle)}</p>` : ""}
      </div>
      <div class="meta">
        ${info.periodLabel ? `<div>Period: ${escapeXml(info.periodLabel)}</div>` : ""}
        <div>Generated: ${escapeXml(info.generatedAt ?? "")}</div>
        <div>Rows: ${rows.length}</div>
      </div>
    </div>
    ${
      rows.length === 0
        ? `<div class="empty">No rows for this report.</div>`
        : `<table>
      <thead><tr>${header}</tr></thead>
      <tbody>${body}</tbody>
    </table>`
    }
    <div class="footer">
      <span>Offline Sarafi Management System</span>
      <span>Confidential — for internal use</span>
    </div>
  </div>
  <script>window.onload = function () { window.focus(); window.print(); };</script>
</body>
</html>`;

  const popup = window.open("", "_blank", "noopener,noreferrer,width=1024,height=768");
  if (!popup) {
    printReportElement();
    return;
  }
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
}
