import { IconRefresh } from "@desktop/icons";
import { useT } from "@desktop/i18n";

type Props = {
  onClick: () => void;
  busy?: boolean;
  /** Prefer this control when F5 runs (page soft-refresh over layout remount). */
  primary?: boolean;
  className?: string;
  title?: string;
};

/** Shared Refresh control — marked for F5 / desk-action shortcuts. */
export function PageRefreshButton({
  onClick,
  busy = false,
  primary = true,
  className = "btn",
  title,
}: Props) {
  const t = useT();
  return (
    <button
      type="button"
      className={className}
      data-desk-action="refresh"
      data-desk-primary={primary ? "" : undefined}
      disabled={busy}
      title={title ?? `${t.desk.refresh} (F5)`}
      aria-label={t.desk.refresh}
      onClick={onClick}
    >
      <IconRefresh />
      <span>{t.desk.refresh}</span>
    </button>
  );
}
