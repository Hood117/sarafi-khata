import { Fingerprint } from "lucide-react";

export type FingerprintScanStatus =
  | "idle"
  | "scanning"
  | "lift"
  | "success"
  | "error";

type FingerprintScanStageProps = {
  status?: FingerprintScanStatus;
  className?: string;
  size?: "default" | "compact";
};

/** Shared fingerprint sensor animation (login, enroll, hawala verify). */
export function FingerprintScanStage({
  status = "idle",
  className = "",
  size = "default",
}: FingerprintScanStageProps) {
  const statusClass =
    status === "scanning"
      ? "is-scanning"
      : status === "lift"
        ? "is-lift"
        : status === "success"
          ? "is-success"
          : status === "error"
            ? "is-error"
            : "is-idle";

  return (
    <div
      className={[
        "fp-scan-stage",
        statusClass,
        size === "compact" ? "fp-scan-stage--compact" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-hidden="true"
    >
      <span className="fp-scan-ring fp-scan-ring--outer" />
      <span className="fp-scan-ring fp-scan-ring--mid" />
      <span className="fp-scan-ring fp-scan-ring--inner" />
      <div className="fp-scan-sensor">
        <Fingerprint className="fp-scan-icon" strokeWidth={1.6} />
        <span className="fp-scan-scanline" />
        <span className="fp-scan-glow" />
      </div>
    </div>
  );
}
