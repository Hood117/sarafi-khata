/**
 * LIFO stack of dismissible overlays (modals, global search).
 * Esc closes only the topmost entry — no per-overlay Escape window listeners.
 */
type OverlayClose = () => void;

const stack: OverlayClose[] = [];

export function registerOverlayClose(onClose: OverlayClose): () => void {
  stack.push(onClose);
  return () => {
    const idx = stack.lastIndexOf(onClose);
    if (idx >= 0) stack.splice(idx, 1);
  };
}

export function closeTopOverlay(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top();
  return true;
}

export function hasOpenOverlay(): boolean {
  return stack.length > 0;
}
