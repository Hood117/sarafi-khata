import { useEffect, useMemo, useState } from "react";

import { listEmployees, type EmployeeRow } from "@desktop/api";
import { useT } from "@desktop/i18n";
import { SearchableSelect } from "@desktop/ui/searchable-select";

type Props = {
  valueId: string;
  onChange: (employeeId: string, fullName: string) => void;
  disabled?: boolean;
  className?: string;
  /** Hide the “optional” hint in the label. */
  hideOptionalHint?: boolean;
};

/** Append "Employee: Name" to notes/description when an employee is selected. */
export function appendEmployeeLine(
  base: string | null | undefined,
  employeeName: string,
  employeeLabel: string,
): string | undefined {
  const name = employeeName.trim();
  const b = (base ?? "").trim();
  if (!name) return b || undefined;
  const line = `${employeeLabel}: ${name}`;
  return b ? `${b}\n${line}` : line;
}

/** Optional desk employee picker with search (same list as Employees screen). */
export function EmployeeField({
  valueId,
  onChange,
  disabled,
  className,
  hideOptionalHint = false,
}: Props) {
  const t = useT();
  const [items, setItems] = useState<EmployeeRow[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void listEmployees({ activeOnly: true, page: 1, pageSize: 200 })
      .then((page) => {
        if (cancelled) return;
        const rows = Array.isArray(page?.items) ? page.items : [];
        const total = typeof page?.total === "number" ? page.total : rows.length;
        setItems(total > 0 ? rows.filter((row) => row?.id) : []);
        setReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setItems([]);
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const options = useMemo(
    () => [
      { value: "", label: t.common.select },
      ...items.map((emp) => ({
        value: emp.id,
        label: emp.fullName,
        keywords: [emp.title, emp.idNumber].filter(Boolean).join(" "),
      })),
    ],
    [items, t.common.select],
  );

  const label = hideOptionalHint
    ? t.employees.employee
    : `${t.employees.employee} (${t.common.optional})`;

  if (!ready || items.length === 0) return null;

  return (
    <SearchableSelect
      className={className}
      label={label}
      value={valueId}
      options={options}
      placeholder={t.common.search}
      emptyLabel={t.common.noData}
      disabled={disabled}
      onChange={(id) => {
        const row = items.find((e) => e.id === id);
        onChange(id, row?.fullName?.trim() || "");
      }}
    />
  );
}
