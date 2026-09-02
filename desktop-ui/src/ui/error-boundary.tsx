import { Component, type ErrorInfo, type ReactNode } from "react";

import { logAppError } from "@desktop/lib/app-error";
import { useT } from "@desktop/i18n";

type Props = { children: ReactNode };
type State = { error: Error | null };

function CrashScreen({
  error,
  onRetry,
  onReload,
}: {
  error: Error | null;
  onRetry: () => void;
  onReload: () => void;
}) {
  const t = useT();
  const detail = error?.message?.trim();
  return (
    <div className="app-crash section-card stack" role="alert">
      <h1 style={{ margin: 0 }}>{t.errors.crashTitle}</h1>
      <p className="muted" style={{ margin: 0 }}>
        {t.errors.crashHint}
      </p>
      {detail ? (
        <pre
          className="muted"
          style={{
            margin: 0,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            fontSize: "0.82rem",
            maxHeight: "8rem",
            overflow: "auto",
          }}
        >
          {detail}
        </pre>
      ) : null}
      <div className="row" style={{ gap: "0.5rem" }}>
        <button type="button" className="btn primary" onClick={onRetry}>
          {t.common.tryAgain}
        </button>
        <button type="button" className="btn" onClick={onReload}>
          {t.errors.reloadApp}
        </button>
      </div>
    </div>
  );
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logAppError("react-boundary", error);
    if (info.componentStack) {
      console.error(`[saraf] react-boundary stack:${info.componentStack}`);
    }
  }

  render() {
    if (this.state.error) {
      return (
        <CrashScreen
          error={this.state.error}
          onRetry={() => this.setState({ error: null })}
          onReload={() => window.location.reload()}
        />
      );
    }
    return this.props.children;
  }
}
