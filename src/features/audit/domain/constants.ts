/**
 * Suggested audit module identifiers.
 * Callers may pass any non-empty string; prefer these constants for consistency.
 */
export const AUDIT_MODULES = {
  AUTH: "auth",
  CUSTOMERS: "customers",
  TRANSACTIONS: "transactions",
  HAWALA: "hawala",
  EXCHANGE: "exchange",
  EXCHANGE_RATES: "exchange-rates",
  CURRENCIES: "currencies",
  PARTNER_SARAFI: "partner-sarafi",
  SETTINGS: "settings",
  WALLETS: "wallets",
  TRANSFERS: "transfers",
  USERS: "users",
  BACKUP: "backup",
} as const;

export type AuditModule =
  (typeof AUDIT_MODULES)[keyof typeof AUDIT_MODULES];

/**
 * Suggested audit action verbs.
 * Callers may pass any non-empty string; prefer these constants for consistency.
 */
export const AUDIT_ACTIONS = {
  LOGIN_SUCCESS: "auth.login.success",
  LOGIN_FAILURE: "auth.login.failure",
  LOGOUT: "auth.logout",

  CUSTOMER_CREATE: "customer.create",
  CUSTOMER_UPDATE: "customer.update",
  CUSTOMER_ARCHIVE: "customer.archive",

  TRANSACTION_POST: "transaction.post",
  TRANSACTION_DEPOSIT: "transaction.deposit",
  TRANSACTION_WITHDRAWAL: "transaction.withdrawal",
  TRANSACTION_ADJUSTMENT: "transaction.adjustment",
  TRANSACTION_EXTERNAL_MONEY: "transaction.external_money",
  TRANSACTION_EXTERNAL_MONEY_UPDATE: "transaction.external_money.update",
  TRANSACTION_EXTERNAL_MONEY_ARCHIVE: "transaction.external_money.archive",
  TRANSACTION_EXCHANGE: "transaction.exchange",
  TRANSACTION_TRANSFER: "transaction.transfer",

  HAWALA_SEND: "hawala.send",
  HAWALA_RECEIVE: "hawala.receive",
  HAWALA_CANCEL: "hawala.cancel",
  HAWALA_COMPLETE: "hawala.complete",
  HAWALA_UPDATE: "hawala.update",
  HAWALA_ARCHIVE: "hawala.archive",

  EXCHANGE_RATE_CREATE: "exchange_rate.create",
  EXCHANGE_RATE_UPDATE: "exchange_rate.update",
  EXCHANGE_RATE_SET_ACTIVE: "exchange_rate.set_active",

  CURRENCY_CREATE: "currency.create",
  CURRENCY_UPDATE: "currency.update",
  CURRENCY_SET_ACTIVE: "currency.set_active",

  PARTNER_SARAFI_CREATE: "partner_sarafi.create",
  PARTNER_SARAFI_UPDATE: "partner_sarafi.update",
  PARTNER_SARAFI_SET_ACTIVE: "partner_sarafi.set_active",
  PARTNER_COMMISSION_PAY: "partner_sarafi.commission_pay",
  PARTNER_COMMISSION_COLLECT: "partner_sarafi.commission_collect",

  TRANSACTION_VOID: "transaction.void",

  SETTINGS_UPDATE: "settings.update",

  WALLET_CREATE: "wallet.create",
  WALLET_UPDATE: "wallet.update",
  WALLET_ARCHIVE: "wallet.archive",

  USER_CREATE: "user.create",
  USER_UPDATE: "user.update",
  USER_SET_ACTIVE: "user.set_active",
  USER_RESET_PASSWORD: "user.reset_password",
} as const;

export type AuditAction =
  (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

/**
 * Suggested entity type labels for entityType.
 */
export const AUDIT_ENTITY_TYPES = {
  USER: "user",
  CUSTOMER: "customer",
  TRANSACTION: "transaction",
  HAWALA: "hawala",
  EXCHANGE_RATE: "exchange_rate",
  CURRENCY: "currency",
  PARTNER_SARAFI: "partner_sarafi",
  WALLET: "wallet",
  SYSTEM_SETTING: "system_setting",
} as const;

export type AuditEntityType =
  (typeof AUDIT_ENTITY_TYPES)[keyof typeof AUDIT_ENTITY_TYPES];
