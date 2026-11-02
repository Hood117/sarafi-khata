import type { ReactNode } from "react";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  BookOpen,
  Receipt,
  Repeat2,
  Send,
  Wallet,
} from "lucide-react";

type Props = {
  type: string | null | undefined;
  className?: string;
  title?: string;
};

/** Compact icon for a ledger / daybook transaction type. */
export function TransactionTypeIcon({ type, className, title }: Props): ReactNode {
  const key = (type ?? "").trim().toUpperCase();
  let Icon = Receipt;
  switch (key) {
    case "DEPOSIT":
    case "VAULT_CASH_IN":
      Icon = ArrowDownLeft;
      break;
    case "WITHDRAWAL":
    case "VAULT_CASH_OUT":
    case "EXPENSE":
      Icon = ArrowUpRight;
      break;
    case "TRANSFER":
      Icon = ArrowLeftRight;
      break;
    case "EXCHANGE":
    case "TRADE_BUY":
    case "TRADE_SELL":
      Icon = Repeat2;
      break;
    case "HAWALA":
    case "HAWALA_RECEIVE":
      Icon = Send;
      break;
    case "OPENING":
      Icon = BookOpen;
      break;
    case "OWNER_CAPITAL":
    case "CAPITAL":
      Icon = Wallet;
      break;
  }

  return (
    <span
      className={["tx-type-icon", `tx-type-icon--${key.toLowerCase() || "unknown"}`, className]
        .filter(Boolean)
        .join(" ")}
      title={title}
      aria-hidden={title ? undefined : true}
    >
      <Icon size={15} aria-hidden />
    </span>
  );
}
