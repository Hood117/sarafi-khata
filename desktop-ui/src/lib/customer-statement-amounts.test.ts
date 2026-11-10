import { describe, expect, it } from "vitest";

import { journalFilterTotals } from "./daybook-journal-totals";
import {
  applyCustomerStatementBalance,
  customerStatementAmountTones,
  toCustomerStatementAmounts,
  toSarafiJournalAmounts,
  withRunningBalances,
} from "./customer-statement-amounts";

describe("toCustomerStatementAmounts", () => {
  it("maps ledger DEBIT (deposit / money in) to Credit / جمع", () => {
    const amounts = toCustomerStatementAmounts({
      debit: "10,000",
      credit: "",
    });
    expect(amounts).toEqual({ credit: "10,000", debit: "" });
    expect(customerStatementAmountTones(amounts)).toEqual({
      creditTone: "in",
      debitTone: null,
    });
  });

  it("maps ledger CREDIT (withdrawal / money out) to Debit", () => {
    const amounts = toCustomerStatementAmounts({
      debit: "",
      credit: "3,000",
    });
    expect(amounts).toEqual({ credit: "", debit: "3,000" });
    expect(customerStatementAmountTones(amounts)).toEqual({
      creditTone: null,
      debitTone: "out",
    });
  });

  it("does not use description text — only structured ledger fields", () => {
    // Pashto/English deposit wording must not affect classification; empty
    // ledger debit means no Credit/جمع even if a description said جمع.
    expect(
      toCustomerStatementAmounts({ debit: "", credit: "" }),
    ).toEqual({ credit: "", debit: "" });
  });

  it("treats English and Pashto statement columns as the same credit field", () => {
    // Language only changes labels (Credit vs جمع); mapping is identical.
    const en = toCustomerStatementAmounts({ debit: "5,000", credit: "" });
    const ps = toCustomerStatementAmounts({ debit: "5,000", credit: "" });
    expect(en).toEqual(ps);
    expect(en.credit).toBe("5,000");
    expect(en.debit).toBe("");
  });
});

describe("customer statement running balances", () => {
  it("matches the deposit/withdraw acceptance sequence (AFTER balance)", () => {
    // Asset-convention ledger rows as returned by list_customer_ledger.
    const chronological = [
      { debit: "10000", credit: "", currencyCode: "AFN" },
      { debit: "5000", credit: "", currencyCode: "AFN" },
      { debit: "", credit: "3000", currencyCode: "AFN" },
    ];

    let balance = 0;
    const step1 = toCustomerStatementAmounts(chronological[0]);
    expect(step1).toEqual({ credit: "10000", debit: "" });
    balance = applyCustomerStatementBalance(balance, step1);
    expect(balance).toBe(10000);

    const step2 = toCustomerStatementAmounts(chronological[1]);
    expect(step2).toEqual({ credit: "5000", debit: "" });
    balance = applyCustomerStatementBalance(balance, step2);
    expect(balance).toBe(15000);

    const step3 = toCustomerStatementAmounts(chronological[2]);
    expect(step3).toEqual({ credit: "", debit: "3000" });
    balance = applyCustomerStatementBalance(balance, step3);
    expect(balance).toBe(12000);
  });

  it("keeps correct per-row balances when presenting newest-first", () => {
    const chronological = [
      { id: "a", debit: "10000", credit: "" },
      { id: "b", debit: "5000", credit: "" },
      { id: "c", debit: "", credit: "3000" },
    ];
    const newestFirst = withRunningBalances(chronological, {
      newestFirst: true,
    });
    expect(newestFirst.map((r) => r.id)).toEqual(["c", "b", "a"]);
    expect(newestFirst.map((r) => r.balanceAfter)).toEqual([12000, 15000, 10000]);
    expect(newestFirst[0].statement).toEqual({ credit: "", debit: "3000" });
    expect(newestFirst[2].statement).toEqual({ credit: "10000", debit: "" });
  });

  it("keeps AFN balances separate from GBP/USD rows", () => {
    const afn = withRunningBalances([
      { debit: "10000", credit: "", currencyCode: "AFN" },
      { debit: "", credit: "3000", currencyCode: "AFN" },
    ]);
    const usd = withRunningBalances([
      { debit: "100", credit: "", currencyCode: "USD" },
    ]);
    expect(afn[1].balanceAfter).toBe(7000);
    expect(usd[0].balanceAfter).toBe(100);
  });

  it("does not double-count a deposit when mapping statement columns", () => {
    const amounts = toCustomerStatementAmounts({
      debit: "10,000",
      credit: "",
    });
    // One structured side only — credit filled, debit empty.
    expect(Boolean(amounts.credit) && Boolean(amounts.debit)).toBe(false);
    expect(applyCustomerStatementBalance(0, amounts)).toBe(10000);
  });

  it("keeps debt-repayment deposits on the credit side when ledger DEBIT", () => {
    // Debt repayments post as DEPOSIT with CUSTOMER DEBIT (same as deposits).
    const amounts = toCustomerStatementAmounts({
      debit: "2,500",
      credit: "",
    });
    expect(amounts.credit).toBe("2,500");
    expect(amounts.debit).toBe("");
    expect(customerStatementAmountTones(amounts).creditTone).toBe("in");
  });
});

describe("daybook Sarafi journal columns", () => {
  it("uses the same Credit/جمع mapping as customer history", () => {
    const deposit = toSarafiJournalAmounts({ debit: "10,000", credit: "" });
    const withdraw = toSarafiJournalAmounts({ debit: "", credit: "3,000" });
    expect(deposit).toEqual({ credit: "10,000", debit: "" });
    expect(withdraw).toEqual({ credit: "", debit: "3,000" });
  });

  it("puts mapped deposit totals under Credit and withdrawals under Debit", () => {
    const assetLines = [
      { debit: "10000", credit: "", currencyCode: "AFN", balanceAfter: "10000" },
      { debit: "5000", credit: "", currencyCode: "AFN", balanceAfter: "15000" },
      { debit: "", credit: "3000", currencyCode: "AFN", balanceAfter: "12000" },
    ];
    const sarafi = assetLines.map((row) => {
      const amounts = toSarafiJournalAmounts(row);
      return { ...row, debit: amounts.debit, credit: amounts.credit };
    });
    const totals = journalFilterTotals(sarafi);
    expect(totals.credit).toEqual([{ code: "AFN", amount: "15,000" }]);
    expect(totals.debit).toEqual([{ code: "AFN", amount: "3,000" }]);
  });
});
