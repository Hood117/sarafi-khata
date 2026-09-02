import type { ComponentType, ErrorInfo, ReactNode, SVGProps } from "react";
import { Component } from "react";
import * as FlagIcons from "country-flag-icons/react/3x2";

import {
  currencyCountryCode,
  currencyFlagSrc,
  hasBundledCurrencyFlag,
} from "@desktop/lib/currency-flags";

type Props = {
  code: string;
  className?: string;
  size?: "sm" | "md";
};

type FlagSvgProps = SVGProps<SVGSVGElement> & { title?: string };

function countryFlagComponent(
  countryCode: string,
): ComponentType<FlagSvgProps> | null {
  const Flag = (FlagIcons as Record<string, ComponentType<FlagSvgProps>>)[
    countryCode
  ];
  return typeof Flag === "function" ? Flag : null;
}

function FlagImage({
  code,
  className,
  size,
}: {
  code: string;
  className: string;
  size: "sm" | "md";
}) {
  return (
    <img
      className={className}
      src={currencyFlagSrc(code)}
      alt=""
      width={size === "md" ? 28 : 22}
      height={size === "md" ? 18 : 14}
      decoding="async"
      aria-hidden
    />
  );
}

class FlagSafe extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[saraf] currency-flag", error, info.componentStack);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Currency flag: bundled SVG when curated, else real country flag SVG. */
export function CurrencyFlag({ code, className, size = "sm" }: Props) {
  const upper = (code || "").trim().toUpperCase();
  if (!upper || upper === "ALL") return null;

  const sizeClass = size === "md" ? "currency-flag--md" : "currency-flag--sm";
  const classes = ["currency-flag", sizeClass, className].filter(Boolean).join(" ");
  const fallback = <FlagImage code={upper} className={classes} size={size} />;

  if (hasBundledCurrencyFlag(upper)) return fallback;

  const country = currencyCountryCode(upper);
  if (country) {
    const Flag = countryFlagComponent(country);
    if (Flag) {
      return (
        <FlagSafe fallback={fallback}>
          <Flag className={classes} aria-hidden />
        </FlagSafe>
      );
    }
  }

  return fallback;
}

/** Flag + currency code for tables and pickers. */
export function CurrencyCodeWithFlag({
  code,
  className,
}: {
  code: string;
  className?: string;
}) {
  const upper = (code || "").trim().toUpperCase();
  if (!upper) return <span className={className}>—</span>;
  return (
    <span className={["currency-code-with-flag", className].filter(Boolean).join(" ")}>
      <CurrencyFlag code={upper} />
      <span>{upper}</span>
    </span>
  );
}
