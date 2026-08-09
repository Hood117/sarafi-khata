"use client";

import { useT } from "@/lib/i18n";
import { Typography } from "@/design-system/typography";
import type {
  DashboardDailyPoint,
  DashboardTypeShare,
} from "@/features/dashboard/domain/dashboard-activity";
import { cn } from "@/lib/utils";

type DashboardActivityChartProps = {
  asOfMonth: string;
  dailyActivity: DashboardDailyPoint[];
  typeShares: DashboardTypeShare[];
};

const TYPE_COLORS: Record<string, string> = {
  HAWALA: "var(--primary)",
  EXCHANGE: "var(--accent)",
  TRANSFER: "color-mix(in oklab, var(--primary-light) 80%, white)",
  DEPOSIT: "color-mix(in oklab, var(--primary) 65%, #16a34a)",
  WITHDRAWAL: "color-mix(in oklab, var(--accent) 70%, #ea580c)",
  ADJUSTMENT: "color-mix(in oklab, var(--primary-dark) 55%, #64748b)",
  OTHER: "color-mix(in oklab, var(--muted-foreground) 50%, transparent)",
};

function formatCount(value: number): string {
  return new Intl.NumberFormat("en").format(value);
}

export function DashboardActivityChart({
  asOfMonth,
  dailyActivity,
  typeShares,
}: DashboardActivityChartProps) {
  const t = useT();
  const maxDaily = Math.max(1, ...dailyActivity.map((point) => point.count));
  const totalShares = typeShares.reduce((sum, share) => sum + share.count, 0);
  const chartWidth = Math.max(320, dailyActivity.length * 18);
  const chartHeight = 180;
  const padX = 8;
  const padTop = 16;
  const padBottom = 28;
  const plotHeight = chartHeight - padTop - padBottom;
  const barGap = 4;
  const barWidth =
    dailyActivity.length === 0
      ? 10
      : Math.max(
          4,
          (chartWidth - padX * 2) / dailyActivity.length - barGap,
        );

  return (
    <section
      className="bg-card relative overflow-hidden rounded-3xl p-4 shadow-sm ring-1 ring-foreground/10 sm:p-5"
      aria-labelledby="dashboard-activity-heading"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,color-mix(in_oklab,var(--primary)_14%,transparent),transparent_42%),radial-gradient(circle_at_88%_8%,color-mix(in_oklab,var(--accent)_16%,transparent),transparent_38%)]"
        aria-hidden
      />

      <div className="relative space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <Typography
              variant="h4"
              id="dashboard-activity-heading"
              className="font-bold"
            >
              Monthly activity
            </Typography>
            <Typography variant="muted">
              Posted movements each day in {asOfMonth}.
            </Typography>
          </div>
          <Typography variant="caption" as="p" className="tabular-nums">
            Peak day: {formatCount(maxDaily)}
          </Typography>
        </div>

        {dailyActivity.every((point) => point.count === 0) ? (
          <div className="bg-muted/40 flex h-44 items-center justify-center rounded-2xl ring-1 ring-foreground/10">
            <Typography variant="muted">
              No posted movements this month yet.
            </Typography>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <svg
              role="img"
              aria-label={`Daily posted movements for ${asOfMonth}`}
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              className="h-48 w-full min-w-[320px]"
            >
              {[0.25, 0.5, 0.75, 1].map((ratio) => {
                const y = padTop + plotHeight * (1 - ratio);
                return (
                  <line
                    key={ratio}
                    x1={padX}
                    x2={chartWidth - padX}
                    y1={y}
                    y2={y}
                    stroke="currentColor"
                    strokeOpacity="0.08"
                    strokeWidth="1"
                  />
                );
              })}

              {dailyActivity.map((point, index) => {
                const height =
                  point.count === 0
                    ? 0
                    : Math.max(3, (point.count / maxDaily) * plotHeight);
                const x = padX + index * (barWidth + barGap);
                const y = padTop + plotHeight - height;
                const showLabel =
                  dailyActivity.length <= 16 ||
                  index % 2 === 0 ||
                  index === dailyActivity.length - 1;

                return (
                  <g key={point.date}>
                    <rect
                      x={x}
                      y={y}
                      width={barWidth}
                      height={height}
                      rx={Math.min(6, barWidth / 2)}
                      fill="url(#dashboardBarFill)"
                    >
                      <title>
                        {point.date}: {point.count} posted
                      </title>
                    </rect>
                    {showLabel ? (
                      <text
                        x={x + barWidth / 2}
                        y={chartHeight - 8}
                        textAnchor="middle"
                        className="fill-muted-foreground"
                        fontSize="10"
                      >
                        {point.dayLabel}
                      </text>
                    ) : null}
                  </g>
                );
              })}

              <defs>
                <linearGradient
                  id="dashboardBarFill"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor="var(--primary)"
                    stopOpacity="0.95"
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--accent)"
                    stopOpacity="0.85"
                  />
                </linearGradient>
              </defs>
            </svg>
          </div>
        )}

        <div className="space-y-2">
          <Typography variant="overline" as="p">
            Mix by type
          </Typography>
          {totalShares === 0 ? (
            <Typography variant="muted">{t.dashboard.noTypeMix}</Typography>
          ) : (
            <>
              <div
                className="flex h-3 overflow-hidden rounded-full ring-1 ring-foreground/10"
                role="img"
                aria-label="Share of transaction types this month"
              >
                {typeShares.map((share) => (
                  <div
                    key={share.type}
                    className="h-full"
                    style={{
                      width: `${(share.count / totalShares) * 100}%`,
                      backgroundColor:
                        TYPE_COLORS[share.type] ?? TYPE_COLORS.OTHER,
                    }}
                    title={`${share.label}: ${share.count}`}
                  />
                ))}
              </div>
              <ul className="flex flex-wrap gap-2">
                {typeShares.map((share) => (
                  <li
                    key={share.type}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full bg-muted/50 px-2.5 py-1 text-xs font-medium ring-1 ring-foreground/10",
                    )}
                  >
                    <span
                      className="size-2.5 rounded-full"
                      style={{
                        backgroundColor:
                          TYPE_COLORS[share.type] ?? TYPE_COLORS.OTHER,
                      }}
                      aria-hidden
                    />
                    <span>
                      {share.label} · {formatCount(share.count)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
