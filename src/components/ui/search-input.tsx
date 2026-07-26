import { Search } from "lucide-react";
import type * as React from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type SearchInputProps = Omit<React.ComponentProps<"input">, "type"> & {
  containerClassName?: string;
};

/**
 * Shared search field with Lucide icon — presentation only.
 */
export function SearchInput({
  className,
  containerClassName,
  ...props
}: SearchInputProps) {
  return (
    <div className={cn("relative", containerClassName)}>
      <Search
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        aria-hidden
      />
      <Input
        type="search"
        className={cn(
          "border-border bg-background h-10 rounded-lg pr-3 pl-9 shadow-sm focus-visible:border-primary-light focus-visible:ring-primary-light/40",
          className,
        )}
        {...props}
      />
    </div>
  );
}
