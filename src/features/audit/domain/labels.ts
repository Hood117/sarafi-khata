import {
  AUDIT_ACTIONS,
  AUDIT_MODULES,
} from "@/features/audit/domain/constants";

export const AUDIT_MODULE_LABELS: Record<string, string> = {
  [AUDIT_MODULES.AUTH]: "Auth",
  [AUDIT_MODULES.CUSTOMERS]: "Customers",
  [AUDIT_MODULES.TRANSACTIONS]: "Transactions",
  [AUDIT_MODULES.HAWALA]: "Hawala",
  [AUDIT_MODULES.EXCHANGE]: "Exchange",
  [AUDIT_MODULES.EXCHANGE_RATES]: "Exchange rates",
  [AUDIT_MODULES.CURRENCIES]: "Currencies",
  [AUDIT_MODULES.SETTINGS]: "Settings",
  [AUDIT_MODULES.WALLETS]: "Wallets",
  [AUDIT_MODULES.TRANSFERS]: "Transfers",
  [AUDIT_MODULES.USERS]: "Users",
  [AUDIT_MODULES.BACKUP]: "Backup",
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  [AUDIT_ACTIONS.LOGIN_SUCCESS]: "Login success",
  [AUDIT_ACTIONS.LOGIN_FAILURE]: "Login failure",
  [AUDIT_ACTIONS.LOGOUT]: "Logout",
  [AUDIT_ACTIONS.CUSTOMER_CREATE]: "Customer create",
  [AUDIT_ACTIONS.CUSTOMER_UPDATE]: "Customer update",
  [AUDIT_ACTIONS.CUSTOMER_ARCHIVE]: "Customer archive",
  [AUDIT_ACTIONS.TRANSACTION_POST]: "Transaction post",
  [AUDIT_ACTIONS.TRANSACTION_DEPOSIT]: "Deposit",
  [AUDIT_ACTIONS.TRANSACTION_WITHDRAWAL]: "Withdrawal",
  [AUDIT_ACTIONS.TRANSACTION_ADJUSTMENT]: "Manual adjustment",
  [AUDIT_ACTIONS.TRANSACTION_EXTERNAL_MONEY]: "External money",
  [AUDIT_ACTIONS.TRANSACTION_EXTERNAL_MONEY_UPDATE]: "External money update",
  [AUDIT_ACTIONS.TRANSACTION_EXTERNAL_MONEY_ARCHIVE]: "External money archive",
  [AUDIT_ACTIONS.TRANSACTION_EXCHANGE]: "Currency exchange",
  [AUDIT_ACTIONS.TRANSACTION_TRANSFER]: "Customer transfer",
  [AUDIT_ACTIONS.HAWALA_SEND]: "Hawala send",
  [AUDIT_ACTIONS.HAWALA_RECEIVE]: "Hawala receive",
  [AUDIT_ACTIONS.HAWALA_CANCEL]: "Hawala cancel",
  [AUDIT_ACTIONS.HAWALA_COMPLETE]: "Hawala complete",
  [AUDIT_ACTIONS.HAWALA_UPDATE]: "Hawala update",
  [AUDIT_ACTIONS.HAWALA_ARCHIVE]: "Hawala archive",
  [AUDIT_ACTIONS.PARTNER_SARAFI_CREATE]: "Partner sarafi create",
  [AUDIT_ACTIONS.PARTNER_SARAFI_UPDATE]: "Partner sarafi update",
  [AUDIT_ACTIONS.PARTNER_SARAFI_SET_ACTIVE]: "Partner sarafi set active",
  [AUDIT_ACTIONS.PARTNER_COMMISSION_PAY]: "Partner commission paid",
  [AUDIT_ACTIONS.PARTNER_COMMISSION_COLLECT]: "Partner commission collected",
  [AUDIT_ACTIONS.EXCHANGE_RATE_CREATE]: "Exchange rate create",
  [AUDIT_ACTIONS.EXCHANGE_RATE_UPDATE]: "Exchange rate update",
  [AUDIT_ACTIONS.EXCHANGE_RATE_SET_ACTIVE]: "Exchange rate set active",
  [AUDIT_ACTIONS.CURRENCY_CREATE]: "Currency create",
  [AUDIT_ACTIONS.CURRENCY_UPDATE]: "Currency update",
  [AUDIT_ACTIONS.CURRENCY_SET_ACTIVE]: "Currency set active",
  [AUDIT_ACTIONS.SETTINGS_UPDATE]: "Settings update",
  [AUDIT_ACTIONS.WALLET_CREATE]: "Wallet create",
  [AUDIT_ACTIONS.WALLET_UPDATE]: "Wallet update",
  [AUDIT_ACTIONS.WALLET_ARCHIVE]: "Wallet archive",
  [AUDIT_ACTIONS.USER_CREATE]: "User create",
  [AUDIT_ACTIONS.USER_UPDATE]: "User update",
  [AUDIT_ACTIONS.USER_SET_ACTIVE]: "User set active",
  [AUDIT_ACTIONS.USER_RESET_PASSWORD]: "User reset password",
};

export function labelForAuditModule(module: string): string {
  return AUDIT_MODULE_LABELS[module] ?? module;
}

export function labelForAuditAction(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}
