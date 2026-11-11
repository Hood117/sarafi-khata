import {
  forwardRef,
  useImperativeHandle,
  useRef,
  type InputHTMLAttributes,
} from "react";

import { normalizePhoneInput } from "@desktop/lib/validation/phone";

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "inputMode" | "onChange" | "value"
> & {
  value: string;
  onValueChange: (value: string) => void;
};

/**
 * Phone field: Western digits + optional +, spaces, dashes only.
 */
export const PhoneInput = forwardRef<HTMLInputElement, Props>(
  function PhoneInput(
    { value, onValueChange, className, dir, lang, ...rest },
    ref,
  ) {
    const innerRef = useRef<HTMLInputElement | null>(null);
    useImperativeHandle(ref, () => innerRef.current as HTMLInputElement);

    return (
      <input
        {...rest}
        ref={innerRef}
        type="tel"
        inputMode="tel"
        autoComplete={rest.autoComplete ?? "tel"}
        dir={dir ?? "ltr"}
        lang={lang ?? "en"}
        className={["ltr-text", "phone-ltr", className].filter(Boolean).join(" ")}
        value={value}
        onChange={(e) => onValueChange(normalizePhoneInput(e.target.value))}
      />
    );
  },
);
