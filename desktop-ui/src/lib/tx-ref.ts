/** User-facing transaction number (DEP-0001). Never show the internal timestamp key. */

export type TxRefFields = {
  displayRef?: string | null;
  reference?: string | null;
};

/** Internal posting keys look like DEP-1788235010995 (unix ms). Journal numbers do not. */
export function isInternalTimestampRef(value: string): boolean {
  return /^(DEP|WD|TR|EX|FX|REF|OB|CIN|COUT|HW)-\d{11,}$/i.test(value.trim());
}

export function sanitizeVoucher(value: string | null | undefined): string {
  const n = (value ?? "").trim();
  if (!n || isInternalTimestampRef(n)) return "";
  return n;
}

export function txDisplayRef(row: TxRefFields): string {
  const friendly = sanitizeVoucher(row.displayRef);
  if (friendly) return friendly;
  return sanitizeVoucher(row.reference);
}

/** Operator-facing Hawala number — prefers the manual `reference` over auto displayRef. */
export function hawalaNumberRef(row: TxRefFields): string {
  const manual = sanitizeVoucher(row.reference);
  if (manual) {
    // Complete-receive payouts store "{number}-PAY" on the Transaction row.
    return manual.replace(/-PAY$/i, "");
  }
  return sanitizeVoucher(row.displayRef);
}

/** Daybook / ledger reference: Hawala uses the operator number; others use displayRef. */
export function journalTxRef(
  row: TxRefFields & {
    transactionType?: string | null;
    type?: string | null;
  },
): string {
  const type = (row.transactionType ?? row.type ?? "").toUpperCase();
  if (type === "HAWALA") return hawalaNumberRef(row);
  return txDisplayRef(row);
}

/** Internal unique key for a new post — not shown in the Number field. */
export function newInternalRef(prefix: string): string {
  return `${prefix}-${Date.now()}`;
}

export async function loadDeskVoucher(
  load: () => Promise<string>,
): Promise<string> {
  try {
    return sanitizeVoucher(await load());
  } catch {
    return "";
  }
}
