/** Customer-facing one-line transaction copy (hide accounting noise). */

export type AmountPart = {
  sign: "+" | "−";
  currency: string;
  amount: string;
};

export type MoneyFlow = "in" | "out" | "mixed" | "neutral";

export type TransactionLineInput = {
  type: string;
  reference?: string | null;
  status?: string | null;
  customerName?: string | null;
  walkInName?: string | null;
  description?: string | null;
  amountSummary?: string | null;
  /** Statement-style single-currency movement when amountSummary is absent. */
  debit?: string | null;
  credit?: string | null;
  currencyCode?: string | null;
  senderName?: string | null;
  receiverName?: string | null;
};

/** Localized verbs / labels for ledger one-liners. */
export type TransactionLineLabels = {
  walkIn: string;
  deposited: string;
  withdrew: string;
  exchanged: string;
  received: string;
  sent: string;
  transferred: string;
  to: string;
  openingBalance: string;
  bought: string;
  sold: string;
  transaction: string;
  adjustment: string;
  expense: string;
};

export const DEFAULT_TX_LINE_LABELS: TransactionLineLabels = {
  walkIn: "Walk-in",
  deposited: "deposited",
  withdrew: "withdrew",
  exchanged: "exchanged",
  received: "received",
  sent: "sent",
  transferred: "transferred",
  to: "to",
  openingBalance: "· Opening balance",
  bought: "bought",
  sold: "sold",
  transaction: "transaction",
  adjustment: "adjustment",
  expense: "expense",
};

/** Structured line for colored UI rendering. */
export type TransactionLineParts = {
  flow: MoneyFlow;
  who: string;
  /** Verb / middle phrase, e.g. "deposited", "withdrew", "exchanged". */
  action: string;
  amounts: AmountPart[];
  /** Optional trailing text after amounts (destination, status). */
  suffix: string;
  /** Full plain string (CSV / aria). */
  plain: string;
  /**
   * When true, `action` is the full stored Transaction.description —
   * render as one phrase (do not re-synthesize who/verb/amounts).
   */
  fromStoredDescription?: boolean;
  /** Transfer-only: show unsigned amount + "to {receiver}". */
  transfer?: {
    sender: string;
    receiver: string;
    amount: string;
    currency: string;
  };
};

const NOISE_NAME_RE =
  /OPENING EQUITY|EXCHANGE DIFFERENCE|HAWALA CLEARING|WALK-IN OUTBOUND|COMMISSION INCOME|\bCOMMISSION\b|\bSYSTEM\b/i;

export function isNoiseWallet(walletType: string, walletName: string): boolean {
  if (walletType.toUpperCase() === "SYSTEM") return true;
  return NOISE_NAME_RE.test(walletName);
}

/** Prefer CUSTOMER lines; else VAULT/TILL cash; drop SYSTEM / equity / clearing. */
export function visibleLedgerLines<
  T extends { walletType: string; walletName: string },
>(lines: T[]): T[] {
  const clean = lines.filter((l) => !isNoiseWallet(l.walletType, l.walletName));
  const customer = clean.filter((l) => l.walletType.toUpperCase() === "CUSTOMER");
  if (customer.length) return customer;
  const cash = clean.filter((l) => {
    const t = l.walletType.toUpperCase();
    return t === "VAULT" || t === "TILL";
  });
  if (cash.length) return cash;
  return clean;
}

export function parseAmountSummary(text: string | null | undefined): AmountPart[] {
  if (!text || text === "—") return [];
  return text
    .split("·")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((part) => {
      const m = part.match(/^([+\-−])\s*([A-Z]{3})\s+(.+)$/i);
      if (m) {
        return {
          sign: m[1] === "+" ? ("+" as const) : ("−" as const),
          currency: m[2].toUpperCase(),
          amount: m[3].trim(),
        };
      }
      const loose = part.match(/^([+\-−])\s*(.+)$/);
      if (loose) {
        return {
          sign: loose[1] === "+" ? ("+" as const) : ("−" as const),
          currency: "",
          amount: loose[2].trim(),
        };
      }
      return { sign: "+" as const, currency: "", amount: part };
    });
}

function whoOf(input: TransactionLineInput, labels: TransactionLineLabels): string {
  const name = (input.customerName ?? input.walkInName ?? "").trim();
  return name || labels.walkIn;
}

function partsFromInput(input: TransactionLineInput): AmountPart[] {
  const fromSummary = parseAmountSummary(input.amountSummary);
  if (fromSummary.length) return fromSummary;
  const code = (input.currencyCode ?? "").trim().toUpperCase();
  const debit = (input.debit ?? "").trim();
  const credit = (input.credit ?? "").trim();
  const parts: AmountPart[] = [];
  if (debit && debit !== "0" && debit !== "0.00") {
    parts.push({ sign: "+", currency: code, amount: debit });
  }
  if (credit && credit !== "0" && credit !== "0.00") {
    parts.push({ sign: "−", currency: code, amount: credit });
  }
  return parts;
}

/** Signed amounts from list `amountSummary` (customer/vault-facing ledger lines). */
export function amountPartsFromRow(input: TransactionLineInput): AmountPart[] {
  return partsFromInput(input);
}

/**
 * Customer-ledger row: one currency. Debit = money in (+), credit = money out (−).
 * Does not use `amountSummary`, which can include other currencies on the same tx.
 */
export function amountPartsFromDebitCredit(row: {
  debit?: string | null;
  credit?: string | null;
  currencyCode?: string | null;
}): AmountPart[] {
  return partsFromInput({
    type: "",
    debit: row.debit,
    credit: row.credit,
    currencyCode: row.currencyCode,
  });
}

export function fmtAmountPart(p: AmountPart): string {
  const sign = p.sign === "+" ? "+" : "−";
  return p.currency ? `${sign}${p.amount} ${p.currency}` : `${sign}${p.amount}`;
}

function fmtPartsPlain(parts: AmountPart[]): string {
  return parts.map(fmtAmountPart).join(" · ");
}

function flowFromParts(parts: AmountPart[]): MoneyFlow {
  if (!parts.length) return "neutral";
  const hasIn = parts.some((p) => p.sign === "+");
  const hasOut = parts.some((p) => p.sign === "−");
  if (hasIn && hasOut) return "mixed";
  if (hasIn) return "in";
  if (hasOut) return "out";
  return "neutral";
}

function statusSuffix(
  input: TransactionLineInput,
  translateStatus?: (status: string) => string,
): string {
  if (
    input.status &&
    !["POSTED", "COMPLETED", "DONE"].includes(input.status.toUpperCase())
  ) {
    const raw = input.status.trim();
    return ` · ${translateStatus ? translateStatus(raw) : raw}`;
  }
  return "";
}

/** Pull a destination hint from free-text description when present. */
function destinationHint(description: string | null | undefined): string | null {
  if (!description) return null;
  const d = description.trim();
  if (!d) return null;
  const to = d.match(/\bto\s+([^,.;]+)/i);
  if (to?.[1]) return to[1].trim();
  const slash = d.split("/").map((s) => s.trim()).filter(Boolean);
  if (slash.length >= 2) return slash[slash.length - 1];
  return null;
}

function parseTransferNamesFromDescription(
  description: string | null | undefined,
): { sender: string | null; receiver: string | null } {
  if (!description) return { sender: null, receiver: null };
  const d = description.trim();
  const m = d.match(/\bfrom\s+(.+?)\s+to\s+(.+)$/i);
  if (m) {
    return { sender: m[1].trim() || null, receiver: m[2].trim() || null };
  }
  const toOnly = d.match(/\bto\s+(.+)$/i);
  if (toOnly) return { sender: null, receiver: toOnly[1].trim() || null };
  return { sender: null, receiver: null };
}

function resolveTransferParties(
  input: TransactionLineInput,
  labels: TransactionLineLabels,
): {
  sender: string;
  receiver: string;
} {
  const fromDesc = parseTransferNamesFromDescription(input.description);
  const sender =
    (input.senderName ?? "").trim() ||
    fromDesc.sender ||
    (input.customerName ?? "").trim() ||
    whoOf(input, labels);
  const receiver =
    (input.receiverName ?? "").trim() ||
    fromDesc.receiver ||
    destinationHint(input.description) ||
    "—";
  return { sender, receiver };
}

function buildPlain(
  who: string,
  action: string,
  amounts: AmountPart[],
  suffix: string,
  exchangeArrow?: { from: AmountPart; to: AmountPart },
): string {
  if (exchangeArrow) {
    const from = `${exchangeArrow.from.amount} ${exchangeArrow.from.currency}`.trim();
    const to = `${exchangeArrow.to.amount} ${exchangeArrow.to.currency}`.trim();
    return `${who} ${action} ${from} → ${to}${suffix}`.trim();
  }
  const money = amounts.length ? ` ${fmtPartsPlain(amounts)}` : "";
  return `${who} ${action}${money}${suffix}`.replace(/\s+/g, " ").trim();
}

/**
 * Structured customer-facing line for colored rendering.
 * Prefer the stored Transaction.description when present so every screen
 * shows the same text that was written at post time.
 */
export function describeTransactionLine(
  input: TransactionLineInput,
  labels: TransactionLineLabels = DEFAULT_TX_LINE_LABELS,
  translateStatus?: (status: string) => string,
): TransactionLineParts {
  const who = whoOf(input, labels);
  const type = (input.type || "").toUpperCase();
  const ref = (input.reference || "").toUpperCase();
  const parts = partsFromInput(input);
  const status = statusSuffix(input, translateStatus);
  const stored = (input.description ?? "").trim();

  if (stored) {
    let flow: MoneyFlow = flowFromParts(parts);
    if (type === "DEPOSIT" || ref.startsWith("MI-")) flow = "in";
    else if (type === "WITHDRAWAL" || ref.startsWith("MO-")) flow = "out";
    else if (type === "TRANSFER") flow = "out";
    else if (type === "EXCHANGE") flow = parts.length ? flowFromParts(parts) : "mixed";
    return {
      flow,
      who: "",
      action: stored,
      amounts: [],
      suffix: status,
      plain: `${stored}${status}`.trim(),
      fromStoredDescription: true,
    };
  }

  if (ref.startsWith("OB-") || ref.startsWith("OPEN-WALLET") || type === "OPENING") {
    const amounts = parts;
    const action = labels.openingBalance;
    return {
      flow: flowFromParts(amounts),
      who,
      action,
      amounts,
      suffix: status,
      plain: buildPlain(who, action, amounts, status),
    };
  }

  if (type === "DEPOSIT" || ref.startsWith("MI-")) {
    const p = parts.find((x) => x.sign === "+") ?? parts[0];
    const amounts = p ? [{ ...p, sign: "+" as const }] : [];
    return {
      flow: "in",
      who,
      action: labels.deposited,
      amounts,
      suffix: status,
      plain: buildPlain(who, labels.deposited, amounts, status),
    };
  }

  if (type === "WITHDRAWAL" || ref.startsWith("MO-")) {
    const p = parts.find((x) => x.sign === "−") ?? parts[0];
    const amounts = p ? [{ ...p, sign: "−" as const }] : [];
    return {
      flow: "out",
      who,
      action: labels.withdrew,
      amounts,
      suffix: status,
      plain: buildPlain(who, labels.withdrew, amounts, status),
    };
  }

  if (type === "EXCHANGE") {
    const out = parts.find((x) => x.sign === "−");
    const inn = parts.find((x) => x.sign === "+");
    if (out && inn) {
      return {
        flow: "mixed",
        who,
        action: labels.exchanged,
        amounts: [out, inn],
        suffix: status,
        plain: buildPlain(who, labels.exchanged, [], status, { from: out, to: inn }),
      };
    }
    return {
      flow: flowFromParts(parts),
      who,
      action: labels.exchanged,
      amounts: parts,
      suffix: status,
      plain: buildPlain(who, labels.exchanged, parts, status),
    };
  }

  if (type === "HAWALA") {
    const inn = parts.find((x) => x.sign === "+");
    const out = parts.find((x) => x.sign === "−");
    if (inn && !out) {
      const amounts = [{ ...inn, sign: "+" as const }];
      return {
        flow: "in",
        who,
        action: labels.received,
        amounts,
        suffix: status,
        plain: buildPlain(who, labels.received, amounts, status),
      };
    }
    const p = out ?? parts[0];
    const amounts = p ? [{ ...p, sign: "−" as const }] : [];
    const dest = destinationHint(input.description);
    const suffix = dest ? ` ${labels.to} ${dest}${status}` : status;
    return {
      flow: "out",
      who,
      action: labels.sent,
      amounts,
      suffix,
      plain: buildPlain(who, labels.sent, amounts, suffix),
    };
  }

  if (type === "TRANSFER") {
    const { sender, receiver } = resolveTransferParties(input, labels);
    const out = parts.find((x) => x.sign === "−");
    const inn = parts.find((x) => x.sign === "+");
    const pick = out ?? inn ?? parts[0];
    const amount = pick?.amount ?? "";
    const currency = pick?.currency ?? "";
    const unsigned = amount && currency ? `${amount} ${currency}` : amount || currency;
    const flow: MoneyFlow =
      inn && !out ? "in" : out && !inn ? "out" : out || inn ? "out" : flowFromParts(parts);
    const amounts = pick
      ? [{ ...pick, sign: (flow === "in" ? "+" : "−") as "+" | "−" }]
      : [];
    const plain =
      `${sender} ${labels.transferred} ${unsigned} ${labels.to} ${receiver}${status}`
        .replace(/\s+/g, " ")
        .trim();
    return {
      flow,
      who: sender,
      action: labels.transferred,
      amounts,
      suffix: status,
      plain,
      transfer: {
        sender,
        receiver,
        amount,
        currency,
      },
    };
  }

  const action =
    type === "TRADE_BUY"
      ? labels.bought
      : type === "TRADE_SELL"
        ? labels.sold
        : type === "ADJUSTMENT"
          ? labels.adjustment
          : type === "EXPENSE"
            ? labels.expense
            : type
              ? type.toLowerCase().replaceAll("_", " ")
              : labels.transaction;
  return {
    flow: flowFromParts(parts),
    who,
    action,
    amounts: parts,
    suffix: status,
    plain: buildPlain(who, action, parts, status),
  };
}

/** Plain one-line string (CSV, titles). */
export function formatTransactionLine(
  input: TransactionLineInput,
  labels: TransactionLineLabels = DEFAULT_TX_LINE_LABELS,
  translateStatus?: (status: string) => string,
): string {
  return describeTransactionLine(input, labels, translateStatus).plain;
}

/** Money flow for coloring: in / out / mixed / neutral. */
export function flowFromAmountSummary(
  text: string | null | undefined,
): MoneyFlow {
  return flowFromParts(parseAmountSummary(text));
}

export function flowFromTransactionLine(input: TransactionLineInput): MoneyFlow {
  return describeTransactionLine(input).flow;
}
