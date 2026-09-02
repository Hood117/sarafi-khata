import type { ReactNode } from "react";

/** Match amounts like 1,200.50 / 1200 / ۱۲۰۰ inside free text. */
const AMOUNT_RE = /(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/g;

export function colorizeAmountsInText(
  text: string,
  tone: "in" | "out" | "neutral",
): ReactNode {
  const raw = text ?? "";
  if (!raw) return "—";
  if (tone === "neutral") return raw;

  const cls = tone === "in" ? "money-in" : "money-out";
  const parts: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(AMOUNT_RE.source, "g");
  while ((match = re.exec(raw)) !== null) {
    if (match.index > last) {
      parts.push(raw.slice(last, match.index));
    }
    parts.push(
      <span key={`${match.index}-${match[0]}`} className={cls} style={{ fontWeight: 700 }}>
        {match[0]}
      </span>,
    );
    last = match.index + match[0].length;
  }
  if (last < raw.length) parts.push(raw.slice(last));
  return parts.length ? <>{parts}</> : raw;
}

export function descriptionToneFromJournalRow(row: {
  debit?: string | null;
  credit?: string | null;
  transactionType?: string | null;
}): "in" | "out" | "neutral" {
  if (row.debit && String(row.debit).trim()) return "in";
  if (row.credit && String(row.credit).trim()) return "out";
  const t = (row.transactionType ?? "").toUpperCase();
  if (t === "DEPOSIT" || t === "RECEIVE") return "in";
  if (t === "WITHDRAWAL" || t === "SEND") return "out";
  return "neutral";
}
