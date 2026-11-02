/** Arabic / Pashto / Dari text helpers for jsPDF (no built-in shaping). */

import { ArabicShaper } from "arabic-persian-reshaper";
import bidiFactory from "bidi-js";
import type { jsPDF } from "jspdf";

import boldUrl from "@desktop/assets/fonts/NotoSansArabic-Bold.ttf?url";
import regularUrl from "@desktop/assets/fonts/NotoSansArabic-Regular.ttf?url";

export const PDF_ARABIC_FONT = "NotoSansArabic";

const ARABIC_RE =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

const bidi = bidiFactory();

type FontCache = { regular: string; bold: string };
let fontCache: FontCache | null = null;
let fontLoading: Promise<FontCache> | null = null;

function bytesToBase64(bytes: Uint8Array): string {
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function loadFontBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Cannot load font: ${url}`);
  return bytesToBase64(new Uint8Array(await res.arrayBuffer()));
}

async function loadFontCache(): Promise<FontCache> {
  if (fontCache) return fontCache;
  if (!fontLoading) {
    fontLoading = Promise.all([
      loadFontBase64(regularUrl),
      loadFontBase64(boldUrl),
    ]).then(([regular, bold]) => {
      fontCache = { regular, bold };
      return fontCache;
    });
  }
  try {
    return await fontLoading;
  } catch (err) {
    fontLoading = null;
    throw err;
  }
}

/** Register Noto Sans Arabic on the document (cached bytes). */
export async function ensurePdfArabicFont(doc: jsPDF): Promise<boolean> {
  const cache = await loadFontCache();
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

/**
 * Shape + reorder Arabic-script text for PDF engines that draw LTR glyph runs.
 * Latin / digits in mixed strings stay readable via the Unicode bidi algorithm.
 */
export function shapePdfText(value: string): string {
  if (!value || !hasArabicScript(value)) return value;
  const reshaped = ArabicShaper.convertArabic(value);
  const embedding = bidi.getEmbeddingLevels(reshaped);
  return bidi.getReorderedString(reshaped, embedding);
}
