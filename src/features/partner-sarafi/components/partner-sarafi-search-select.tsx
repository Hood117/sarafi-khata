"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { SearchInput } from "@/components/ui/search-input";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type PartnerSarafiSearchOption = {
  id: string;
  name: string;
  label: string;
};

type PartnerSarafiSearchSelectProps = {
  id?: string;
  value: string;
  partners: PartnerSarafiSearchOption[];
  disabled?: boolean;
  invalid?: boolean;
  placeholder?: string;
  emptyHint?: string;
  className?: string;
  onChange: (partnerId: string, partnerName: string) => void;
};

function matchesPartner(
  partner: PartnerSarafiSearchOption,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }

  return (
    partner.name.toLowerCase().includes(q) ||
    partner.label.toLowerCase().includes(q)
  );
}

export function PartnerSarafiSearchSelect({
  id,
  value,
  partners,
  disabled = false,
  invalid = false,
  placeholder,
  emptyHint,
  className,
  onChange,
}: PartnerSarafiSearchSelectProps) {
  const t = useT();
  const resolvedPlaceholder = placeholder ?? t.partner.selectPlaceholder;
  const resolvedEmptyHint = emptyHint ?? t.common.noResults;
  const generatedId = useId();
  const triggerId = id ?? generatedId;
  const listboxId = `${triggerId}-listbox`;
  const rootRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = partners.find((partner) => partner.id === value) ?? null;

  const filtered = useMemo(
    () => partners.filter((partner) => matchesPartner(partner, query)),
    [partners, query],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function selectPartner(partner: PartnerSarafiSearchOption) {
    onChange(partner.id, partner.name);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        id={triggerId}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-invalid={invalid || undefined}
        className={cn(
          "border-input bg-background focus-visible:border-primary-light focus-visible:ring-primary-light/40 flex h-10 w-full items-center justify-between gap-2 rounded-lg border px-2.5 text-start text-sm outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50",
          invalid &&
            "border-destructive ring-destructive/20 aria-invalid:ring-3",
          !selected && "text-muted-foreground",
        )}
        onClick={() => {
          if (disabled) {
            return;
          }
          setOpen((current) => !current);
        }}
      >
        <span className="min-w-0 truncate">
          {selected?.label ?? resolvedPlaceholder}
        </span>
        <ChevronDown className="text-muted-foreground size-4 shrink-0" />
      </button>

      {open ? (
        <div
          className="bg-popover text-popover-foreground absolute z-50 mt-1 w-full overflow-hidden rounded-xl border shadow-lg"
          role="presentation"
        >
          <div className="border-b p-2">
            <SearchInput
              autoFocus
              value={query}
              placeholder={t.partner.searchSelectPlaceholder}
              aria-label={t.partner.searchPlaceholder}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  const first = filtered[0];
                  if (first) {
                    selectPartner(first);
                  }
                }
              }}
            />
          </div>

          <ul
            id={listboxId}
            role="listbox"
            aria-labelledby={triggerId}
            className="max-h-56 overflow-y-auto p-1"
          >
            {filtered.length === 0 ? (
              <li className="text-muted-foreground px-3 py-6 text-center text-sm">
                {partners.length === 0
                  ? t.partner.emptyTitle
                  : resolvedEmptyHint}
              </li>
            ) : (
              filtered.map((partner) => {
                const isSelected = partner.id === value;
                return (
                  <li key={partner.id} role="option" aria-selected={isSelected}>
                    <button
                      type="button"
                      className={cn(
                        "hover:bg-muted flex w-full items-center gap-2 rounded-lg px-3 py-2 text-start text-sm",
                        isSelected && "bg-muted",
                      )}
                      onClick={() => selectPartner(partner)}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {partner.label}
                      </span>
                      {isSelected ? (
                        <Check className="text-primary size-4 shrink-0" />
                      ) : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
