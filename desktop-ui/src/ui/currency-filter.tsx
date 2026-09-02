import { useMemo } from "react";

import type { CurrencyListItem } from "@desktop/api";
import { useT } from "@desktop/i18n";
import { CurrencyPicker } from "@desktop/ui/currency-picker";

type Props = {
  currencies: CurrencyListItem[];
  value: string;
  onChange: (code: string) => void;
  /** Label for the “all currencies” option. Defaults to common.all. */
  allLabel?: string;
  label?: string;
  className?: string;
};

/**
 * Searchable currency filter with flags — value "" / "ALL" means no filter.
 */
export function CurrencyFilter({
  currencies,
  value,
  onChange,
  allLabel,
  label,
  className,
}: Props) {
  const t = useT();
  const allText = allLabel ?? t.common.all;
  const items = useMemo((): CurrencyListItem[] => {
    const allRow: CurrencyListItem = {
      id: "__all_currencies__",
      code: "ALL",
      name: allText,
      symbol: null,
      decimalPlaces: 2,
      isActive: true,
    };
    return [allRow, ...currencies];
  }, [allText, currencies]);

  const code = !value || value === "ALL" ? "ALL" : value;

  return (
    <CurrencyPicker
      className={className}
      label={label ?? t.common.currency}
      currencies={items}
      value={code}
      onChange={(next) => onChange(next === "ALL" ? "" : next)}
      emptyLabel={t.common.noData}
      searchPlaceholder={t.common.search}
      allowManage={false}
    />
  );
}
