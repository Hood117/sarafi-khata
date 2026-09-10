import { describe, expect, it } from "vitest";

import { journalFilterTotals } from "./daybook-journal-totals";

function line(
  overrides: Partial<{
    debit: string;
    credit: string;
    balanceAfter: string;
    currencyCode: string;
  }>,
) {
  return {
    debit: "",
    credit: "",
    balanceAfter: "",
    currencyCode: "AFN",
    ...overrides,
  };
}

/** 60 same-day rows: first 50 are page 1, last 10 are page 2. */
function sixtyAfnDayLines() {
  const lines = [];
  for (let i = 1; i <= 60; i++) {
    lines.push(
      line({
        debit: i <= 30 ? "100" : "",
        credit: i > 30 ? "50" : "",
        balanceAfter: String(1000 + i),
        currencyCode: "AFN",
      }),
    );
  }
  return lines;
}

describe("journalFilterTotals (Day Total)", () => {
  it("includes transactions beyond the first page (page size 50)", () => {
    const all = sixtyAfnDayLines();
    const page1 = all.slice(0, 50);
    const full = journalFilterTotals(all);
    const pageOnly = journalFilterTotals(page1);

    // Full day: 30×100 debit + 30×50 credit
    expect(full.debit).toEqual([{ code: "AFN", amount: "3,000" }]);
    expect(full.credit).toEqual([{ code: "AFN", amount: "1,500" }]);
    expect(full.closing).toEqual([{ code: "AFN", amount: "1060" }]);

    // Page 1 alone under-counts (only 30 debit + 20 credit)
    expect(pageOnly.debit).toEqual([{ code: "AFN", amount: "3,000" }]);
    expect(pageOnly.credit).toEqual([{ code: "AFN", amount: "1,000" }]);
    expect(pageOnly.credit).not.toEqual(full.credit);
    expect(pageOnly.closing).not.toEqual(full.closing);
  });

  it("changing which page is visible must not change Day Total when the full set is used", () => {
    const all = sixtyAfnDayLines();
    const full = journalFilterTotals(all);
    const page1Only = journalFilterTotals(all.slice(0, 50));
    const page2Only = journalFilterTotals(all.slice(50));

    // Page slices alone are wrong / incomplete relative to the day.
    expect(page1Only).not.toEqual(full);
    expect(page2Only).not.toEqual(full);

    // Day Total always re-totals the complete filtered dataset (page-independent).
    expect(journalFilterTotals(all)).toEqual(full);
  });

  it("keeps currencies separate and never combines them", () => {
    const lines = [
      line({ debit: "100", currencyCode: "AFN", balanceAfter: "500" }),
      line({ debit: "20", currencyCode: "USD", balanceAfter: "80" }),
      line({ credit: "10", currencyCode: "PKR", balanceAfter: "40" }),
      line({ credit: "5", currencyCode: "EUR", balanceAfter: "15" }),
    ];
    const totals = journalFilterTotals(lines);
    expect(totals.debit).toEqual([
      { code: "AFN", amount: "100" },
      { code: "USD", amount: "20" },
    ]);
    expect(totals.credit).toEqual([
      { code: "PKR", amount: "10" },
      { code: "EUR", amount: "5" },
    ]);
    expect(totals.closing).toEqual([
      { code: "AFN", amount: "500" },
      { code: "USD", amount: "80" },
      { code: "PKR", amount: "40" },
      { code: "EUR", amount: "15" },
    ]);
  });

  it("applies search/currency-style filters by totaling only the filtered rows", () => {
    const day = [
      line({ debit: "100", currencyCode: "AFN", balanceAfter: "100" }),
      line({ debit: "200", currencyCode: "USD", balanceAfter: "200" }),
      line({ credit: "50", currencyCode: "AFN", balanceAfter: "50" }),
      line({ credit: "25", currencyCode: "USD", balanceAfter: "175" }),
    ];
    const afnOnly = day.filter((r) => r.currencyCode === "AFN");
    const totals = journalFilterTotals(afnOnly);
    expect(totals.debit).toEqual([{ code: "AFN", amount: "100" }]);
    expect(totals.credit).toEqual([{ code: "AFN", amount: "50" }]);
    expect(totals.closing).toEqual([{ code: "AFN", amount: "50" }]);
    expect(totals.debit.some((r) => r.code === "USD")).toBe(false);
  });
});
