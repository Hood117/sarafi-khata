/** Compact stat card used on dashboards and desks. */

export function Stat({
  label,
  value,
  hint,
  valueSize = "1.25rem",
}: {
  label: string;
  value: string | number;
  hint?: string;
  valueSize?: string;
}) {
  return (
    <div className="stat-card" style={{ minHeight: "6.5rem" }}>
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ fontSize: valueSize }}>
        {value}
      </div>
      {hint ? <div className="muted">{hint}</div> : null}
    </div>
  );
}
