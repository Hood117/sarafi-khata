import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "@desktop/auth";
import { DepositFormModal } from "@desktop/components/deposit-form-modal";
import { ExchangeFormModal } from "@desktop/components/exchange-form-modal";
import { SendHawalaFormModal } from "@desktop/components/send-hawala-form-modal";
import { TransferFormModal } from "@desktop/components/transfer-form-modal";
import { WithdrawFormModal } from "@desktop/components/withdraw-form-modal";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Calculator,
  Download,
  Repeat2,
  Send,
  UserPlus,
} from "lucide-react";
import { useT } from "@desktop/i18n";
import {
  DESK_OPEN_QUICK_ACTION_EVENT,
  type DeskOpenQuickActionDetail,
  type DeskQuickActionId,
} from "@desktop/lib/desk-quick-actions";
import {
  canAccessPath,
  canAccessScreen,
  canWriteScreen,
} from "@desktop/lib/permissions";
import { CustomerCreateForm } from "@desktop/pages/customer-forms";
import { SuccessModal } from "@desktop/ui/success-modal";

export const DESK_MOVEMENT_SAVED_EVENT = "desk:movement-saved";
export const DESK_CUSTOMER_CREATED_EVENT = "desk:customer-created";
export const DESK_PARTNER_CREATED_EVENT = "desk:partner-created";

function notifyMovementSaved() {
  window.dispatchEvent(new CustomEvent(DESK_MOVEMENT_SAVED_EVENT));
}

function notifyCustomerCreated(customerId: string) {
  window.dispatchEvent(
    new CustomEvent(DESK_CUSTOMER_CREATED_EVENT, { detail: { customerId } }),
  );
}

type ActionId = DeskQuickActionId;

type ActionTone =
  | "deposit"
  | "withdraw"
  | "transfer"
  | "exchange"
  | "send-hawala"
  | "receive-hawala"
  | "customer";

/**
 * Persistent desk shortcuts under the main nav — available on every screen.
 * Also opens from global Ctrl shortcuts (see use-global-shortcuts).
 */
export function QuickActionsBar() {
  const t = useT();
  const { session } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState<ActionId | null>(null);
  const [hotIndex, setHotIndex] = useState<number | null>(null);
  const [flashSuccess, setFlashSuccess] = useState<string | null>(null);

  function close() {
    setOpen(null);
  }

  function onSaved() {
    notifyMovementSaved();
  }

  const actionScreen: Record<ActionId, string> = {
    deposit: "cash",
    withdraw: "cash",
    transfer: "cash",
    exchange: "cash",
    sendHawala: "hawala",
    receiveHawala: "hawala",
    newCustomer: "customers",
  };

  const actions: Array<{
    id: ActionId;
    label: string;
    icon: ReactNode;
    tone: ActionTone;
  }> = (
    [
      {
        id: "deposit",
        label: t.transactions.deposit,
        icon: <ArrowDownLeft className="nav-icon" size={18} />,
        tone: "deposit",
      },
      {
        id: "withdraw",
        label: t.customers.withdraw,
        icon: <ArrowUpRight className="nav-icon" size={18} />,
        tone: "withdraw",
      },
      {
        id: "transfer",
        label: t.txLine.typeTransfer,
        icon: <ArrowLeftRight className="nav-icon" size={18} />,
        tone: "transfer",
      },
      {
        id: "exchange",
        label: t.dashboard.exchangeBuySell,
        icon: <Repeat2 className="nav-icon" size={18} />,
        tone: "exchange",
      },
      {
        id: "sendHawala",
        label: t.dashboard.sendHawala,
        icon: <Send className="nav-icon" size={18} />,
        tone: "send-hawala",
      },
      {
        id: "receiveHawala",
        label: t.dashboard.receiveHawala,
        icon: <Download className="nav-icon" size={18} />,
        tone: "receive-hawala",
      },
      {
        id: "newCustomer",
        label: t.dashboard.addCustomer,
        icon: <UserPlus className="nav-icon" size={18} />,
        tone: "customer",
      },
    ] as const
  ).filter(
    (action) =>
      canAccessScreen(session, actionScreen[action.id]) &&
      canWriteScreen(session, actionScreen[action.id]),
  );

  const allowedKey = actions.map((a) => a.id).join(",");
  const allowedIds = useMemo(
    () => new Set(allowedKey.split(",").filter(Boolean) as ActionId[]),
    [allowedKey],
  );

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<DeskOpenQuickActionDetail>).detail;
      const id = detail?.id;
      if (!id || !allowedIds.has(id)) return;
      setOpen(id);
    };
    window.addEventListener(DESK_OPEN_QUICK_ACTION_EVENT, onOpen);
    return () => window.removeEventListener(DESK_OPEN_QUICK_ACTION_EVENT, onOpen);
  }, [allowedIds]);

  const showCalculator = canAccessPath(session, "/calculator");
  const calculatorActive = location.pathname.startsWith("/calculator");

  const dockItems: Array<{
    id: string;
    label: string;
    icon: ReactNode;
    tone: string;
    selected: boolean;
    iconOnly?: boolean;
    onClick: () => void;
  }> = [
    ...actions.map((action) => ({
      id: action.id,
      label: action.label,
      icon: action.icon,
      tone: action.tone,
      selected: open === action.id,
      onClick: () => {
        setOpen(action.id);
      },
    })),
    ...(showCalculator
      ? [
          {
            id: "calculator",
            label: t.nav.calculator,
            icon: <Calculator className="nav-icon" size={18} />,
            tone: "calculator",
            selected: calculatorActive,
            iconOnly: true,
            onClick: () => navigate("/calculator"),
          },
        ]
      : []),
  ];

  if (dockItems.length === 0) return null;

  function dockScale(index: number, selected: boolean): number {
    if (hotIndex === null) return selected ? 1.22 : 1;
    const dist = Math.abs(index - hotIndex);
    if (dist === 0) return 1.52;
    if (dist === 1) return 1.24;
    if (dist === 2) return 1.1;
    return selected ? 1.08 : 1;
  }

  return (
    <>
      <div className="quick-actions-bar" aria-label={t.dashboard.quickActions}>
        {actions.length > 0 ? (
          <span className="quick-actions-bar-label">{t.dashboard.quickActions}</span>
        ) : null}
        <div
          className="quick-actions-bar-track"
          onPointerLeave={() => setHotIndex(null)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setHotIndex(null);
          }}
        >
          {dockItems.map((item, index) => {
            const isHot = hotIndex === index;
            const showName = item.selected || isHot;
            return (
              <button
                key={item.id}
                type="button"
                className={[
                  "quick-action-chip",
                  `quick-action-chip--${item.tone}`,
                  item.iconOnly ? "quick-action-chip--icon" : "",
                  item.selected ? "is-selected" : "",
                  isHot ? "is-hot" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={{ "--dock-scale": String(dockScale(index, item.selected)) } as CSSProperties}
                title={item.label}
                aria-label={item.label}
                aria-pressed={item.selected}
                aria-current={item.id === "calculator" && item.selected ? "page" : undefined}
                onPointerEnter={() => setHotIndex(index)}
                onFocus={() => setHotIndex(index)}
                onClick={item.onClick}
              >
                <span className="quick-action-chip-icon" aria-hidden>
                  {item.icon}
                </span>
                <span
                  className="quick-action-chip-label"
                  data-dock-name={showName ? "true" : undefined}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <DepositFormModal
        open={open === "deposit"}
        onClose={close}
        onSaved={onSaved}
      />
      <WithdrawFormModal
        open={open === "withdraw"}
        onClose={close}
        onSaved={onSaved}
      />
      <TransferFormModal
        open={open === "transfer"}
        onClose={close}
        onSaved={onSaved}
      />
      <ExchangeFormModal
        open={open === "exchange"}
        onClose={close}
        onSaved={onSaved}
      />
      <SendHawalaFormModal
        open={open === "sendHawala"}
        direction="SEND"
        onClose={close}
        onSaved={onSaved}
      />
      <SendHawalaFormModal
        open={open === "receiveHawala"}
        direction="RECEIVE"
        onClose={close}
        onSaved={onSaved}
      />

      <CustomerCreateForm
        open={open === "newCustomer"}
        onClose={close}
        onCreated={(created) => {
          notifyCustomerCreated(created.id);
        }}
        onSaved={(saved) => {
          notifyCustomerCreated(saved.id);
          setFlashSuccess(t.common.success);
        }}
      />

      {flashSuccess ? (
        <SuccessModal
          title={t.common.success}
          message={flashSuccess}
          onClose={() => setFlashSuccess(null)}
        />
      ) : null}
    </>
  );
}
