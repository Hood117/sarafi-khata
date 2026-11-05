import { useRef } from "react";

/**
 * Soft-close retention for desk quick-action forms.
 * Accidental close (backdrop / Esc / ✕) keeps typed data;
 * Cancel and successful save discard it.
 */
export function useDeskFormDraftRetain() {
  const retainRef = useRef(false);
  return {
    retainDraft() {
      retainRef.current = true;
    },
    discardDraft() {
      retainRef.current = false;
    },
    shouldRetainDraft() {
      return retainRef.current;
    },
  };
}
