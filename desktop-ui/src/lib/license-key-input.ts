/** SARAF + 12 body chars → SARAF-XXXX-XXXX-XXXX */
const LICENSE_ALNUM_MAX = 17;

/** Strip junk, uppercase, and insert dashes: SARAF-XXXX-XXXX-XXXX */
export function formatLicenseKeyInput(raw: string): string {
  const alnum = raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, LICENSE_ALNUM_MAX);
  if (alnum.length <= 5) return alnum;
  const parts = [alnum.slice(0, 5)];
  for (let i = 5; i < alnum.length; i += 4) {
    parts.push(alnum.slice(i, i + 4));
  }
  return parts.join("-");
}

/** Caret index in a formatted key after `alnumCount` letters/digits. */
export function licenseKeyCaretAfterAlnum(
  formatted: string,
  alnumCount: number,
): number {
  if (alnumCount <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/[A-Z0-9]/.test(formatted[i]!)) {
      seen += 1;
      if (seen >= alnumCount) return i + 1;
    }
  }
  return formatted.length;
}
