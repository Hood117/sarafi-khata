import { useEffect, useRef, type ReactNode } from "react";

export type DeskContextMenuItem = {
  id: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
};

export function DeskContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: DeskContextMenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    let left = x;
    let top = y;
    if (left + rect.width > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - rect.width - pad);
    }
    if (top + rect.height > window.innerHeight - pad) {
      top = Math.max(pad, window.innerHeight - rect.height - pad);
    }
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [x, y, items]);

  return (
    <div
      ref={ref}
      className="desk-context-menu no-print"
      style={{ left: x, top: y }}
      role="menu"
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          className={item.danger ? "is-danger" : undefined}
          disabled={item.disabled}
          onClick={() => {
            if (item.disabled) return;
            onClose();
            item.onSelect();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function DeskContextMenuBackdrop({ children }: { children: ReactNode }) {
  return children;
}
