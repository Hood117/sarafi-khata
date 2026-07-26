import "server-only";

import { listCurrencies } from "@/features/ledger/repositories/currency-repository";
import { HAWALA_STATUS_LABELS } from "@/features/hawala/domain/labels";
import type {
  GetHawalaListOptions,
  HawalaListItem,
} from "@/features/hawala/domain/types";
import { listHawalaTransfers } from "@/features/hawala/repositories/hawala-repository";
import { formatPrismaAmount } from "@/features/transactions/services/ledger-amount-display";
import { prisma } from "@/server/db";

function matchesSearch(item: HawalaListItem, search: string): boolean {
  const query = search.trim().toLowerCase();
  if (!query) {
    return true;
  }

  const haystack = [
    item.reference,
    item.senderName,
    item.receiverName,
    item.partnerSarafi,
    item.originDisplay,
    item.destinationDisplay,
    item.currencyCode,
    item.statusLabel,
    item.operatorName ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

export async function getHawalaList(
  options: GetHawalaListOptions = {},
): Promise<HawalaListItem[]> {
  const [transfers, currencies, users] = await Promise.all([
    listHawalaTransfers(),
    listCurrencies({ includeDeleted: true }),
    prisma.user.findMany({
      select: { id: true, fullName: true, username: true },
    }),
  ]);

  const currenciesById = new Map(
    currencies.map((currency) => [currency.id, currency] as const),
  );
  const operatorNames = new Map(
    users.map(
      (user) =>
        [user.id, user.fullName.trim() || user.username] as const,
    ),
  );

  const items: HawalaListItem[] = transfers.map((transfer) => {
    const currency = currenciesById.get(transfer.currencyId);
    const amountDisplay = currency
      ? (formatPrismaAmount(transfer.amount, currency) ??
        transfer.amount.toString())
      : transfer.amount.toString();

    return {
      id: transfer.id,
      reference: transfer.reference,
      direction: transfer.direction,
      senderName: transfer.senderName,
      receiverName: transfer.receiverName,
      partnerSarafi: transfer.partnerSarafi,
      originDisplay: `${transfer.originCity}, ${transfer.originCountry}`,
      destinationDisplay: `${transfer.destinationCity}, ${transfer.destinationCountry}`,
      currencyCode: currency?.code ?? "—",
      amountDisplay,
      status: transfer.status,
      statusLabel: HAWALA_STATUS_LABELS[transfer.status],
      operatorName: operatorNames.get(transfer.createdById) ?? null,
      valueDate: transfer.valueDate.toISOString(),
    };
  });

  const search = options.search?.trim() ?? "";
  if (!search) {
    return items;
  }

  return items.filter((item) => matchesSearch(item, search));
}
