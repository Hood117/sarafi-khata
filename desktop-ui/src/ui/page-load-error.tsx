import { useT } from "@desktop/i18n";

type Props = {
  message: string;
  onRetry?: () => void;
};

/** Inline load failure with optional Retry. Does not replace already-visible data. */
export function PageLoadError({ message, onRetry }: Props) {
  const t = useT();
  return (
    <div className="page-load-error" role="alert">
      <p className="error" style={{ margin: 0 }}>
        {message}
      </p>
      {onRetry ? (
        <button type="button" className="btn" onClick={onRetry}>
          {t.common.tryAgain}
        </button>
      ) : null}
    </div>
  );
}
