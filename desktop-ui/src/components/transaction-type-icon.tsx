import type { ReactNode } from "react";

import {
  IconCapital,
  IconDeposit,
  IconExchange,
  IconHawala,
  IconReceiveHawala,
  IconTrading,
  IconTransactions,
  IconTransfers,
  IconWithdraw,
} from "@desktop/icons";

type Props = {
  type: string | null | undefined;
  className?: string;
  title?: string;
};

/** Compact icon for a ledger / daybook transaction type. */
export function TransactionTypeIcon({ type, className, title }: Props): ReactNode {
  const key = (type ?? "").trim().toUpperCase();
  const iconProps = { width: 15, height: 15, "aria-hidden": true as const };
  let icon: ReactNode;
  switch (key) {
    case "DEPOSIT":
    case "VAULT_CASH_IN":
      icon = <IconDeposit {...iconProps} />;
      break;
    case "WITHDRAWAL":
    case "VAULT_CASH_OUT":
      icon = <IconWithdraw {...iconProps} />;
      break;
    case "TRANSFER":
      icon = <IconTransfers {...iconProps} />;
      break;
    case "EXCHANGE":
      icon = <IconExchange {...iconProps} />;
      break;
    case "HAWALA":
      icon = <IconHawala {...iconProps} />;
      break;
    case "HAWALA_RECEIVE":
      icon = <IconReceiveHawala {...iconProps} />;
      break;
    case "TRADE_BUY":
    case "TRADE_SELL":
      icon = <IconTrading {...iconProps} />;
      break;
    case "EXPENSE":
      icon = <IconWithdraw {...iconProps} />;
      break;
    case "OPENING":
    case "OWNER_CAPITAL":
    case "CAPITAL":
      icon = <IconCapital {...iconProps} />;
      break;
    default:
      icon = <IconTransactions {...iconProps} />;
  }

  return (
    <span
      className={["tx-type-icon", `tx-type-icon--${key.toLowerCase() || "unknown"}`, className]
        .filter(Boolean)
        .join(" ")}
      title={title}
      aria-hidden={title ? undefined : true}
    >
      {icon}
    </span>
  );
}
