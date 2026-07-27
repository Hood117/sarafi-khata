import { Typography } from "@/design-system/typography";
import type { AuditValues } from "@/features/audit/domain/types";

type AuditValuesPanelProps = {
  title: string;
  values: AuditValues | null;
};

function formatFieldLabel(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();

  if (!spaced) {
    return key;
  }

  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatFieldValue(value: unknown): { kind: "text" | "json"; text: string } {
  if (value === null || value === undefined) {
    return { kind: "text", text: "—" };
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return { kind: "text", text: trimmed.length > 0 ? trimmed : "—" };
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return { kind: "text", text: String(value) };
  }

  try {
    return {
      kind: "json",
      text: JSON.stringify(value, null, 2),
    };
  } catch {
    return { kind: "text", text: String(value) };
  }
}

function ValueRow({
  label,
  value,
}: {
  label: string;
  value: unknown;
}) {
  const formatted = formatFieldValue(value);

  return (
    <div className="grid gap-1 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-muted-foreground text-sm font-medium">{label}</dt>
      <dd className="text-sm font-medium">
        {formatted.kind === "json" ? (
          <pre className="bg-muted/40 overflow-x-auto rounded-lg px-3 py-2 font-mono text-xs leading-relaxed whitespace-pre-wrap">
            {formatted.text}
          </pre>
        ) : (
          <span className="whitespace-pre-wrap">{formatted.text}</span>
        )}
      </dd>
    </div>
  );
}

/**
 * Readable before/after JSON snapshot panel.
 * Flat fields render as labeled rows; nested values as pretty-printed JSON.
 */
export function AuditValuesPanel({ title, values }: AuditValuesPanelProps) {
  const entries =
    values == null
      ? []
      : Object.entries(values).sort(([left], [right]) =>
          left.localeCompare(right),
        );

  return (
    <section className="ring-foreground/10 space-y-2 rounded-xl p-3 ring-1">
      <Typography variant="h4" className="font-bold">
        {title}
      </Typography>

      {entries.length === 0 ? (
        <Typography variant="muted">No values recorded.</Typography>
      ) : (
        <dl className="space-y-4">
          {entries.map(([key, value]) => (
            <ValueRow key={key} label={formatFieldLabel(key)} value={value} />
          ))}
        </dl>
      )}
    </section>
  );
}
