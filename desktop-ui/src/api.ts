/** Typed wrappers around Tauri `invoke` (ADR-042). */

import { invoke } from "@tauri-apps/api/core";

export type AppInfo = {
  name: string;
  version: string;
  dbPath: string;
  backend: string;
};

export type AuthSession = {
  userId: string;
  username: string;
  fullName: string;
  role: string;
  token: string;
  allowedScreens?: string | null;
};

export type CustomerListItem = {
  id: string;
  code: string | null;
  fullName: string;
  fatherName: string | null;
  phone: string | null;
  address: string | null;
  isActive: boolean;
  isArchived: boolean;
  createdAt: string;
};

export type CustomerListPage = {
  items: CustomerListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type CustomerDetail = {
  id: string;
  code: string | null;
  fullName: string;
  fatherName: string | null;
  phone: string | null;
  address: string | null;
  nationalId: string | null;
  notes: string | null;
  isActive: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CurrencyListItem = {
  id: string;
  code: string;
  name: string;
  symbol: string | null;
  decimalPlaces: number;
  isActive: boolean;
};

export type CurrencyListPage = {
  items: CurrencyListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type WalletListItem = {
  id: string;
  name: string;
  type: string;
  customerId: string | null;
  isActive: boolean;
};

export type WalletListPage = {
  items: WalletListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type PostedTransaction = {
  id: string;
  reference: string;
  type: string;
  status: string;
  valueDate: string;
  ledgerEntries: Array<{
    id: string;
    walletId: string;
    currencyId: string;
    direction: string;
    amount: string;
    memo: string | null;
  }>;
};

export type TransactionListItem = {
  id: string;
  reference: string;
  type: string;
  status: string;
  customerName: string | null;
  description: string | null;
  valueDate: string;
  createdAt: string;
  amountSummary: string;
};

export type TransactionListPage = {
  items: TransactionListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type CustomerLedgerRow = {
  id: string;
  reference: string;
  type: string;
  status: string;
  description: string | null;
  valueDate: string;
  createdAt: string;
  activity: string;
  amountSummary: string;
  flow: "IN" | "OUT" | "MIXED" | "NONE" | string;
};

export type CustomerLedgerPage = {
  items: CustomerLedgerRow[];
  total: number;
  page: number;
  pageSize: number;
};

export type TransactionLedgerLine = {
  id: string;
  walletName: string;
  walletType: string;
  currencyCode: string;
  currencySymbol: string | null;
  direction: string;
  amount: string;
  memo: string | null;
};

export type TransactionDetail = {
  id: string;
  reference: string;
  type: string;
  status: string;
  customerId: string | null;
  customerName: string | null;
  walkInName: string | null;
  walkInPhone: string | null;
  description: string | null;
  valueDate: string;
  postedAt: string | null;
  createdAt: string;
  activity: string;
  lines: TransactionLedgerLine[];
};

export function ping() {
  return invoke<string>("ping");
}

export function getAppInfo() {
  return invoke<AppInfo>("get_app_info");
}

export function login(username: string, password: string) {
  return invoke<AuthSession>("login", { input: { username, password } });
}

export function logout(token: string) {
  return invoke<void>("logout", { input: { token } });
}

export function currentUser(token: string) {
  return invoke<AuthSession | null>("current_user", { input: { token } });
}

export function listCustomersPage(input: {
  search?: string;
  archiveFilter?: "active" | "archived" | "all";
  page?: number;
  pageSize?: number;
}) {
  return invoke<CustomerListPage>("list_customers_page", { input });
}

export function getCustomer(id: string) {
  return invoke<CustomerDetail>("get_customer", { input: { id } });
}

export type CustomerBalanceRow = {
  currencyCode: string;
  currencySymbol: string | null;
  balanceDisplay: string;
};

export function getCustomerBalances(customerId: string) {
  return invoke<CustomerBalanceRow[]>("get_customer_balances", {
    customerId,
  });
}

export type CustomerBalancesBatchItem = {
  customerId: string;
  balances: CustomerBalanceRow[];
};

export function getCustomersBalancesBatch(customerIds: string[]) {
  return invoke<CustomerBalancesBatchItem[]>("get_customers_balances_batch", {
    customerIds,
  });
}

export function createCustomer(input: {
  fullName: string;
  fatherName?: string | null;
  phone: string;
  address?: string | null;
  nationalId?: string | null;
  notes?: string | null;
  openingKata?: Array<{
    currencyCode: string;
    amount: string;
    direction?: string | null;
    description?: string | null;
    notes?: string | null;
    valueDate?: string | null;
  }> | null;
  openingBalanceAmount?: string | null;
  openingBalanceCurrencyCode?: string | null;
  actorUserId: string;
}) {
  return invoke<CustomerDetail>("create_customer", { input });
}

export function updateCustomer(input: {
  id: string;
  fullName: string;
  fatherName?: string | null;
  phone: string;
  address?: string | null;
  nationalId?: string | null;
  notes?: string | null;
  actorUserId?: string | null;
  openingKata?: Array<{
    currencyCode: string;
    amount: string;
    direction?: string | null;
    description?: string | null;
    notes?: string | null;
    valueDate?: string | null;
  }> | null;
}) {
  return invoke<CustomerDetail>("update_customer", { input });
}

export function archiveCustomer(id: string) {
  return invoke<{ id: string; isArchived: boolean }>("archive_customer", {
    input: { id },
  });
}

export function restoreCustomer(id: string) {
  return invoke<{ id: string; isArchived: boolean }>("restore_customer", {
    input: { id },
  });
}

export function listCurrenciesPage(input?: {
  activeOnly?: boolean;
  page?: number;
  pageSize?: number;
}) {
  return invoke<CurrencyListPage>("list_currencies_page", {
    input: input ?? {},
  });
}

export function createCurrency(input: {
  code: string;
  name: string;
  symbol?: string | null;
  decimalPlaces?: number;
  isActive?: boolean;
}) {
  return invoke<CurrencyListItem>("create_currency", { input });
}

export function updateCurrency(input: {
  id: string;
  name: string;
  symbol?: string | null;
  decimalPlaces?: number;
  isActive?: boolean;
}) {
  return invoke<CurrencyListItem>("update_currency", { input });
}

export type DeskScreenOption = {
  id: string;
  label: string;
};

export type UserAccount = {
  id: string;
  fullName: string;
  username: string;
  role: string;
  isActive: boolean;
  allowedScreens: string[];
  createdAt: string;
  updatedAt: string;
};

export function listDeskScreens() {
  return invoke<DeskScreenOption[]>("list_desk_screens");
}

export function listUsers() {
  return invoke<UserAccount[]>("list_users");
}

export function createUser(input: {
  fullName: string;
  username: string;
  password: string;
  role: string;
  isActive?: boolean;
  allowedScreens?: string[] | null;
}) {
  return invoke<UserAccount>("create_user", { input });
}

export function updateUser(input: {
  id: string;
  fullName: string;
  role: string;
  isActive: boolean;
  allowedScreens?: string[] | null;
  actorUserId?: string | null;
}) {
  return invoke<UserAccount>("update_user", { input });
}

export function resetUserPassword(input: { id: string; password: string }) {
  return invoke<UserAccount>("reset_user_password", { input });
}

export function listWalletsPage(input?: {
  walletType?: string;
  activeOnly?: boolean;
  customerId?: string;
  page?: number;
  pageSize?: number;
}) {
  return invoke<WalletListPage>("list_wallets_page", { input: input ?? {} });
}

export function listTransactionsPage(input?: {
  page?: number;
  pageSize?: number;
  txType?: string;
  search?: string;
  customerId?: string;
}) {
  return invoke<TransactionListPage>("list_transactions_page", {
    input: input ?? {},
  });
}

export function listCustomerLedger(input: {
  customerId: string;
  page?: number;
  pageSize?: number;
}) {
  return invoke<CustomerLedgerPage>("list_customer_ledger", { input });
}

export function getTransactionDetail(id: string) {
  return invoke<TransactionDetail>("get_transaction_detail", {
    input: { id },
  });
}

export function depositFunds(input: {
  reference: string;
  customerWalletId: string;
  cashWalletId: string;
  currencyCode: string;
  amount: string;
  valueDate?: string;
  description?: string;
  createdById: string;
}) {
  return invoke<PostedTransaction>("deposit_funds", { input });
}

export function withdrawFunds(input: {
  reference: string;
  customerWalletId: string;
  cashWalletId: string;
  currencyCode: string;
  amount: string;
  valueDate?: string;
  description?: string;
  createdById: string;
}) {
  return invoke<PostedTransaction>("withdraw_funds", { input });
}

export type CustomerMoneyResult = {
  transaction: PostedTransaction;
  customerId: string;
  customerName: string;
  currencyCode: string;
  amount: string;
  direction: string;
  previousBalance: string;
  newBalance: string;
  cashWalletId: string;
};

export function customerAddMoney(input: {
  customerId: string;
  currencyCode: string;
  amount: string;
  valueDate?: string;
  description?: string;
  notes?: string;
  reference?: string;
  paymentMethod?: string;
  cashWalletId?: string;
  createdById: string;
}) {
  return invoke<CustomerMoneyResult>("customer_add_money", { input });
}

export function customerTakeMoney(input: {
  customerId: string;
  currencyCode: string;
  amount: string;
  valueDate?: string;
  description?: string;
  notes?: string;
  reference?: string;
  paymentMethod?: string;
  cashWalletId?: string;
  createdById: string;
}) {
  return invoke<CustomerMoneyResult>("customer_take_money", { input });
}

export function transferFunds(input: {
  reference: string;
  senderCustomerId: string;
  receiverCustomerId: string;
  currencyCode: string;
  amount: string;
  valueDate?: string;
  description?: string;
  createdById: string;
}) {
  return invoke<PostedTransaction>("transfer_funds", { input });
}

export type CashBalanceRow = {
  currencyCode: string;
  currencySymbol: string | null;
  balanceDisplay: string;
  amountMinor: string;
};

export function getCashBalances() {
  return invoke<CashBalanceRow[]>("get_cash_balances");
}

export type ExchangeRateItem = {
  id: string;
  baseCode: string;
  quoteCode: string;
  rate: string;
  effectiveAt: string;
};

export function listLatestExchangeRates() {
  return invoke<ExchangeRateItem[]>("list_latest_exchange_rates");
}

export type MarketRateRow = {
  code: string;
  name: string | null;
  rate: string;
};

export type MarketRatesSnapshot = {
  baseCode: string;
  fetchedAt: string | null;
  provider: string;
  providerTime: string | null;
  rates: MarketRateRow[];
  hasCache: boolean;
  lastError: string | null;
  refreshed: boolean;
};

/** Local cache only — no network. Safe to call from Rates screen mount. */
export function getCachedMarketRates() {
  return invoke<MarketRatesSnapshot>("get_cached_market_rates");
}

export type MarketRatesConfig = {
  baseCode: string;
  currencyCodes: string[];
  fetchUrl: string;
};

export function getMarketRatesConfig() {
  return invoke<MarketRatesConfig>("get_market_rates_config");
}

/** Persist rates fetched by the Rates page (WebView HTTPS). */
export function saveMarketRatesCache(input: {
  baseCode: string;
  payload: unknown;
  providerTime?: string | null;
  lastError?: string | null;
}) {
  return invoke<MarketRatesSnapshot>("save_market_rates_cache", { input });
}

export type HawalaListItem = {
  id: string;
  reference: string;
  direction: string;
  status: string;
  priority?: string | null;
  senderName: string | null;
  receiverName: string | null;
  partnerSarafi: string | null;
  destinationCity?: string | null;
  destinationCountry?: string | null;
  amount: string;
  currencyCode: string;
  ownCommission?: string | null;
  partnerCommission?: string | null;
  valueDate: string;
  createdByName?: string | null;
  isArchived?: boolean;
};

export type HawalaListPage = {
  items: HawalaListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export function listHawalaPage(input?: {
  page?: number;
  pageSize?: number;
  direction?: string;
  search?: string;
  archiveFilter?: "active" | "archived" | "all";
}) {
  return invoke<HawalaListPage>("list_hawala_page", { input: input ?? {} });
}

export function listHawalaDesk(input?: Record<string, unknown>) {
  return invoke<HawalaListPage>("list_hawala_desk", { input: input ?? {} });
}

export type HawalaEventItem = {
  id: string;
  eventType: string;
  fromStatus: string | null;
  toStatus: string | null;
  summary: string;
  reason: string | null;
  actorName: string | null;
  createdAt: string;
};

export type HawalaDetail = {
  id: string;
  reference: string;
  direction: string;
  status: string;
  priority: string | null;
  purpose: string | null;
  senderName: string;
  senderPhone: string | null;
  senderNationalId: string | null;
  senderAddress: string | null;
  senderCustomerId: string | null;
  receiverName: string;
  receiverPhone: string | null;
  receiverNationalId: string | null;
  receiverAddress: string | null;
  receiverReference: string | null;
  receiverCustomerId: string | null;
  partnerSarafi: string;
  partnerSarafiId: string | null;
  partnerBranch: string | null;
  originCity: string;
  originCountry: string;
  destinationCity: string;
  destinationCountry: string;
  specialInstructions: string | null;
  currencyCode: string;
  amount: string;
  receiveCurrencyCode: string | null;
  receiveAmount: string | null;
  exchangeRate: string | null;
  ownCommissionAmount: string | null;
  partnerCommissionAmount: string | null;
  additionalCharges: string | null;
  discountAmount: string | null;
  ownCommissionMode: string | null;
  partnerCommissionMode: string | null;
  settlementType: string | null;
  settlementDate: string | null;
  settlementNotes: string | null;
  notes: string | null;
  internalNotes: string | null;
  customerNotes: string | null;
  privateNotes: string | null;
  cashWalletId: string;
  valueDate: string;
  expectedDeliveryDate: string | null;
  expectedDeliveryTime: string | null;
  createdById: string;
  createdByName: string | null;
  transactionId: string | null;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  receivedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  returnedAt: string | null;
  deletedAt: string | null;
  events: HawalaEventItem[];
};

export function getHawala(id: string) {
  return invoke<HawalaDetail>("get_hawala", { input: { id } });
}

export function setHawalaStatus(input: {
  id: string;
  status: string;
  reason?: string | null;
  actorUserId?: string | null;
}) {
  return invoke<HawalaDetail>("set_hawala_status", { input });
}

export function archiveHawala(input: {
  id: string;
  actorUserId?: string | null;
  reason?: string | null;
}) {
  return invoke<HawalaDetail>("archive_hawala", { input });
}

export function restoreHawala(input: {
  id: string;
  actorUserId?: string | null;
  reason?: string | null;
}) {
  return invoke<HawalaDetail>("restore_hawala", { input });
}

export function updateHawalaMeta(input: Record<string, unknown>) {
  return invoke<HawalaDetail>("update_hawala_meta", { input });
}

export function nextHawalaReference() {
  return invoke<string>("next_hawala_reference");
}

export type HawalaCustomerContext = {
  customerId: string;
  fullName: string;
  phone: string | null;
  address: string | null;
  nationalId: string | null;
  balances: Array<{ currencyCode: string; balance: string }>;
  hawalaCount: number;
  lastHawalaAt: string | null;
};

export function getHawalaCustomerContext(customerId: string) {
  return invoke<HawalaCustomerContext>("get_hawala_customer_context", {
    input: { customerId },
  });
}

export type PartnerHawalaStats = {
  partnerId: string;
  total: number;
  pending: number;
  completed: number;
  cancelled: number;
  lastTransactionAt: string | null;
};

export function getPartnerHawalaStats(id: string) {
  return invoke<PartnerHawalaStats>("get_partner_hawala_stats", {
    input: { id },
  });
}

export type ExchangeFundsResult = {
  transaction: PostedTransaction;
  fromCurrencyCode: string;
  toCurrencyCode: string;
  fromAmount: string;
  toAmount: string;
  rate: string;
  exchangeRateId: string;
  highCurrencyCode: string;
  lowCurrencyCode: string;
  dealRate: string;
  boardRate: string | null;
  side: string;
  profitAmount: string;
  profitCurrencyCode: string;
  isProfit: boolean;
};

export function exchangeFunds(input: {
  reference: string;
  fromWalletId: string;
  toWalletId: string;
  fromCurrencyCode: string;
  toCurrencyCode: string;
  amount: string;
  toAmount: string;
  dealRate?: string;
  boardRate?: string;
  highCurrencyCode?: string;
  customerId?: string | null;
  walkInName?: string | null;
  walkInPhone?: string | null;
  valueDate?: string;
  description?: string;
  createdById: string;
}) {
  return invoke<ExchangeFundsResult>("exchange_funds", { input });
}

export type ExchangePnLSummary = {
  businessDate: string;
  totalDeals: number;
  byCurrency: Array<{
    currencyCode: string;
    profitAmount: string;
    dealCount: number;
  }>;
  recent: Array<{
    reference: string;
    side: string;
    fromAmount: string;
    fromCurrency: string;
    toAmount: string;
    toCurrency: string;
    dealRate: string;
    boardRate: string | null;
    profitAmount: string;
    profitCurrency: string;
    valueDate: string;
  }>;
};

export function getExchangePnLSummary(businessDate?: string) {
  return invoke<ExchangePnLSummary>("get_exchange_pnl_summary", {
    input: { businessDate: businessDate ?? null },
  });
}

export type PartnerListItem = {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
};

export function listPartners() {
  return invoke<PartnerListItem[]>("list_partners");
}

export type PartnerDetail = {
  id: string;
  name: string;
  phone: string | null;
  city: string | null;
  country: string | null;
  notes: string | null;
  isActive: boolean;
  isArchived: boolean;
  commissionEnabled: boolean;
  commissionPerAmount: string | null;
  commissionFeeAmount: string | null;
  commissionCurrencyId: string | null;
  commissionCurrencyCode: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PartnerListPage = {
  items: PartnerDetail[];
  total: number;
  page: number;
  pageSize: number;
};

export function listPartnersPage(input?: {
  search?: string;
  archiveFilter?: "active" | "archived" | "all";
  page?: number;
  pageSize?: number;
}) {
  return invoke<PartnerListPage>("list_partners_page", { input: input ?? {} });
}

export function getPartner(id: string) {
  return invoke<PartnerDetail>("get_partner", { input: { id } });
}

export function createPartner(input: {
  name: string;
  phone?: string | null;
  city?: string | null;
  country?: string | null;
  notes?: string | null;
}) {
  return invoke<PartnerDetail>("create_partner", { input });
}

export function updatePartner(input: {
  id: string;
  name: string;
  phone?: string | null;
  city?: string | null;
  country?: string | null;
  notes?: string | null;
  isActive?: boolean;
}) {
  return invoke<PartnerDetail>("update_partner", { input });
}

export type PartnerCommissionCurrencyRow = {
  currencyId: string;
  currencyCode: string;
  currencySymbol: string | null;
  payable: string;
  receivable: string;
  openBalance: string;
  hawalaCount: number;
};

export type PartnerCommissionSummary = {
  partnerId: string;
  partnerName: string;
  byCurrency: PartnerCommissionCurrencyRow[];
};

export function getPartnerCommissionSummary(id: string) {
  return invoke<PartnerCommissionSummary>("get_partner_commission_summary", {
    input: { id },
  });
}

export function settlePartnerCommission(input: {
  partnerSarafiId: string;
  kind: "PAY_PARTNER" | "COLLECT_FROM_PARTNER";
  currencyCode: string;
  amount: string;
  cashWalletId: string;
  notes?: string;
  valueDate?: string;
  createdById: string;
}) {
  return invoke<{
    settlementId: string;
    transactionId: string;
    reference: string;
    kind: string;
    amount: string;
    currencyCode: string;
  }>("settle_partner_commission", { input });
}

export function archivePartner(id: string) {
  return invoke<PartnerDetail>("archive_partner", { input: { id } });
}

export type HawalaPostResult = {
  id: string;
  reference: string;
  direction: string;
  status: string;
  transactionId: string;
};

export type HawalaPostInput = {
  reference: string;
  partnerSarafiId: string;
  currencyCode: string;
  amount: string;
  cashWalletId: string;
  clearingWalletId?: string | null;
  senderName?: string | null;
  senderPhone?: string | null;
  receiverName?: string | null;
  receiverPhone?: string | null;
  senderCustomerId?: string | null;
  receiverCustomerId?: string | null;
  originCity: string;
  originCountry: string;
  destinationCity: string;
  destinationCountry: string;
  notes?: string | null;
  partnerCommissionAmount?: string | null;
  ownCommissionAmount?: string | null;
  additionalCharges?: string | null;
  discountAmount?: string | null;
  ownCommissionMode?: string | null;
  partnerCommissionMode?: string | null;
  senderNationalId?: string | null;
  senderAddress?: string | null;
  receiverNationalId?: string | null;
  receiverAddress?: string | null;
  receiverReference?: string | null;
  partnerBranch?: string | null;
  specialInstructions?: string | null;
  purpose?: string | null;
  priority?: string | null;
  expectedDeliveryDate?: string | null;
  expectedDeliveryTime?: string | null;
  receiveCurrencyCode?: string | null;
  receiveAmount?: string | null;
  exchangeRate?: string | null;
  settlementType?: string | null;
  settlementNotes?: string | null;
  internalNotes?: string | null;
  customerNotes?: string | null;
  privateNotes?: string | null;
  valueDate?: string;
  createdById: string;
};

export function sendHawala(input: HawalaPostInput) {
  return invoke<HawalaPostResult>("send_hawala", { input });
}

export function receiveHawala(input: HawalaPostInput) {
  return invoke<HawalaPostResult>("receive_hawala", { input });
}

export type BackupResult = {
  stamp: string;
  checksum: string;
  locations: string[];
  pruned: number;
  warnings: string[];
};

export type BackupListItem = {
  stamp: string;
  path: string;
  sizeBytes: number;
  checksum: string | null;
  createdAt: string;
  reason: string | null;
};

export type RestoreOutcome = {
  stamp: string;
  pending: boolean;
  message: string;
};

export function createDbBackup(reason?: string) {
  return invoke<BackupResult>("create_db_backup", {
    input: { reason: reason ?? "manual" },
  });
}

export function listDbBackups() {
  return invoke<BackupListItem[]>("list_db_backups");
}

export function restoreDbBackup(stamp: string) {
  return invoke<RestoreOutcome>("restore_db_backup", { input: { stamp } });
}

export type LocaleSetting = {
  locale: string;
};

export function getAppLocale() {
  return invoke<LocaleSetting>("get_app_locale");
}

export function setAppLocale(locale: string) {
  return invoke<LocaleSetting>("set_app_locale", { input: { locale } });
}

export type DashboardMonthCounts = {
  transactions: number;
  deposits: number;
  withdrawals: number;
  exchanges: number;
  hawala: number;
  transfers: number;
  tradeBuys: number;
  tradeSells: number;
};

export type DashboardSnapshot = {
  asOfMonth: string;
  monthKey: string;
  month: DashboardMonthCounts;
  customers: { active: number; total: number };
  cash: CashBalanceRow[];
  recentTransactions: TransactionListItem[];
  recentHawala: HawalaListItem[];
  rates: ExchangeRateItem[];
};

export function getDashboardSnapshot() {
  return invoke<DashboardSnapshot>("get_dashboard_snapshot");
}

export type TradeBuyInput = {
  reference?: string;
  inventoryCurrencyCode: string;
  quantity: string;
  rate: string;
  paymentCurrencyCode: string;
  paymentAmount?: string;
  cashWalletId: string;
  counterpartyType: string;
  customerId?: string | null;
  partnerSarafiId?: string | null;
  counterpartyName?: string | null;
  walkInPhone?: string | null;
  notes?: string | null;
  valueDate?: string;
  createdById: string;
};

export type TradeSellInput = TradeBuyInput;

export type TradeResult = {
  id: string;
  reference: string;
  direction: string;
  transactionId: string;
  quantity: string;
  rate: string;
  paymentAmount: string;
  avgCost: string | null;
  cogsAmount: string | null;
  grossProfit: string | null;
  inventoryQtyAfter: string;
};

export function tradeBuy(input: TradeBuyInput) {
  return invoke<TradeResult>("trade_buy", { input });
}

export function tradeSell(input: TradeSellInput) {
  return invoke<TradeResult>("trade_sell", { input });
}

export type TradingInventoryRow = {
  currencyId: string;
  currencyCode: string;
  currencySymbol: string | null;
  quantity: string;
  avgCost: string;
  avgCostCurrencyCode: string;
  costValue: string;
  marketRate: string | null;
  marketValue: string | null;
  unrealizedPnl: string | null;
  lastPurchaseAt: string | null;
  lastSaleAt: string | null;
};

export function listTradingInventory() {
  return invoke<TradingInventoryRow[]>("list_trading_inventory");
}

export type TradingTradeRow = {
  id: string;
  reference: string;
  direction: string;
  inventoryCurrencyCode: string;
  quantity: string;
  rate: string;
  paymentCurrencyCode: string;
  paymentAmount: string;
  counterpartyType: string;
  counterpartyName: string | null;
  avgCostAtPost: string | null;
  cogsAmount: string | null;
  grossProfit: string | null;
  valueDate: string;
  transactionId: string | null;
};

export type TradingTradePage = {
  items: TradingTradeRow[];
  total: number;
  page: number;
  pageSize: number;
};

export function listTradingTrades(input?: {
  direction?: string;
  page?: number;
  pageSize?: number;
  search?: string;
  currencyCode?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  return invoke<TradingTradePage>("list_trading_trades", {
    input: input ?? {},
  });
}

export type TradeDetail = {
  id: string;
  reference: string;
  direction: string;
  status: string;
  inventoryCurrencyCode: string;
  quantity: string;
  rate: string;
  paymentCurrencyCode: string;
  paymentAmount: string;
  cashWalletId: string;
  counterpartyType: string;
  customerId: string | null;
  partnerSarafiId: string | null;
  counterpartyName: string | null;
  notes: string | null;
  avgCostAtPost: string | null;
  cogsAmount: string | null;
  grossProfit: string | null;
  inventoryQtyAfter: string | null;
  valueDate: string;
  transactionId: string | null;
};

export function getTrade(id: string) {
  return invoke<TradeDetail>("get_trade", { input: { id } });
}

export function updateTrade(input: {
  id: string;
  notes?: string | null;
  valueDate?: string | null;
  counterpartyType: string;
  customerId?: string | null;
  partnerSarafiId?: string | null;
  counterpartyName?: string | null;
}) {
  return invoke<TradeDetail>("update_trade", { input });
}

export function archiveTrade(id: string) {
  return invoke<TradeDetail>("archive_trade", { input: { id } });
}

export type TradingDashboard = {
  profitToday: string;
  profitMonth: string;
  openPositions: number;
  buysToday: number;
  salesToday: number;
  closedTradesMonth: number;
  inventoryCostValue: string;
  recentTrades: TradingTradeRow[];
};

export function getTradingDashboard() {
  return invoke<TradingDashboard>("get_trading_dashboard");
}

/* ── Owner Capital ─────────────────────────────────────────────── */

export type CapitalCurrencyBreakdown = {
  currencyId: string;
  currencyCode: string;
  currencyName: string;
  currencySymbol: string | null;
  cash: string;
  customerFunds: string;
  partnerPayable: string;
  partnerReceivable: string;
  pendingHawala: string;
  tradingInventoryCost: string;
  commissionIncome: string;
  ownerCapital: string;
  percentOfTotal: string;
};

export type OwnerCapitalSnapshot = {
  asOf: string;
  totalCash: string;
  totalCustomerFunds: string;
  totalPartnerPayable: string;
  totalPartnerReceivable: string;
  totalPendingHawala: string;
  totalTradingInventory: string;
  totalCommissionIncome: string;
  totalOwnerCapital: string;
  profitToday: string;
  profitMonth: string;
  tradingProfitMonth: string;
  exchangeCountMonth: number;
  hawalaCommissionMonth: string;
  byCurrency: CapitalCurrencyBreakdown[];
};

export function getOwnerCapitalSnapshot() {
  return invoke<OwnerCapitalSnapshot>("get_owner_capital_snapshot");
}

export function postOwnerCapitalMove(input: {
  kind: "INVEST" | "WITHDRAW";
  currencyCode: string;
  amount: string;
  cashWalletId: string;
  notes?: string;
  reason?: string;
  valueDate?: string;
  createdById: string;
}) {
  return invoke<{
    id: string;
    kind: string;
    transactionId: string;
    amount: string;
    currencyCode: string;
  }>("post_owner_capital_move", { input });
}

export type OwnerCapitalEventRow = {
  id: string;
  kind: string;
  currencyCode: string;
  amount: string;
  notes: string | null;
  reason: string | null;
  createdByName: string | null;
  valueDate: string;
  transactionId: string | null;
};

export function listOwnerCapitalEvents(input?: {
  page?: number;
  pageSize?: number;
  kind?: string;
}) {
  return invoke<{
    items: OwnerCapitalEventRow[];
    total: number;
    page: number;
    pageSize: number;
  }>("list_owner_capital_events", { input: input ?? {} });
}

/* ── Expenses ──────────────────────────────────────────────────── */

export type ExpenseCategoryOption = {
  id: string;
  label: string;
};

export function listExpenseCategories() {
  return invoke<ExpenseCategoryOption[]>("list_expense_categories");
}

export function postExpense(input: {
  category: string;
  currencyCode: string;
  amount: string;
  cashWalletId: string;
  notes?: string;
  valueDate?: string;
  createdById: string;
}) {
  return invoke<{
    transactionId: string;
    reference: string;
    category: string;
    amount: string;
    currencyCode: string;
  }>("post_expense", { input });
}

export type ExpenseRow = {
  transactionId: string;
  reference: string;
  category: string;
  categoryLabel: string;
  amount: string;
  currencyCode: string;
  currencyName: string;
  currencySymbol: string | null;
  notes: string | null;
  valueDate: string;
  createdByName: string | null;
  cashWalletName: string | null;
};

export function listExpenses(input?: {
  page?: number;
  pageSize?: number;
  category?: string;
  currencyCode?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  return invoke<{
    items: ExpenseRow[];
    total: number;
    page: number;
    pageSize: number;
  }>("list_expenses", { input: input ?? {} });
}

export type ExpenseSummary = {
  rent: string;
  salary: string;
  utilities: string;
  transport: string;
  office: string;
  other: string;
  total: string;
  byCategory: Array<{ category: string; label: string; amount: string }>;
};

export function getExpenseSummary(input?: {
  dateFrom?: string;
  dateTo?: string;
  currencyCode?: string;
}) {
  return invoke<ExpenseSummary>("get_expense_summary", { input: input ?? {} });
}

export function transferCashBetweenVaults(input: {
  fromWalletId: string;
  toWalletId: string;
  currencyCode: string;
  amount: string;
  notes?: string;
  valueDate?: string;
  createdById: string;
}) {
  return invoke<PostedTransaction>("transfer_cash_between_vaults", { input });
}

/* ── Reports Center ────────────────────────────────────────────── */

export type ReportFilterInput = {
  dateFrom?: string;
  dateTo?: string;
  currencyCode?: string;
  customerId?: string;
  partnerId?: string;
  userId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  direction?: string;
  reference?: string;
  fromCurrencyCode?: string;
  toCurrencyCode?: string;
  status?: string;
  amount?: string;
};

export type ReportCurrencyAmount = {
  currencyCode: string;
  currencySymbol: string | null;
  amount: string;
};

export type BusinessPositionReport = {
  asOf: string;
  totalCash: string;
  customerMoney: string;
  partnerMoney: string;
  ownerMoney: string;
  pendingHawalas: string;
  receivables: string;
  payables: string;
  netBusinessWorth: string;
  tradingInventory: string;
  byCurrency: CapitalCurrencyBreakdown[];
};

export function getBusinessPositionReport() {
  return invoke<BusinessPositionReport>("get_business_position_report");
}

export type CurrencyOwnershipRow = {
  currencyCode: string;
  currencySymbol: string | null;
  cashInVault: string;
  customerFunds: string;
  partnerFunds: string;
  ownerFunds: string;
  pendingHawala: string;
  receivable: string;
  payable: string;
  availableBalance: string;
};

export function getCurrencyOwnershipReport() {
  return invoke<CurrencyOwnershipRow[]>("get_currency_ownership_report");
}

export type PeriodSummaryReport = {
  dateFrom: string;
  dateTo: string;
  deposits: number;
  withdrawals: number;
  transfers: number;
  exchanges: number;
  hawalas: number;
  trades: number;
  adjustments: number;
  totalTransactions: number;
  tradingProfit: string;
  hawalaOwnCommission: string;
};

export function getPeriodSummaryReport(input?: ReportFilterInput) {
  return invoke<PeriodSummaryReport>("get_period_summary_report", {
    input: input ?? {},
  });
}

export type CashByCurrencyRow = {
  currencyCode: string;
  currencySymbol: string | null;
  balance: string;
  vaultBalance: string;
  tillBalance: string;
};

export function getCashByCurrencyReport() {
  return invoke<CashByCurrencyRow[]>("get_cash_by_currency_report");
}

export type CustomerBalanceReportRow = {
  customerId: string;
  customerCode: string | null;
  customerName: string;
  phone: string | null;
  currencyCode: string;
  balance: string;
};

export function getCustomerBalanceReport(input?: ReportFilterInput) {
  return invoke<CustomerBalanceReportRow[]>("get_customer_balance_report", {
    input: input ?? {},
  });
}

export type HawalaReportRow = {
  id: string;
  transactionId: string | null;
  reference: string;
  direction: string;
  status: string;
  amount: string;
  currencyCode: string;
  customerId: string | null;
  customerName: string | null;
  senderName: string | null;
  receiverName: string | null;
  partnerName: string | null;
  destinationCity: string | null;
  destinationCountry: string | null;
  ownCommission: string | null;
  partnerCommission: string | null;
  valueDate: string;
};

export type HawalaReportPage = {
  items: HawalaReportRow[];
  total: number;
  page: number;
  pageSize: number;
  sentCount: number;
  receivedCount: number;
  totalsByCurrency: ReportCurrencyAmount[];
  sentTotals: ReportCurrencyAmount[];
  receivedTotals: ReportCurrencyAmount[];
};

export function getHawalaStatusReport(
  input?: ReportFilterInput,
  status?: string,
) {
  return invoke<HawalaReportPage>("get_hawala_status_report", {
    input: input ?? {},
    status: status ?? null,
  });
}

export type TradingPerformanceReport = {
  dateFrom: string;
  dateTo: string;
  buys: number;
  sells: number;
  grossProfit: string;
  inventoryPositions: number;
  inventoryCostValue: string;
};

export function getTradingPerformanceReport(input?: ReportFilterInput) {
  return invoke<TradingPerformanceReport>("get_trading_performance_report", {
    input: input ?? {},
  });
}

export type PartnerBalanceReportRow = {
  partnerId: string;
  partnerName: string;
  currencyCode: string;
  payable: string;
  receivable: string;
  net: string;
};

export function getPartnerBalanceReport() {
  return invoke<PartnerBalanceReportRow[]>("get_partner_balance_report");
}

export type ReportsOverview = {
  dateFrom: string;
  dateTo: string;
  totalTransactions: number;
  deposits: number;
  withdrawals: number;
  transfers: number;
  exchanges: number;
  hawalas: number;
  trades: number;
  adjustments: number;
  expenses: number;
  moneyIn: ReportCurrencyAmount[];
  moneyOut: ReportCurrencyAmount[];
  netMovement: ReportCurrencyAmount[];
  hawalaSentCount: number;
  hawalaReceivedCount: number;
  hawalaSent: ReportCurrencyAmount[];
  hawalaReceived: ReportCurrencyAmount[];
  exchangeCount: number;
  exchangeProfit: ReportCurrencyAmount[];
  balancesByCurrency: CashByCurrencyRow[];
};

export function getReportsOverview(input?: ReportFilterInput) {
  return invoke<ReportsOverview>("get_reports_overview", {
    input: input ?? {},
  });
}

export type CashFlowTypeRow = {
  txType: string;
  currencyCode: string;
  currencySymbol: string | null;
  moneyIn: string;
  moneyOut: string;
  net: string;
  count: number;
};

export type CashFlowReport = {
  dateFrom: string;
  dateTo: string;
  byCurrency: ReportCurrencyAmount[];
  moneyIn: ReportCurrencyAmount[];
  moneyOut: ReportCurrencyAmount[];
  byType: CashFlowTypeRow[];
};

export function getCashFlowReport(input?: ReportFilterInput) {
  return invoke<CashFlowReport>("get_cash_flow_report", {
    input: input ?? {},
  });
}

export type ExchangeReportRow = {
  id: string;
  transactionId: string;
  reference: string;
  side: string;
  fromAmount: string;
  fromCurrency: string;
  toAmount: string;
  toCurrency: string;
  dealRate: string;
  boardRate: string | null;
  profitAmount: string;
  profitCurrency: string;
  valueDate: string;
  customerId: string | null;
  customerName: string | null;
};

export type ExchangePeriodReport = {
  dateFrom: string;
  dateTo: string;
  totalDeals: number;
  profitByCurrency: ReportCurrencyAmount[];
  givenTotals: ReportCurrencyAmount[];
  receivedTotals: ReportCurrencyAmount[];
  items: ExchangeReportRow[];
  total: number;
  page: number;
  pageSize: number;
};

export function getExchangePeriodReport(input?: ReportFilterInput) {
  return invoke<ExchangePeriodReport>("get_exchange_period_report", {
    input: input ?? {},
  });
}

export type CustomerStatementLine = {
  id: string;
  reference: string;
  type: string;
  status: string;
  description: string | null;
  valueDate: string;
  debit: string;
  credit: string;
  currencyCode: string;
  balanceAfter: string;
};

export type CustomerStatementBalance = {
  currencyCode: string;
  currencySymbol: string | null;
  opening: string;
  moneyIn: string;
  moneyOut: string;
  closing: string;
};

export type CustomerStatementReport = {
  customerId: string;
  customerName: string;
  customerCode: string | null;
  dateFrom: string;
  dateTo: string;
  moneyIn: ReportCurrencyAmount[];
  moneyOut: ReportCurrencyAmount[];
  balances: CustomerStatementBalance[];
  lines: CustomerStatementLine[];
};

export function getCustomerStatementReport(input: ReportFilterInput) {
  return invoke<CustomerStatementReport>("get_customer_statement_report", {
    input,
  });
}

export type TransactionsReportRow = {
  id: string;
  reference: string;
  type: string;
  status: string;
  customerId: string | null;
  customerName: string | null;
  description: string | null;
  valueDate: string;
  amountSummary: string;
};

export type TransactionsReportPage = {
  dateFrom: string;
  dateTo: string;
  items: TransactionsReportRow[];
  total: number;
  page: number;
  pageSize: number;
};

export function getTransactionsReport(
  input?: ReportFilterInput,
  txType?: string,
) {
  return invoke<TransactionsReportPage>("get_transactions_report", {
    input: input ?? {},
    txType: txType ?? null,
  });
}

export type DayCurrencyPosition = {
  currencyCode: string;
  currencySymbol: string | null;
  opening: string;
  moneyIn: string;
  moneyOut: string;
  net: string;
  closing: string;
};

export type DailyReport = {
  businessDate: string;
  positions: DayCurrencyPosition[];
  moneyIn: ReportCurrencyAmount[];
  moneyOut: ReportCurrencyAmount[];
  netMovement: ReportCurrencyAmount[];
  deposits: number;
  withdrawals: number;
  transfers: number;
  exchanges: number;
  hawalas: number;
  otherTransactions: number;
  totalTransactions: number;
  hawalaSentCount: number;
  hawalaReceivedCount: number;
  hawalaSent: ReportCurrencyAmount[];
  hawalaReceived: ReportCurrencyAmount[];
  exchangeCount: number;
  exchangeProfit: ReportCurrencyAmount[];
  transactions: TransactionsReportRow[];
};

export function getDailyReport(businessDate: string) {
  return invoke<DailyReport>("get_daily_report", { businessDate });
}

export type MonthlyDayRow = {
  businessDate: string;
  totalTransactions: number;
  deposits: number;
  withdrawals: number;
  transfers: number;
  exchanges: number;
  hawalas: number;
  moneyIn: ReportCurrencyAmount[];
  moneyOut: ReportCurrencyAmount[];
  netMovement: ReportCurrencyAmount[];
};

export type MonthlyReport = {
  yearMonth: string;
  dateFrom: string;
  dateTo: string;
  positions: DayCurrencyPosition[];
  moneyIn: ReportCurrencyAmount[];
  moneyOut: ReportCurrencyAmount[];
  netMovement: ReportCurrencyAmount[];
  hawalaSentCount: number;
  hawalaReceivedCount: number;
  hawalaSent: ReportCurrencyAmount[];
  hawalaReceived: ReportCurrencyAmount[];
  exchangeCount: number;
  exchangeProfit: ReportCurrencyAmount[];
  totalTransactions: number;
  deposits: number;
  withdrawals: number;
  transfers: number;
  exchanges: number;
  hawalas: number;
  days: MonthlyDayRow[];
};

export function getMonthlyReport(yearMonth: string) {
  return invoke<MonthlyReport>("get_monthly_report", { yearMonth });
}

/* ── Daybook (Daily Journal) ───────────────────────────────────── */

export type DaybookSnapshot = {
  businessDate: string;
  currentTime: string;
  day: {
    id: string | null;
    businessDate: string;
    status: string;
    openedAt: string | null;
    openedByName: string | null;
    closedAt: string | null;
    closedByName: string | null;
    differenceReason: string | null;
    hasCashDifference: boolean;
  };
  dailySummary: {
    totalTransactions: number;
    cashIn: string;
    cashOut: string;
    exchangeTransactions: number;
    hawalaTransactions: number;
    tradingTransactions: number;
    customerDeposits: number;
    customerWithdrawals: number;
    todaysProfit: string;
    todaysExpenses: string;
    netProfit: string;
  };
  cashPosition: Array<{
    currencyId: string;
    currencyCode: string;
    currencySymbol: string | null;
    opening: string;
    received: string;
    paid: string;
    expectedClosing: string;
    actualClosing: string | null;
    difference: string | null;
    flag: string;
  }>;
  currencySummary: Array<{
    currencyCode: string;
    openingBalance: string;
    purchased: string;
    sold: string;
    deposited: string;
    withdrawn: string;
    transferred: string;
    closingBalance: string;
    inventoryValue: string;
  }>;
  timeline: Array<{
    id: string;
    time: string;
    reference: string;
    module: string;
    transactionType: string;
    customerName: string | null;
    partnerName: string | null;
    currencyCode: string | null;
    amount: string | null;
    userName: string | null;
    status: string;
    detailPath: string | null;
  }>;
  timelineTotal: number;
  timelinePage: number;
  timelinePageSize: number;
  profit: {
    exchangeProfit: string;
    tradingProfit: string;
    commissionIncome: string;
    otherIncome: string;
    expenses: string;
    netDailyProfit: string;
  };
  hawala: {
    newHawalas: number;
    completed: number;
    pending: number;
    cancelled: number;
    returned: number;
    commissionEarned: string;
    pendingSettlement: string;
    outstandingPartnerBalance: string;
  };
  customers: {
    newCustomers: number;
    returningCustomers: number;
    topCustomer: string | null;
    largestTransaction: string | null;
    highestDeposit: string | null;
    highestWithdrawal: string | null;
    mostActiveCustomer: string | null;
  };
  partners: {
    partnerTransactions: number;
    partnerCommission: string;
    outstandingSettlements: string;
    topPartner: string | null;
    largestTransfer: string | null;
    pendingSettlements: number;
  };
  trading: {
    purchases: number;
    sales: number;
    tradingProfit: string;
    openPositions: number;
    closedPositions: number;
    bestCurrency: string | null;
    worstCurrency: string | null;
  };
  expenses: {
    rent: string;
    salary: string;
    utilities: string;
    transport: string;
    office: string;
    other: string;
    total: string;
  };
  alerts: Array<{ severity: string; code: string; message: string }>;
};

export function getDaybookSnapshot(input?: {
  businessDate?: string;
  currencyCode?: string;
  customerId?: string;
  partnerId?: string;
  userId?: string;
  module?: string;
  txType?: string;
  status?: string;
  search?: string;
  timelinePage?: number;
  timelinePageSize?: number;
}) {
  return invoke<DaybookSnapshot>("get_daybook_snapshot", { input: input ?? {} });
}

export function openBusinessDay(input: {
  businessDate?: string;
  openedById: string;
  notes?: string;
}) {
  return invoke<{ id: string; businessDate: string; status: string }>(
    "open_business_day",
    { input },
  );
}

export function closeBusinessDay(input: {
  businessDate?: string;
  closedById: string;
  differenceReason?: string;
  notes?: string;
  acknowledgeDifferences: boolean;
  cashCounts: Array<{ currencyCode: string; actualClosing: string }>;
}) {
  return invoke<{ id: string; businessDate: string; status: string }>(
    "close_business_day",
    { input },
  );
}

export type BusinessDayHistoryRow = {
  id: string;
  businessDate: string;
  status: string;
  openedByName: string | null;
  closedByName: string | null;
  openedAt: string | null;
  closedAt: string | null;
  transactionCount: number | null;
  profit: string | null;
  expenses: string | null;
  hasCashDifference: boolean;
};

export function listBusinessDays(input?: { page?: number; pageSize?: number }) {
  return invoke<{
    items: BusinessDayHistoryRow[];
    total: number;
    page: number;
    pageSize: number;
  }>("list_business_days", { input: input ?? {} });
}

export type DaybookDashboardWidget = {
  businessDate: string;
  status: string;
  totalTransactions: number;
  todaysProfit: string;
  todaysExpenses: string;
  pendingHawalas: number;
  pendingSettlements: string;
  cashDifference: boolean;
  cash: DaybookSnapshot["cashPosition"];
};

export function getDaybookDashboardWidget() {
  return invoke<DaybookDashboardWidget>("get_daybook_dashboard_widget");
}

/* ── Vault Management ──────────────────────────────────────────── */

export type VaultListItem = {
  id: string;
  name: string;
  code: string | null;
  location: string | null;
  description: string | null;
  notes: string | null;
  vaultType: string;
  isActive: boolean;
  responsibleUserId: string | null;
  responsibleUserName: string | null;
  currencyCount: number;
  totalBalanceDisplay: string;
  lastActivityAt: string | null;
  createdAt: string;
};

export type VaultDashboard = {
  totalVaults: number;
  activeVaults: number;
  totalCashHeld: string;
  totalCurrencies: number;
  transfersToday: number;
  pendingReconciliations: number;
  vaultDifferences: number;
  vaults: VaultListItem[];
};

export function getVaultDashboard() {
  return invoke<VaultDashboard>("get_vault_dashboard");
}

export function upsertVault(input: {
  id?: string;
  name: string;
  code?: string;
  location?: string;
  description?: string;
  notes?: string;
  vaultType?: "VAULT" | "TILL";
  responsibleUserId?: string | null;
  isActive?: boolean;
  createdById?: string;
}) {
  return invoke<VaultListItem>("upsert_vault", { input });
}

export function archiveVault(id: string, createdById?: string) {
  return invoke<VaultListItem>("archive_vault", {
    id,
    createdById: createdById ?? null,
  });
}

export type VaultCurrencyBalance = {
  currencyId: string;
  currencyCode: string;
  currencySymbol: string | null;
  currentBalance: string;
  openingBalance: string;
  cashInToday: string;
  cashOutToday: string;
  expectedClosing: string;
  lastMovementAt: string | null;
};

export type VaultDetail = {
  vault: VaultListItem;
  balances: VaultCurrencyBalance[];
};

export function getVaultDetail(id: string, businessDate?: string) {
  return invoke<VaultDetail>("get_vault_detail", {
    id,
    businessDate: businessDate ?? null,
  });
}

export function transferBetweenVaults(input: {
  fromVaultId: string;
  toVaultId: string;
  currencyCode: string;
  amount: string;
  reason?: string;
  notes?: string;
  valueDate?: string;
  createdById: string;
}) {
  return invoke<PostedTransaction>("transfer_between_vaults", { input });
}

export type VaultMovementRow = {
  transactionId: string;
  reference: string;
  transactionType: string;
  valueDate: string;
  currencyCode: string;
  amount: string;
  direction: string;
  walletName: string;
  counterpartyWallet: string | null;
  userName: string | null;
  description: string | null;
  status: string;
};

export function listVaultMovements(input?: {
  vaultId?: string;
  dateFrom?: string;
  dateTo?: string;
  currencyCode?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  return invoke<{
    items: VaultMovementRow[];
    total: number;
    page: number;
    pageSize: number;
  }>("list_vault_movements", { input: input ?? {} });
}

export function reconcileVault(input: {
  vaultId: string;
  businessDate?: string;
  differenceReason?: string;
  notes?: string;
  confirm: boolean;
  createdById: string;
  lines: Array<{
    currencyCode: string;
    physicalAmount: string;
    reason?: string;
    denominations?: Array<{
      denominationId?: string;
      label: string;
      value: string;
      quantity: number;
    }>;
  }>;
}) {
  return invoke<{ id: string; status: string; hasDifference: boolean }>(
    "reconcile_vault",
    { input },
  );
}

export type CurrencyDenominationRow = {
  id: string;
  currencyCode: string;
  label: string;
  value: string;
  sortOrder: number;
  isActive: boolean;
};

export function listCurrencyDenominations(currencyCode?: string) {
  return invoke<CurrencyDenominationRow[]>("list_currency_denominations", {
    currencyCode: currencyCode ?? null,
  });
}

export type UserLite = {
  id: string;
  fullName: string;
  username: string;
};

export function listUsersLite(activeOnly = true) {
  return invoke<UserLite[]>("list_users_lite", {
    input: { activeOnly },
  });
}

export type VaultAuditRow = {
  id: string;
  action: string;
  entityId: string;
  userName: string | null;
  beforeValues: string | null;
  afterValues: string | null;
  createdAt: string;
};

export function listVaultAudit(input?: {
  vaultId?: string;
  page?: number;
  pageSize?: number;
}) {
  return invoke<{
    items: VaultAuditRow[];
    total: number;
    page: number;
    pageSize: number;
  }>("list_vault_audit", {
    vaultId: input?.vaultId ?? null,
    page: input?.page ?? null,
    pageSize: input?.pageSize ?? null,
  });
}

export function updateVaultMovement(input: {
  transactionId: string;
  reason?: string;
  amount?: string;
  createdById: string;
}) {
  return invoke<PostedTransaction>("update_vault_movement", { input });
}

export function deleteVaultMovement(input: {
  transactionId: string;
  reason?: string;
  createdById: string;
}) {
  return invoke<void>("delete_vault_movement", { input });
}


