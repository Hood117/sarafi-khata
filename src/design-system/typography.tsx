import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const typographyVariants = cva("text-foreground", {
  variants: {
    variant: {
      display: "font-heading text-4xl font-semibold tracking-tight",
      h1: "font-heading text-3xl font-semibold tracking-tight",
      h2: "font-heading text-2xl font-semibold tracking-tight",
      h3: "font-heading text-xl font-semibold tracking-tight",
      h4: "font-heading text-lg font-medium tracking-tight",
      body: "text-base leading-relaxed",
      bodySm: "text-sm leading-relaxed",
      caption: "text-xs leading-normal text-muted-foreground",
      overline:
        "text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase",
      muted: "text-sm text-muted-foreground",
      code: "font-mono text-sm",
    },
  },
  defaultVariants: {
    variant: "body",
  },
});

const defaultElements = {
  display: "h1",
  h1: "h1",
  h2: "h2",
  h3: "h3",
  h4: "h4",
  body: "p",
  bodySm: "p",
  caption: "span",
  overline: "span",
  muted: "p",
  code: "code",
} as const;

type TypographyProps = React.HTMLAttributes<HTMLElement> &
  VariantProps<typeof typographyVariants> & {
    as?: React.ElementType;
  };

export function Typography({
  className,
  variant = "body",
  as,
  ...props
}: TypographyProps) {
  const Comp = as ?? defaultElements[variant ?? "body"];

  return (
    <Comp
      className={cn(typographyVariants({ variant }), className)}
      {...props}
    />
  );
}

export { typographyVariants };
