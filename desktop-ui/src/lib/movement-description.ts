/** Build localized movement descriptions shown in forms and stored on the transaction. */

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
  },
): string {
  const name = opts.customerName.trim() || "—";
  const amount = opts.amount.trim() || "0";
  const currency = opts.currency.trim() || "";
  const actor = opts.actedByName?.trim();
  const cashAmount = opts.cashAmount?.trim() || amount;
  const cashCurrency = opts.cashCurrency?.trim() || currency;
  const fx = isFx(amount, currency, cashAmount, cashCurrency);

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
  },
): string {
  const name = opts.customerName.trim() || "—";
  const amount = opts.amount.trim() || "0";
  const currency = opts.currency.trim() || "";
  const actor = opts.actedByName?.trim();
  const cashAmount = opts.cashAmount?.trim() || amount;
  const cashCurrency = opts.cashCurrency?.trim() || currency;
  if (isFx(amount, currency, cashAmount, cashCurrency)) {
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
  },
): string {
  const from = opts.fromName.trim() || "—";
  const to = opts.toName.trim() || "—";
  const amount = opts.amount.trim() || "0";
  const currency = opts.currency.trim() || "";
  const receiveAmount = opts.receiveAmount?.trim() || amount;
  const receiveCurrency = opts.receiveCurrency?.trim() || currency;
  if (isFx(amount, currency, receiveAmount, receiveCurrency)) {
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
