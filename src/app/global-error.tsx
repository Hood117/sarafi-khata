"use client";

import { useEffect } from "react";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

/**
 * Last-resort boundary when the root layout itself fails (e.g. provider crash).
 * Must render its own <html> and <body>.
 */
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error("Global application error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
          background: "#fafafa",
          color: "#171717",
        }}
      >
        <div style={{ maxWidth: 28 * 16, padding: 32 }}>
          <p
            style={{
              margin: 0,
              fontSize: 14,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "#737373",
            }}
          >
            Something went wrong
          </p>
          <h1
            style={{
              margin: "8px 0 0",
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: "-0.02em",
            }}
          >
            Unable to load Saraf
          </h1>
          <p style={{ margin: "12px 0 0", fontSize: 14, lineHeight: 1.6, color: "#525252" }}>
            An unexpected error occurred. Please try again. If the problem
            continues, restart the application.
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
            <button
              type="button"
              onClick={reset}
              style={{
                border: 0,
                borderRadius: 999,
                padding: "10px 18px",
                background: "#171717",
                color: "#fafafa",
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => {
                window.location.href = "/login";
              }}
              style={{
                border: "1px solid #d4d4d4",
                borderRadius: 999,
                padding: "10px 18px",
                background: "#fff",
                color: "#171717",
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Go to login
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
