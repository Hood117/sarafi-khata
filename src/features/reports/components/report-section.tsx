import type { ReactNode } from "react";

import { Typography } from "@/design-system/typography";

type ReportSectionProps = {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
};

export function ReportSection({
  id,
  title,
  description,
  children,
}: ReportSectionProps) {
  return (
    <section
      id={id}
      className="bg-card ring-foreground/10 space-y-2 rounded-xl p-3 shadow-sm ring-1"
      aria-labelledby={`${id}-heading`}
    >
      <div className="space-y-1">
        <Typography variant="h4" id={`${id}-heading`} className="font-bold">
          {title}
        </Typography>
        <Typography variant="muted">{description}</Typography>
      </div>
      {children}
    </section>
  );
}
