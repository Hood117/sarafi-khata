import { notFound } from "next/navigation";

import { requirePermission } from "@/features/auth/permissions/authorize";
import { getCurrencyList } from "@/features/currencies";
import { getCustomerList } from "@/features/customers";
import { getHawalaListItems, type HawalaDirection } from "@/features/hawala";
import { isPartnerSarafiError } from "@/features/partner-sarafi/domain/errors";
import { PartnerSarafiProfileView } from "@/features/partner-sarafi/components/partner-sarafi-profile";
import { getPartnerCommissionSummary } from "@/features/partner-sarafi/services/get-partner-commission-summary";
import { getPartnerSarafiProfile } from "@/features/partner-sarafi/services/get-partner-sarafi-profile";
import { getWalletList } from "@/features/wallets";

type PartnerSarafiProfilePageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    tab?: string | string[];
    q?: string | string[];
    direction?: string | string[];
  }>;
};

function firstValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function resolveTab(
  tab: string,
): "information" | "hawala" | "commission" | undefined {
  if (tab === "information" || tab === "hawala" || tab === "commission") {
    return tab;
  }
  return undefined;
}

function resolveDirection(value: string): HawalaDirection | "all" {
  if (value === "SEND" || value === "RECEIVE") {
    return value;
  }
  return "all";
}

export default async function PartnerSarafiProfilePage({
  params,
  searchParams,
}: PartnerSarafiProfilePageProps) {
  await requirePermission("hawala.manage");

  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const search = firstValue(resolvedSearchParams.q).trim();
  const direction = resolveDirection(
    firstValue(resolvedSearchParams.direction).trim(),
  );
  const initialTab = resolveTab(firstValue(resolvedSearchParams.tab).trim());

  let partner;
  try {
    partner = await getPartnerSarafiProfile(id);
  } catch (error) {
    if (isPartnerSarafiError(error) && error.code === "NOT_FOUND") {
      notFound();
    }
    throw error;
  }

  const [transfers, commissionSummary, currencies, wallets, customers] =
    await Promise.all(
    [
      getHawalaListItems({
        partnerSarafiId: partner.id,
        search,
        ...(direction === "all" ? {} : { direction }),
      }),
      getPartnerCommissionSummary(partner.id),
      getCurrencyList({ isActive: true }),
      getWalletList({ archiveFilter: "active" }),
      getCustomerList({ archiveFilter: "active" }),
    ],
  );

  const returnParams = new URLSearchParams();
  if (initialTab) {
    returnParams.set("tab", initialTab);
  } else if (search || direction !== "all") {
    returnParams.set("tab", "hawala");
  }
  if (search) {
    returnParams.set("q", search);
  }
  if (direction !== "all") {
    returnParams.set("direction", direction);
  }
  const returnQuery = returnParams.toString();
  const returnTo = returnQuery
    ? `/partner-sarafi/${partner.id}?${returnQuery}`
    : `/partner-sarafi/${partner.id}`;

  return (
    <PartnerSarafiProfileView
      partner={partner}
      transfers={transfers}
      commissionSummary={commissionSummary}
      customerOptions={customers.map((customer) => ({
        id: customer.id,
        fullName: customer.fullName,
        label: customer.code
          ? `${customer.code} · ${customer.fullName}`
          : customer.fullName,
        phone: customer.phone,
      }))}
      currencyOptions={currencies.map((currency) => ({
        code: currency.code,
        label: `${currency.code} — ${currency.name}`,
      }))}
      cashWallets={wallets
        .filter((wallet) => wallet.type === "TILL" || wallet.type === "VAULT")
        .map((wallet) => ({ id: wallet.id, label: wallet.name }))}
      search={search}
      direction={direction}
      initialTab={initialTab}
      returnTo={returnTo}
    />
  );
}
