import "server-only";

import { listCurrencies } from "@/features/ledger/repositories/currency-repository";
import { HAWALA_STATUS_LABELS } from "@/features/hawala/domain/labels";
import type {
  GetHawalaListOptions,
  HawalaListItem,
  HawalaListResult,
  HawalaTransferRecord,
} from "@/features/hawala/domain/types";
import {
  listHawalaTransfers,
  listHawalaTransfersPage,
} from "@/features/hawala/repositories/hawala-repository";
import { formatPrismaAmount } from "@/features/transactions/services/ledger-amount-display";
import { prisma } from "@/server/db";

async function mapTransfersToListItems(
  transfers: HawalaTransferRecord[],
): Promise<HawalaListItem[]> {
  const [currencies, users] = await Promise.all([
    listCurrencies({ includeDeleted: true }),
    transfers.length === 0
      ? Promise.resolve([])
      : prisma.user.findMany({
          where: {
            id: {
              in: [...new Set(transfers.map((transfer) => transfer.createdById))],
            },
          },
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

  return transfers.map((transfer) => {
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
}

/**
 * Paginated hawala list for the desk UI.
 * Search and archive filters run in SQL (indexed) — never loads the full table.
 */
export async function getHawalaList(
  options: GetHawalaListOptions = {},
): Promise<HawalaListResult> {
  const pageResult = await listHawalaTransfersPage({
    ...(options.archiveFilter === "archived" ? { onlyDeleted: true } : {}),
    ...(options.partnerSarafiId
      ? { partnerSarafiId: options.partnerSarafiId }
      : {}),
    ...(options.direction ? { direction: options.direction } : {}),
    ...(options.valueDateFrom ? { valueDateFrom: options.valueDateFrom } : {}),
    ...(options.valueDateTo ? { valueDateTo: options.valueDateTo } : {}),
    ...(options.search ? { search: options.search } : {}),
    page: options.page,
    pageSize: options.pageSize,
  });

  const items = await mapTransfersToListItems(pageResult.items);

  return {
    items,
    total: pageResult.total,
    page: pageResult.page,
    pageSize: pageResult.pageSize,
  };
}

/**
 * Date/partner-bounded hawala rows for reports and partner tabs.
 * Prefer this over unfiltered full-table scans; still uses SQL WHERE indexes.
 */
export async function getHawalaListItems(
  options: Omit<GetHawalaListOptions, "page" | "pageSize"> = {},
): Promise<HawalaListItem[]> {
  const transfers = await listHawalaTransfers({
    ...(options.archiveFilter === "archived" ? { onlyDeleted: true } : {}),
    ...(options.partnerSarafiId
      ? { partnerSarafiId: options.partnerSarafiId }
      : {}),
    ...(options.direction ? { direction: options.direction } : {}),
    ...(options.valueDateFrom ? { valueDateFrom: options.valueDateFrom } : {}),
    ...(options.valueDateTo ? { valueDateTo: options.valueDateTo } : {}),
    ...(options.search ? { search: options.search } : {}),
  });

  return mapTransfersToListItems(transfers);
}
