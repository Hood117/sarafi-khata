import "server-only";

import { EXCHANGE_DIFFERENCE_WALLET_NAME } from "@/features/wallets/domain/wallet-descriptions";
import { prisma } from "@/server/db";

export type FxPnlRow = {
  currencyCode: string;
  currencySymbol: string | null;
  debitDisplay: string;
  creditDisplay: string;
  netDisplay: string;
  netMinor: string;
};

export type FxPnlReport = {
  walletName: string;
  from: string | null;
  to: string | null;
  rows: FxPnlRow[];
};

export type GetFxPnlReportOptions = {
  from?: Date;
  to?: Date;
};

function formatMinor(amount: bigint, decimalPlaces: number): string {
  const negative = amount < BigInt(0);
  const abs = negative ? -amount : amount;
  const scale = BigInt(10 ** decimalPlaces);
  const whole = abs / scale;
  const frac = abs % scale;
  const fracStr = frac
    .toString()
    .padStart(decimalPlaces, "0")
    .replace(/0+$/, "");
  const major = fracStr
    ? `${whole.toLocaleString("en-US")}.${fracStr}`
    : whole.toLocaleString("en-US");
  return negative ? `-${major}` : major;
}

/**
 * Read-only FX gain/loss summary from the Exchange Difference SYSTEM wallet.
 * Net = credit − debit (minor units). Never posts money.
 */
export async function getFxPnlReport(
  options: GetFxPnlReportOptions = {},
): Promise<FxPnlReport> {
  const wallet = await prisma.wallet.findFirst({
    where: {
      name: EXCHANGE_DIFFERENCE_WALLET_NAME,
      type: "SYSTEM",
      deletedAt: null,
    },
  });

  if (!wallet) {
    return {
      walletName: EXCHANGE_DIFFERENCE_WALLET_NAME,
      from: options.from?.toISOString() ?? null,
      to: options.to?.toISOString() ?? null,
      rows: [],
    };
  }

  const entries = await prisma.ledgerEntry.findMany({
    where: {
      walletId: wallet.id,
      ...(options.from || options.to
        ? {
            createdAt: {
              ...(options.from ? { gte: options.from } : {}),
              ...(options.to ? { lt: options.to } : {}),
            },
          }
        : {}),
      transaction: {
        deletedAt: null,
        status: { in: ["POSTED", "VOIDED"] },
      },
    },
    include: {
      currency: true,
    },
  });

  const totals = new Map<
    string,
    {
      currencyCode: string;
      currencySymbol: string | null;
      decimalPlaces: number;
      debit: bigint;
      credit: bigint;
    }
  >();

  for (const entry of entries) {
    const code = entry.currency.code;
    const scale = BigInt(10 ** entry.currency.decimalPlaces);
    const [whole, fraction = ""] = entry.amount.toString().split(".");
    const padded = (fraction + "0".repeat(entry.currency.decimalPlaces)).slice(
      0,
      entry.currency.decimalPlaces,
    );
    const minor = BigInt(whole || "0") * scale + BigInt(padded || "0");

    const current = totals.get(code) ?? {
      currencyCode: code,
      currencySymbol: entry.currency.symbol,
      decimalPlaces: entry.currency.decimalPlaces,
      debit: BigInt(0),
      credit: BigInt(0),
    };

    if (entry.direction === "DEBIT") {
      current.debit += minor;
    } else {
      current.credit += minor;
    }
    totals.set(code, current);
  }

  const rows: FxPnlRow[] = [...totals.values()]
    .sort((a, b) => a.currencyCode.localeCompare(b.currencyCode))
    .map((row) => {
      const net = row.credit - row.debit;
      return {
        currencyCode: row.currencyCode,
        currencySymbol: row.currencySymbol,
        debitDisplay: formatMinor(row.debit, row.decimalPlaces),
        creditDisplay: formatMinor(row.credit, row.decimalPlaces),
        netDisplay: formatMinor(net, row.decimalPlaces),
        netMinor: net.toString(),
      };
    });

  return {
    walletName: EXCHANGE_DIFFERENCE_WALLET_NAME,
    from: options.from?.toISOString() ?? null,
    to: options.to?.toISOString() ?? null,
    rows,
  };
}
