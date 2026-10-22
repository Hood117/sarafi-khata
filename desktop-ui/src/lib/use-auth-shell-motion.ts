import { type RefObject } from "react";

import { animateAuthShell, useGSAP } from "@desktop/lib/motion";

export function useAuthShellMotion(
  shellRef: RefObject<HTMLElement | null>,
  playKey: boolean | string,
) {
  useGSAP(
    () => {
      if (!shellRef.current) return;
      animateAuthShell(shellRef.current);
    },
    { scope: shellRef, dependencies: [playKey], revertOnUpdate: true },
  );
}
