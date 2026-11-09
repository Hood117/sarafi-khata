/** Build localized movement descriptions shown in forms and stored on the transaction. */

import { localizedCurrencyName } from "@desktop/lib/currency-labels";
import type { AppLocale } from "@/lib/i18n/locale";

export type MovementDescT = {
  movementDescDepositSelf: string;
  movementDescDepositOther: string;
  movementDescDepositFxSelf: string;
  movementDescDepositFxOther: string;
  movementDescDepositDebtRepayment: string;
  movementDescDepositDebtRepaymentFx: string;
  movementDescWithdrawSelf: string;
  movementDescWithdrawOther: string;
  movementDescWithdrawFxSelf: string;
  movementDescWithdrawFxOther: string;
  movementDescTransfer: string;
  movementDescTransferFx: string;
};

export type HawalaDescT = {
  descVia: string;
  descFrom: string;
  descSimple: string;
};

function fill(
  template: string,
  vars: Record<string, string>,
): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(`{${key}}`).join(value);
  }
  return out;
}

function moneyLabel(code: string, locale: AppLocale): string {
  const trimmed = code.trim();
  if (!trimmed) return "";
  return localizedCurrencyName(trimmed, locale, trimmed);
}

function isFx(
  amount: string,
  currency: string,
  otherAmount?: string | null,
  otherCurrency?: string | null,
): boolean {
  const a = otherAmount?.trim();
  const c = otherCurrency?.trim();
  if (!a || !c) return false;
  return (
    c.toUpperCase() !== currency.trim().toUpperCase() ||
    a !== amount.trim()
  );
}

export function buildDepositDescription(
  t: MovementDescT,
  opts: {
    customerName: string;
    amount: string;
    currency: string;
    cashAmount?: string | null;
    cashCurrency?: string | null;
    actedByName?: string | null;
    /** True when customer balance in this currency is negative (owes Sarafi). */
    isDebtRepayment?: boolean;
    locale: AppLocale;
  },
): string {
  const name = opts.customerName.trim() || "—";
  const amount = opts.amount.trim() || "0";
  const currencyCode = opts.currency.trim() || "";
  const currency = moneyLabel(currencyCode, opts.locale);
  const actor = opts.actedByName?.trim();
  const cashAmount = opts.cashAmount?.trim() || amount;
  const cashCurrencyCode = opts.cashCurrency?.trim() || currencyCode;
  const cashCurrency = moneyLabel(cashCurrencyCode, opts.locale);
  const fx = isFx(amount, currencyCode, cashAmount, cashCurrencyCode);

  if (opts.isDebtRepayment) {
    if (fx) {
      return fill(t.movementDescDepositDebtRepaymentFx, {
        name,
        cashAmount,
        cashCurrency,
        amount,
        currency,
      });
    }
    return fill(t.movementDescDepositDebtRepayment, { name, amount, currency });
  }

  if (fx) {
    const vars = {
      name,
      cashAmount,
      cashCurrency,
      amount,
      currency,
      actor: actor || "",
    };
    return actor
      ? fill(t.movementDescDepositFxOther, vars)
      : fill(t.movementDescDepositFxSelf, vars);
  }
  if (actor) {
    return fill(t.movementDescDepositOther, {
      name,
      amount,
      currency,
      actor,
    });
  }
  return fill(t.movementDescDepositSelf, { name, amount, currency });
}

export function buildWithdrawDescription(
  t: MovementDescT,
  opts: {
    customerName: string;
    amount: string;
    currency: string;
    cashAmount?: string | null;
    cashCurrency?: string | null;
    actedByName?: string | null;
    locale: AppLocale;
  },
): string {
  const name = opts.customerName.trim() || "—";
  const amount = opts.amount.trim() || "0";
  const currencyCode = opts.currency.trim() || "";
  const currency = moneyLabel(currencyCode, opts.locale);
  const actor = opts.actedByName?.trim();
  const cashAmount = opts.cashAmount?.trim() || amount;
  const cashCurrencyCode = opts.cashCurrency?.trim() || currencyCode;
  const cashCurrency = moneyLabel(cashCurrencyCode, opts.locale);
  if (isFx(amount, currencyCode, cashAmount, cashCurrencyCode)) {
    const vars = {
      name,
      cashAmount,
      cashCurrency,
      amount,
      currency,
      actor: actor || "",
    };
    return actor
      ? fill(t.movementDescWithdrawFxOther, vars)
      : fill(t.movementDescWithdrawFxSelf, vars);
  }
  if (actor) {
    return fill(t.movementDescWithdrawOther, {
      name,
      amount,
      currency,
      actor,
    });
  }
  return fill(t.movementDescWithdrawSelf, { name, amount, currency });
}

export function buildTransferDescription(
  t: MovementDescT,
  opts: {
    fromName: string;
    toName: string;
    amount: string;
    currency: string;
    receiveAmount?: string | null;
    receiveCurrency?: string | null;
    locale: AppLocale;
  },
): string {
  const from = opts.fromName.trim() || "—";
  const to = opts.toName.trim() || "—";
  const amount = opts.amount.trim() || "0";
  const currencyCode = opts.currency.trim() || "";
  const currency = moneyLabel(currencyCode, opts.locale);
  const receiveAmount = opts.receiveAmount?.trim() || amount;
  const receiveCurrencyCode = opts.receiveCurrency?.trim() || currencyCode;
  const receiveCurrency = moneyLabel(receiveCurrencyCode, opts.locale);
  if (isFx(amount, currencyCode, receiveAmount, receiveCurrencyCode)) {
    return fill(t.movementDescTransferFx, {
      from,
      to,
      amount,
      currency,
      receiveAmount,
      receiveCurrency,
    });
  }
  return fill(t.movementDescTransfer, {
    from,
    to,
    amount,
    currency,
  });
}

export function buildHawalaDescription(
  t: HawalaDescT,
  opts: {
    senderName: string;
    receiverName: string;
    amount: string;
    currency: string;
    viaAccount?: string | null;
    onBehalfOf?: string | null;
    locale: AppLocale;
  },
): string {
  const sender = opts.senderName.trim() || "—";
  const receiver = opts.receiverName.trim() || "—";
  const amount = opts.amount.trim() || "0";
  const currency = moneyLabel(opts.currency, opts.locale);
  const via = opts.viaAccount?.trim();
  const from = opts.onBehalfOf?.trim();
  if (via) {
    return fill(t.descVia, { sender, receiver, amount, currency, account: via });
  }
  if (from) {
    return fill(t.descFrom, { sender, receiver, amount, currency, from });
  }
  return fill(t.descSimple, { sender, receiver, amount, currency });
}
