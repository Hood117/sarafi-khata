/** Open Quick Actions modals from anywhere (global Ctrl shortcuts). */

export type DeskQuickActionId =
  | "deposit"
  | "withdraw"
  | "transfer"
  | "exchange"
  | "sendHawala"
  | "receiveHawala"
  | "newCustomer";

export const DESK_OPEN_QUICK_ACTION_EVENT = "desk:open-quick-action";

export type DeskOpenQuickActionDetail = { id: DeskQuickActionId };

export function openDeskQuickAction(id: DeskQuickActionId): void {
  window.dispatchEvent(
    new CustomEvent<DeskOpenQuickActionDetail>(DESK_OPEN_QUICK_ACTION_EVENT, {
      detail: { id },
    }),
  );
}

/** Ctrl/Cmd letter → quick action (case-insensitive). */
export const QUICK_ACTION_BY_KEY: Record<string, DeskQuickActionId> = {
  d: "deposit",
  w: "withdraw",
  t: "transfer",
  e: "exchange",
  h: "sendHawala",
  r: "receiveHawala",
  c: "newCustomer",
};
