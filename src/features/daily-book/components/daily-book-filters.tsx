"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  buildDailyBookHref,
  todayDateOnly,
  type DailyBookCurrencyOption,
  type DailyBookCustomerOption,
  type DailyBookFilters,
} from "@/features/daily-book/domain/daily-book-filters";
import { TRANSACTION_TYPE_LABELS } from "@/features/transactions/domain/labels";

type DailyBookFiltersFormProps = {
  filters: DailyBookFilters;
  customers: DailyBookCustomerOption[];
  currencies: DailyBookCurrencyOption[];
};

const selectClassName =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3";

type FilterFormValues = {
  date: string;
  type: string;
  customerId: string;
  currencyCode: string;
};

export function DailyBookFiltersForm({
  filters,
  customers,
  currencies,
}: DailyBookFiltersFormProps) {
  const router = useRouter();
  const [date, setDate] = useState(filters.date);
  const [type, setType] = useState(filters.type ?? "");
  const [customerId, setCustomerId] = useState(filters.customerId ?? "");
  const [currencyCode, setCurrencyCode] = useState(filters.currencyCode ?? "");

  function currentValues(): FilterFormValues {
    return { date, type, customerId, currencyCode };
  }

  function apply(values: FilterFormValues) {
    router.push(
      buildDailyBookHref({
        date: values.date,
        type: values.type,
        customerId: values.customerId,
        currencyCode: values.currencyCode,
      }),
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    apply(currentValues());
  }

  function handleClear() {
    const cleared: FilterFormValues = {
      date: todayDateOnly(),
      type: "",
      customerId: "",
      currencyCode: "",
    };
    setDate(cleared.date);
    setType("");
    setCustomerId("");
    setCurrencyCode("");
    apply(cleared);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-card ring-foreground/10 space-y-2 rounded-xl p-3 shadow-sm ring-1"
      aria-label="Daily book filters"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1.5">
          <Label htmlFor="daily-book-date">Date</Label>
          <Input
            id="daily-book-date"
            name="date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="daily-book-currency">Currency</Label>
          <select
            id="daily-book-currency"
            name="currency"
            className={selectClassName}
            value={currencyCode}
            onChange={(event) => setCurrencyCode(event.target.value)}
          >
            <option value="">All currencies</option>
            {currencies.map((currency) => (
              <option key={currency.code} value={currency.code}>
                {currency.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="daily-book-type">Type</Label>
          <select
            id="daily-book-type"
            name="type"
            className={selectClassName}
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            <option value="">All types</option>
            {Object.entries(TRANSACTION_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {value === "ADJUSTMENT"
                  ? "Added to wallet / Adjustment"
                  : value === "HAWALA"
                    ? "Hawala (sent & received)"
                    : label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="daily-book-customer">Customer</Label>
          <select
            id="daily-book-customer"
            name="customerId"
            className={selectClassName}
            value={customerId}
            onChange={(event) => setCustomerId(event.target.value)}
          >
            <option value="">All customers</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-end gap-2">
          <Button type="submit" className="flex-1 sm:flex-none">
            Apply
          </Button>
          <Button
            type="button"
            variant="outline"
            className="flex-1 sm:flex-none"
            onClick={handleClear}
          >
            Clear
          </Button>
        </div>
      </div>
    </form>
  );
}
