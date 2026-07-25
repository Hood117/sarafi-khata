import * as React from "react";

import { cn } from "@/lib/utils";
import { Typography } from "@/design-system/typography";

type FormLayoutProps = React.ComponentProps<"form"> & {
  maxWidth?: "sm" | "md" | "lg" | "full";
};

const maxWidthClass = {
  sm: "max-w-md",
  md: "max-w-2xl",
  lg: "max-w-4xl",
  full: "max-w-none",
} as const;

export function FormLayout({
  className,
  maxWidth = "md",
  ...props
}: FormLayoutProps) {
  return (
    <form
      data-slot="form-layout"
      className={cn(
        "flex w-full flex-col gap-8",
        maxWidthClass[maxWidth],
        className,
      )}
      {...props}
    />
  );
}

type FormSectionProps = React.ComponentProps<"section"> & {
  title: string;
  description?: string;
};

export function FormSection({
  title,
  description,
  className,
  children,
  ...props
}: FormSectionProps) {
  return (
    <section
      data-slot="form-section"
      className={cn("flex flex-col gap-5", className)}
      {...props}
    >
      <div className="space-y-1">
        <Typography variant="h4">{title}</Typography>
        {description ? (
          <Typography variant="muted">{description}</Typography>
        ) : null}
      </div>
      <div className="flex flex-col gap-5">{children}</div>
    </section>
  );
}

type FormGridProps = React.ComponentProps<"div"> & {
  columns?: 1 | 2 | 3;
};

export function FormGrid({ columns = 2, className, ...props }: FormGridProps) {
  return (
    <div
      data-slot="form-grid"
      className={cn(
        "grid gap-5",
        columns === 1 && "grid-cols-1",
        columns === 2 && "grid-cols-1 md:grid-cols-2",
        columns === 3 && "grid-cols-1 md:grid-cols-3",
        className,
      )}
      {...props}
    />
  );
}

export function FormActions({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="form-actions"
      className={cn(
        "border-border flex flex-wrap items-center justify-end gap-3 border-t pt-6",
        className,
      )}
      {...props}
    />
  );
}
