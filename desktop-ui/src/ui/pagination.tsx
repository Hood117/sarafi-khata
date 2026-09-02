import type { ReactNode } from "react";

import { useT } from "@desktop/i18n";

export function Pagination({
  page,
  pageSize,
  total,
  busy,
  onPageChange,
  label,
}: {
  page: number;
  pageSize: number;
  total: number;
  busy?: boolean;
  onPageChange: (page: number) => void;
  label?: ReactNode;
}) {
  const t = useT();
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const current = Math.min(Math.max(1, page), totalPages);
  if (total <= 0 && current <= 1) {
    return label ? (
      <p className="muted" style={{ margin: 0 }}>
        {label}
      </p>
    ) : null;
  }

  return (
    <div
      className="row"
      style={{
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "0.5rem",
      }}
    >
      <p className="muted" style={{ margin: 0 }}>
        {label ?? (
          <>
            {t.common.showing} {current} {t.common.of} {totalPages} · {total}
          </>
        )}
      </p>
      <div className="row" style={{ gap: "0.4rem" }}>
        <button
          type="button"
          className="secondary"
          disabled={busy || current <= 1}
          onClick={() => onPageChange(current - 1)}
        >
          {t.common.previous}
        </button>
        <span className="muted" style={{ alignSelf: "center", fontSize: "0.85rem" }}>
          {current} / {totalPages}
        </span>
        <button
          type="button"
          className="secondary"
          disabled={busy || current >= totalPages}
          onClick={() => onPageChange(current + 1)}
        >
          {t.common.next}
        </button>
      </div>
    </div>
  );
}
