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

/** Manual deposits / withdrawals (DEP-0001, WD-0001) carry no user-facing number. */
function isManualMovementRef(value: string): boolean {
  return /^(DEP|WD)-/i.test(value);
}

export function txDisplayRef(row: TxRefFields): string {
  const ref = sanitizeVoucher(row.displayRef) || sanitizeVoucher(row.reference);
  return isManualMovementRef(ref) ? "" : ref;
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
