/**
 * ← / → navigation for page tab strips marked with role="tablist".
 */
function isVisible(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true") {
    return false;
  }
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function collectTabs(tablist: Element): HTMLElement[] {
  return [...tablist.querySelectorAll<HTMLElement>('[role="tab"]')].filter(isVisible);
}

function resolveTablist(from: EventTarget | null): Element | null {
  if (from instanceof Element) {
    const near = from.closest('[role="tablist"]');
    if (near && isVisible(near)) return near;
  }
  const lists = [...document.querySelectorAll('[role="tablist"]')].filter(isVisible);
  if (lists.length === 0) return null;
  // Prefer a tablist inside main content over chrome.
  const main = document.querySelector("main");
  const inMain = main ? lists.filter((el) => main.contains(el)) : lists;
  return (inMain[inMain.length - 1] ?? lists[lists.length - 1]) ?? null;
}

/**
 * Move to the previous/next tab in the active (or focused) tablist and activate it.
 * `direction` is logical: -1 previous, +1 next. RTL flips ArrowLeft/Right at the call site.
 */
export function navigateDeskTabs(direction: -1 | 1, from: EventTarget | null = null): boolean {
  const tablist = resolveTablist(from);
  if (!tablist) return false;
  const tabs = collectTabs(tablist);
  if (tabs.length < 2) return false;

  const activeEl = document.activeElement;
  let current = tabs.findIndex(
    (tab) =>
      tab === activeEl ||
      tab.getAttribute("aria-selected") === "true" ||
      tab.classList.contains("active"),
  );
  if (current < 0) current = 0;

  const next = tabs[(current + direction + tabs.length) % tabs.length];
  if (!next) return false;
  next.focus();
  next.click();
  return true;
}
