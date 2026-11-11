/**
 * Cross-screen desk data events.
 * Layout remounts the current page when these fire so lists/balances stay fresh
 * without a manual refresh click.
 */

export const DESK_MOVEMENT_SAVED_EVENT = "desk:movement-saved";
export const DESK_CUSTOMER_CREATED_EVENT = "desk:customer-created";
export const DESK_PARTNER_CREATED_EVENT = "desk:partner-created";

/** Any ledger / cash / hawala / exchange post that should refresh the open screen. */
export function notifyMovementSaved(): void {
  window.dispatchEvent(new CustomEvent(DESK_MOVEMENT_SAVED_EVENT));
}

export function notifyCustomerCreated(customerId: string): void {
  window.dispatchEvent(
    new CustomEvent(DESK_CUSTOMER_CREATED_EVENT, { detail: { customerId } }),
  );
}

export function notifyPartnerCreated(partnerId: string): void {
  window.dispatchEvent(
    new CustomEvent(DESK_PARTNER_CREATED_EVENT, { detail: { partnerId } }),
  );
}

/** Alias for callers that mutate desk data outside a movement form. */
export function notifyDeskDataChanged(): void {
  notifyMovementSaved();
}
