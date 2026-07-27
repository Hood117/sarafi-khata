"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  buildReportsHref,
  type ReportsFilters,
} from "@/features/reports/domain/reports-filters";
import type { ReportsFilterOptions } from "@/features/reports/domain/types";
import { TRANSACTION_TYPE_LABELS } from "@/features/transactions/domain/labels";

type ReportsFiltersFormProps = {
  filters: ReportsFilters;
  options: ReportsFilterOptions;
};

const selectClassName =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3";

type FilterFormValues = {
  dateFrom: string;
  dateTo: string;
  customerId: string;
  currencyCode: string;
  type: string;
  operatorId: string;
};

export function ReportsFiltersForm({
  filters,
  options,
}: ReportsFiltersFormProps) {
  const router = useRouter();
  const [dateFrom, setDateFrom] = useState(filters.dateFrom ?? "");
  const [dateTo, setDateTo] = useState(filters.dateTo ?? "");
  const [customerId, setCustomerId] = useState(filters.customerId ?? "");
  const [currencyCode, setCurrencyCode] = useState(filters.currencyCode ?? "");
  const [type, setType] = useState(filters.type ?? "");
  const [operatorId, setOperatorId] = useState(filters.operatorId ?? "");

  function currentValues(): FilterFormValues {
    return {
      dateFrom,
      dateTo,
      customerId,
      currencyCode,
      type,
      operatorId,
    };
  }

  function apply(values: FilterFormValues) {
    router.push(
      buildReportsHref({
        dateFrom: values.dateFrom,
        dateTo: values.dateTo,
        customerId: values.customerId,
        currencyCode: values.currencyCode,
        type: values.type,
        operatorId: values.operatorId,
      }),
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    apply(currentValues());
  }

  function handleClear() {
    const cleared: FilterFormValues = {
      dateFrom: "",
      dateTo: "",
      customerId: "",
      currencyCode: "",
      type: "",
      operatorId: "",
    };
    setDateFrom("");
    setDateTo("");
    setCustomerId("");
    setCurrencyCode("");
    setType("");
    setOperatorId("");
    apply(cleared);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-card ring-foreground/10 space-y-2 rounded-xl p-3 shadow-sm ring-1"
      aria-label="Report filters"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <div className="space-y-1.5">
          <Label htmlFor="reports-date-from">From date</Label>
          <Input
            id="reports-date-from"
            name="from"
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="reports-date-to">To date</Label>
          <Input
            id="reports-date-to"
            name="to"
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="reports-customer">Customer</Label>
          <select
            id="reports-customer"
            name="customerId"
            value={customerId}
            className={selectClassName}
            onChange={(event) => setCustomerId(event.target.value)}
          >
            <option value="">All customers</option>
            {options.customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="reports-currency">Currency</Label>
          <select
            id="reports-currency"
            name="currency"
            value={currencyCode}
            className={selectClassName}
            onChange={(event) => setCurrencyCode(event.target.value)}
          >
            <option value="">All currencies</option>
            {options.currencies.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="reports-type">Transaction type</Label>
          <select
            id="reports-type"
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
          <Label htmlFor="reports-operator">Operator</Label>
          <select
            id="reports-operator"
            name="operator"
            value={operatorId}
            className={selectClassName}
            onChange={(event) => setOperatorId(event.target.value)}
          >
            <option value="">All operators</option>
            {options.operators.map((operator) => (
              <option key={operator.id} value={operator.id}>
                {operator.label}
              </option>
            ))}
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
