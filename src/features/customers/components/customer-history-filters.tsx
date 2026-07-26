"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buildCustomerHistoryHref } from "@/features/customers/domain/customer-history-url";
import { TRANSACTION_TYPE_LABELS } from "@/features/transactions/domain/labels";
import type {
  CustomerHistoryFilters,
  CustomerHistorySort,
} from "@/features/transactions/domain/types";

type CustomerHistoryFiltersFormProps = {
  customerId: string;
  filters: CustomerHistoryFilters;
  sort: CustomerHistorySort;
  currencyOptions: string[];
};

type HistoryFilterFormValues = {
  dateFrom: string;
  dateTo: string;
  type: string;
  currencyCode: string;
  reference: string;
};

const selectClassName =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3";

export function CustomerHistoryFiltersForm({
  customerId,
  filters,
  sort,
  currencyOptions,
}: CustomerHistoryFiltersFormProps) {
  const router = useRouter();
  const [dateFrom, setDateFrom] = useState(filters.dateFrom ?? "");
  const [dateTo, setDateTo] = useState(filters.dateTo ?? "");
  const [type, setType] = useState(filters.type ?? "");
  const [currencyCode, setCurrencyCode] = useState(filters.currencyCode ?? "");
  const [reference, setReference] = useState(filters.reference ?? "");
  const [sortOrder, setSortOrder] = useState<CustomerHistorySort>(sort);

  function currentValues(): HistoryFilterFormValues {
    return {
      dateFrom,
      dateTo,
      type,
      currencyCode,
      reference,
    };
  }

  function apply(values: HistoryFilterFormValues, nextSort: CustomerHistorySort) {
    router.push(
      buildCustomerHistoryHref(customerId, {
        ...values,
        sort: nextSort,
      }),
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    apply(currentValues(), sortOrder);
  }

  function handleClear() {
    const cleared: HistoryFilterFormValues = {
      dateFrom: "",
      dateTo: "",
      type: "",
      currencyCode: "",
      reference: "",
    };
    setDateFrom("");
    setDateTo("");
    setType("");
    setCurrencyCode("");
    setReference("");
    setSortOrder("newest");
    apply(cleared, "newest");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="history-date-from">From date</Label>
          <Input
            id="history-date-from"
            name="from"
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="history-date-to">To date</Label>
          <Input
            id="history-date-to"
            name="to"
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="history-type">Transaction type</Label>
          <select
            id="history-type"
            name="type"
            value={type}
            className={selectClassName}
            onChange={(event) => setType(event.target.value)}
          >
            <option value="">All types</option>
            {Object.entries(TRANSACTION_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="history-currency">Currency</Label>
          <select
            id="history-currency"
            name="currency"
            value={currencyCode}
            className={selectClassName}
            onChange={(event) => setCurrencyCode(event.target.value)}
          >
            <option value="">All currencies</option>
            {currencyOptions.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="history-reference">Reference number</Label>
          <Input
            id="history-reference"
            name="ref"
            value={reference}
            placeholder="Search reference"
            onChange={(event) => setReference(event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="history-sort">Sort</Label>
          <select
            id="history-sort"
            name="sort"
            value={sortOrder}
            className={selectClassName}
            onChange={(event) => {
              const nextSort =
                event.target.value === "oldest" ? "oldest" : "newest";
              setSortOrder(nextSort);
              apply(currentValues(), nextSort);
            }}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="outline" size="sm">
          Apply filters
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={handleClear}>
          Clear
        </Button>
      </div>
    </form>
  );
}
