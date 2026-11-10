/** Arabic / Pashto / Dari text helpers for jsPDF (no built-in shaping). */

import { ArabicShaper } from "arabic-persian-reshaper";
import bidiFactory from "bidi-js";
import type { jsPDF } from "jspdf";

/**
 * Embed fonts in the JS bundle (Vite `?inline` → data URL).
 * Do NOT fetch `?url` assets at runtime — packaged Tauri WebViews often fail
 * that fetch offline, leaving Helvetica-only PDFs with broken Pashto/Dari.
 */
import boldDataUrl from "@desktop/assets/fonts/NotoSansArabic-Bold.ttf?inline";
import regularDataUrl from "@desktop/assets/fonts/NotoSansArabic-Regular.ttf?inline";

export const PDF_ARABIC_FONT = "NotoSansArabic";

const ARABIC_RE =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

const bidi = bidiFactory();

type FontCache = { regular: string; bold: string };
let fontCache: FontCache | null = null;

function dataUrlToBase64(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) {
    throw new Error("PDF Arabic font data URL is missing a payload.");
  }
  return dataUrl.slice(comma + 1);
}

function loadFontCache(): FontCache {
  if (fontCache) return fontCache;
  fontCache = {
    regular: dataUrlToBase64(regularDataUrl),
    bold: dataUrlToBase64(boldDataUrl),
  };
  return fontCache;
}

/** Register Noto Sans Arabic on the document (bundled bytes — works offline). */
export async function ensurePdfArabicFont(doc: jsPDF): Promise<boolean> {
  const cache = loadFontCache();
  const fonts = (
    doc as unknown as { getFontList: () => Record<string, string[]> }
  ).getFontList();
  if (!fonts[PDF_ARABIC_FONT]) {
    doc.addFileToVFS("NotoSansArabic-Regular.ttf", cache.regular);
    doc.addFont("NotoSansArabic-Regular.ttf", PDF_ARABIC_FONT, "normal");
    doc.addFileToVFS("NotoSansArabic-Bold.ttf", cache.bold);
    doc.addFont("NotoSansArabic-Bold.ttf", PDF_ARABIC_FONT, "bold");
  }
  return true;
}

export function hasArabicScript(value: string): boolean {
  return ARABIC_RE.test(value);
}

/** Latin letters that Noto Sans Arabic cannot paint (glyph id 0). */
export function hasLatinLetters(value: string): boolean {
  return /[A-Za-z]/.test(value);
}

/**
 * Pick a jsPDF font for a cell/string. Noto Sans Arabic has no Latin glyphs, so
 * English ledger lines must use Helvetica or they render as blank cells.
 */
export function pdfFontForText(
  value: string,
  arabicFontReady: boolean,
): string {
  if (!arabicFontReady) return "helvetica";
  if (hasArabicScript(value)) return PDF_ARABIC_FONT;
  return "helvetica";
}

function needsArabicFontGlyph(ch: string): boolean {
  return ARABIC_RE.test(ch);
}

type PdfTextRun = { text: string; font: string };

/** Split already-visual text into font runs (Arabic font vs Helvetica). */
export function splitPdfFontRuns(
  visualText: string,
  arabicFontReady: boolean,
): PdfTextRun[] {
  if (!visualText) return [];
  if (!arabicFontReady) return [{ text: visualText, font: "helvetica" }];

  const runs: PdfTextRun[] = [];
  let buf = "";
  let font: string | null = null;

  const flush = () => {
    if (!buf || !font) return;
    runs.push({ text: buf, font });
    buf = "";
  };

  for (const ch of visualText) {
    // Digits / punctuation stay with the current run; start Latin on A–Z.
    let nextFont: string;
    if (needsArabicFontGlyph(ch)) nextFont = PDF_ARABIC_FONT;
    else if (/[A-Za-z]/.test(ch)) nextFont = "helvetica";
    else nextFont = font ?? "helvetica";
    if (font && nextFont !== font) flush();
    font = nextFont;
    buf += ch;
  }
  flush();
  return runs;
}

export type PdfTextDirection = "rtl" | "ltr" | "auto";

/**
 * Match jspdf-autotable's top baseline offset so custom-painted cells line up
 * with native autotable text (amounts, etc.).
 */
export function pdfAutoTableTextY(
  doc: jsPDF,
  cellTopY: number,
  paddingTop: number,
  fontSizePt: number,
): number {
  const k = doc.internal.scaleFactor;
  const fontSize = fontSizePt / k;
  // Same formula as jspdf-autotable `autoTableText` for valign top.
  return cellTopY + paddingTop + fontSize * (2 - 1.15);
}

/**
 * Draw shaped Arabic + Latin with the correct font per run.
 * `value` is logical text; shaping/bidi runs first when Arabic is present.
 */
export function drawPdfMixedText(
  doc: jsPDF,
  value: string,
  x: number,
  y: number,
  options: {
    arabicFontReady: boolean;
    align?: "left" | "right" | "center";
    fontStyle?: "normal" | "bold";
    fontSize?: number;
    /** Paragraph direction — use `rtl` for FA/PS sheets so mixed lines start on the right. */
    direction?: PdfTextDirection;
    /** Optional content-box width; text is clipped with an ellipsis if wider. */
    maxWidth?: number;
  },
): void {
  const align = options.align ?? "left";
  const fontStyle = options.fontStyle ?? "normal";
  if (options.fontSize != null) doc.setFontSize(options.fontSize);

  let visual =
    options.arabicFontReady && hasArabicScript(value)
      ? shapePdfText(value, options.direction ?? "auto")
      : value;
  let runs = splitPdfFontRuns(visual, options.arabicFontReady);
  if (runs.length === 0) return;

  const measure = (parts: PdfTextRun[]) =>
    parts.reduce((sum, run) => {
      doc.setFont(run.font, fontStyle);
      return sum + doc.getTextWidth(run.text);
    }, 0);

  let total = measure(runs);
  const maxWidth = options.maxWidth;
  if (maxWidth != null && maxWidth > 0 && total > maxWidth) {
    // Trim from the visual start (left) so RTL-aligned ends stay visible.
    const ellipsis = "…";
    doc.setFont("helvetica", fontStyle);
    const ellipsisW = doc.getTextWidth(ellipsis);
    let budget = Math.max(0, maxWidth - ellipsisW);
    const kept: PdfTextRun[] = [];
    for (let i = runs.length - 1; i >= 0; i -= 1) {
      const run = runs[i]!;
      doc.setFont(run.font, fontStyle);
      const w = doc.getTextWidth(run.text);
      if (w <= budget) {
        kept.unshift(run);
        budget -= w;
        continue;
      }
      let cut = run.text;
      while (cut.length > 0) {
        cut = cut.slice(1);
        if (doc.getTextWidth(cut) <= budget) break;
      }
      if (cut) kept.unshift({ text: cut, font: run.font });
      break;
    }
    kept.unshift({ text: ellipsis, font: "helvetica" });
    runs = kept;
    total = measure(runs);
  }

  if (runs.length === 1) {
    const run = runs[0]!;
    doc.setFont(run.font, fontStyle);
    doc.text(run.text, x, y, {
      align,
      isInputVisual: true,
      isOutputVisual: true,
    });
    return;
  }

  let cursor =
    align === "right" ? x - total : align === "center" ? x - total / 2 : x;

  for (let i = 0; i < runs.length; i += 1) {
    const run = runs[i]!;
    doc.setFont(run.font, fontStyle);
    doc.text(run.text, cursor, y, {
      align: "left",
      isInputVisual: true,
      isOutputVisual: true,
    });
    cursor += doc.getTextWidth(run.text);
  }
}

/**
 * Shape + reorder Arabic-script text for PDF engines that draw LTR glyph runs.
 * Latin / digits in mixed strings stay readable via the Unicode bidi algorithm.
 *
 * Result is already in *visual* order. Always call
 * {@link patchPdfTextForShapedArabic} on the jsPDF doc before drawing — otherwise
 * jsPDF's default bidi post-processor reorders again and Pashto/Dari turns into
 * cipher-looking glyphs.
 *
 * For RTL report sheets pass `direction: "rtl"` so lines that start with a Latin
 * name/amount still lay out as RTL (Pashto/Dari reading order from the right).
 */
export function shapePdfText(
  value: string,
  direction: PdfTextDirection = "auto",
): string {
  if (!value || !hasArabicScript(value)) return value;
  // Stock reshaper covers Arabic + Persian; Pashto-specific letters stay logical
  // (many have no Unicode presentation forms) but neighbors still join.
  const reshaped = ArabicShaper.convertArabic(value);
  const embedding = bidi.getEmbeddingLevels(
    reshaped,
    direction === "auto" ? undefined : direction,
  );
  return bidi.getReorderedString(reshaped, embedding);
}

/**
 * jsPDF registers a bidi post-processor that defaults to `isInputVisual: true`
 * and converts visual → logical. Our `shapePdfText` output is already visual, so
 * that second pass scrambles presentation-form glyphs into unreadable cipher
 * text — especially noticeable in Pashto UI strings.
 *
 * Force visual→visual (identity) on every `doc.text` call, including autotable.
 */
export function patchPdfTextForShapedArabic(doc: jsPDF): void {
  const original = doc.text.bind(doc) as (
    text: string | string[],
    x: number,
    y: number,
    options?: object | number,
    transform?: unknown,
  ) => jsPDF;

  doc.text = ((
    text: string | string[],
    x: number,
    y: number,
    options?: object | number,
    transform?: unknown,
  ) => {
    if (options == null || typeof options === "object") {
      return original(
        text,
        x,
        y,
        {
          isInputVisual: true,
          isOutputVisual: true,
          ...(options as object | undefined),
        },
        transform,
      );
    }
    return original(text, x, y, options, transform);
  }) as typeof doc.text;
}
