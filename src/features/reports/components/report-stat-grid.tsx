import { Typography } from "@/design-system/typography";

type ReportStat = {
  label: string;
  value: string | number;
  hint?: string;
};

type ReportStatGridProps = {
  stats: ReportStat[];
  columns?: "2" | "3" | "4";
};

function formatValue(value: string | number): string {
  if (typeof value === "number") {
    return new Intl.NumberFormat("en").format(value);
  }
  return value;
}

export function ReportStatGrid({ stats, columns = "4" }: ReportStatGridProps) {
  const gridClass =
    columns === "2"
      ? "sm:grid-cols-2"
      : columns === "3"
        ? "sm:grid-cols-2 lg:grid-cols-3"
        : "sm:grid-cols-2 xl:grid-cols-4";

  return (
    <dl className={`grid gap-3 ${gridClass}`}>
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="ring-foreground/10 space-y-1 rounded-xl px-4 py-3 ring-1"
        >
          <Typography variant="overline" as="dt">
            {stat.label}
          </Typography>
          <Typography
            variant="h3"
            as="dd"
            className="tabular-nums tracking-tight"
          >
            {formatValue(stat.value)}
          </Typography>
          {stat.hint ? (
            <Typography variant="caption" as="p">
              {stat.hint}
            </Typography>
          ) : null}
        </div>
      ))}
    </dl>
  );
}
