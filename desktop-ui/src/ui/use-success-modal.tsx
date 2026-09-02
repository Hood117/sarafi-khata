import { useCallback, useState } from "react";

import { useT } from "@desktop/i18n";
import { SuccessModal } from "@desktop/ui/success-modal";

/** Shared green-checkmark success dialog — use after every successful desk action. */
export function useSuccessModal() {
  const t = useT();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const showSuccess = useCallback((message: string) => {
    setSuccessMessage(message.trim() || t.common.success);
  }, [t.common.success]);

  const clearSuccess = useCallback(() => setSuccessMessage(null), []);

  const successModal = successMessage ? (
    <SuccessModal
      title={t.common.success}
      message={successMessage}
      onClose={clearSuccess}
      primaryLabel={t.common.close}
    />
  ) : null;

  return { successMessage, showSuccess, clearSuccess, successModal };
}
