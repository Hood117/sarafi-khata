"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchInput } from "@/components/ui/search-input";
import {
  buildAuditHref,
  type AuditFilterOptions,
  type AuditFilters,
} from "@/features/audit/domain/audit-filters";
import { useT } from "@/lib/i18n";
type AuditFiltersFormProps = {
  filters: AuditFilters;
  options: AuditFilterOptions;
};

const selectClassName =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3";

type FilterFormValues = {
  search: string;
  dateFrom: string;
  dateTo: string;
  userId: string;
  module: string;
  action: string;
};

export function AuditFiltersForm({
  filters,
  options,
}: AuditFiltersFormProps) {
  const t = useT();
  const router = useRouter();
  const [search, setSearch] = useState(filters.search);
  const [dateFrom, setDateFrom] = useState(filters.dateFrom ?? "");
  const [dateTo, setDateTo] = useState(filters.dateTo ?? "");
  const [userId, setUserId] = useState(filters.userId ?? "");
  const [moduleValue, setModuleValue] = useState(filters.module ?? "");
  const [action, setAction] = useState(filters.action ?? "");

  function currentValues(): FilterFormValues {
    return {
      search,
      dateFrom,
      dateTo,
      userId,
      module: moduleValue,
      action,
    };
  }

  function apply(values: FilterFormValues) {
    router.push(
      buildAuditHref({
        search: values.search,
        dateFrom: values.dateFrom,
        dateTo: values.dateTo,
        userId: values.userId,
        module: values.module,
        action: values.action,
        page: 1,
      }),
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    apply(currentValues());
  }

  function handleClear() {
    const cleared: FilterFormValues = {
      search: "",
      dateFrom: "",
      dateTo: "",
      userId: "",
      module: "",
      action: "",
    };
    setSearch("");
    setDateFrom("");
    setDateTo("");
    setUserId("");
    setModuleValue("");
    setAction("");
    apply(cleared);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-card ring-foreground/10 space-y-2 rounded-xl p-3 shadow-sm ring-1"
      aria-label="Audit filters"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <div className="space-y-1.5 sm:col-span-2 lg:col-span-3 xl:col-span-2">
          <Label htmlFor="audit-search">{t.common.search}</Label>
          <SearchInput
            id="audit-search"
            name="q"
            value={search}
            placeholder="Entity, IP, user name…"
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="audit-date-from">{t.common.fromDate}</Label>
          <Input
            id="audit-date-from"
            name="from"
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="audit-date-to">{t.common.toDate}</Label>
          <Input
            id="audit-date-to"
            name="to"
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="audit-user">User</Label>
          <select
            id="audit-user"
            name="user"
            value={userId}
            className={selectClassName}
            onChange={(event) => setUserId(event.target.value)}
          >
            <option value="">All users</option>
            {options.users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="audit-module">Module</Label>
          <select
            id="audit-module"
            name="module"
            value={moduleValue}
            className={selectClassName}
            onChange={(event) => setModuleValue(event.target.value)}
          >
            <option value="">{t.audit.allModules}</option>
            {options.modules.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="audit-action">Action</Label>
          <select
            id="audit-action"
            name="action"
            value={action}
            className={selectClassName}
            onChange={(event) => setAction(event.target.value)}
          >
            <option value="">All actions</option>
            {options.actions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="outline" size="sm">
          {t.common.applyFilters}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={handleClear}>
          {t.common.clear}
        </Button>
      </div>
    </form>
  );
}

