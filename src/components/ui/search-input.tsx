import { Search } from "lucide-react";
import * as React from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type SearchInputProps = Omit<React.ComponentProps<"input">, "type"> & {
  containerClassName?: string;
};

/**
 * Shared search field with Lucide icon — presentation only.
 */
export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  function SearchInput({ className, containerClassName, ...props }, ref) {
    return (
      <div className={cn("relative", containerClassName)}>
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          ref={ref}
          type="search"
          className={cn(
            "border-border bg-background h-10 rounded-lg pe-3 ps-9 shadow-sm focus-visible:border-primary-light focus-visible:ring-primary-light/40",
            className,
          )}
          {...props}
        />
      </div>
    );
  },
);
