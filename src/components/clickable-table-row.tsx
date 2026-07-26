"use client";

import { useRouter } from "next/navigation";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";

import { TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(
    target.closest(
      "a, button, input, select, textarea, label, [role='button'], [data-row-click-ignore]",
    ),
  );
}

type ClickableTableRowProps = {
  href: string;
  children: ReactNode;
  className?: string;
};

/**
 * Table row that navigates on click / Enter / Space.
 * Clicks on interactive descendants (links, buttons, inputs) are ignored.
 */
export function ClickableTableRow({
  href,
  children,
  className,
}: ClickableTableRowProps) {
  const router = useRouter();

  function navigate() {
    router.push(href);
  }

  function handleClick(event: MouseEvent<HTMLTableRowElement>) {
    if (event.defaultPrevented || event.button !== 0) {
      return;
    }

    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    if (isInteractiveTarget(event.target)) {
      return;
    }

    navigate();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTableRowElement>) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    if (isInteractiveTarget(event.target)) {
      return;
    }

    event.preventDefault();
    navigate();
  }

  return (
    <TableRow
      role="link"
      tabIndex={0}
      className={cn(
        "hover:bg-muted/70 cursor-pointer transition-colors",
        className,
      )}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {children}
    </TableRow>
  );
}
