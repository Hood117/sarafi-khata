import { useEffect, useRef, useState } from "react";

import {
  completeReceiveHawala,
  getCashBalances,
  type HawalaDetail,
} from "@desktop/api";
import { useAuth } from "@desktop/auth";
import { useT } from "@desktop/i18n";
import { moneyToneClass } from "@desktop/lib/currency-labels";
import { statusLabel } from "@desktop/lib/i18n-labels";
import { txDisplayRef } from "@desktop/lib/tx-ref";
import { endSubmit, errorMessage, tryBeginSubmit } from "@desktop/lib/datetime";
import {
  formatAmountDisplay,
  formatMoney,
  parseMoney,
  statusBadgeClass,
} from "@desktop/pages/hawala-helpers";
import { Modal } from "@desktop/ui/modal";

export function payoutAmount(detail: HawalaDetail): string {
  const net = (detail.receiveAmount ?? "").trim();
  if (net) return net;
  const gross = parseMoney(detail.amount);
  const fee = parseMoney(detail.ownCommissionAmount ?? "0");
  return formatMoney(Math.max(0, gross - fee));
}

export function isPendingReceiveHawala(row: {
  direction: string;
  status: string;
}): boolean {
  return (
    row.direction.toUpperCase() === "RECEIVE" &&
    row.status.toUpperCase() === "PENDING"
  );
}

function BoldMoney({
  amount,
  currency,
  className,
}: {
  amount: string | number;
  currency: string;
  className?: string;
}) {
  return (
    <strong className={className}>
      {formatAmountDisplay(String(amount))} {currency}
    </strong>
  );
}

export function CompleteReceiveHawalaModal({
  detail,
  busy,
  error,
  onClose,
  onCompleted,
  onError,
  onBusy,
}: {
  detail: HawalaDetail;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onCompleted: (updated: HawalaDetail) => void;
  onError: (message: string) => void;
  onBusy: (busy: boolean) => void;
}) {
  const t = useT();
  const { session } = useAuth();
  const submittingRef = useRef(false);
  const pay = payoutAmount(detail);
  const payN = parseMoney(pay);
  const toCustomer = Boolean(detail.receiverCustomerId);
  const [vaultAvailable, setVaultAvailable] = useState<number | null>(null);
  const [cashStatus, setCashStatus] = useState<"idle" | "loading" | "ready" | "error">(
    toCustomer ? "idle" : "loading",
  );
  const message = (
    toCustomer
      ? t.hawala.completeConfirmCreditAccount
      : t.hawala.completeConfirmPayVault
  )
    .replace("{amount}", formatAmountDisplay(pay))
    .replace("{currency}", detail.currencyCode)
    .replace("{receiver}", detail.receiverName);

  useEffect(() => {
    if (toCustomer) {
      setVaultAvailable(null);
      setCashStatus("idle");
      return;
    }
    let cancelled = false;
    setCashStatus("loading");
    setVaultAvailable(null);
    void getCashBalances()
      .then((rows) => {
        if (cancelled) return;
        const row = rows.find(
          (r) =>
            r.currencyCode.toUpperCase() === detail.currencyCode.toUpperCase(),
        );
        setVaultAvailable(row ? parseMoney(row.balanceDisplay) : 0);
        setCashStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setVaultAvailable(null);
        setCashStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [detail.currencyCode, toCustomer]);

  const shortage =
    !toCustomer && cashStatus === "ready" && vaultAvailable != null && payN > vaultAvailable
      ? payN - vaultAvailable
      : 0;
  const resultingVault =
    cashStatus === "ready" && vaultAvailable != null ? vaultAvailable - payN : null;
  const waitingForCash = !toCustomer && cashStatus === "loading";
  const confirmLabel = shortage > 0 ? t.hawala.completeAnyway : t.hawala.completeHawala;

  async function confirm() {
    if (!session || busy || waitingForCash || !tryBeginSubmit(submittingRef)) return;
    onBusy(true);
    onError("");
    try {
      const updated = await completeReceiveHawala({
        id: detail.id,
        actorUserId: session.userId,
      });
      onCompleted(updated);
    } catch (err: unknown) {
      onError(errorMessage(err, t.errors.hawalaSave));
    } finally {
      endSubmit(submittingRef);
      onBusy(false);
    }
  }

  return (
    <Modal
      title={
        shortage > 0
          ? t.hawala.insufficientMainVaultCash
          : t.hawala.completeConfirmTitle
      }
      onClose={onClose}
      size="md"
    >
      <div className="stack">
        {error ? <p className="error">{error}</p> : null}
        {shortage > 0 && resultingVault != null ? (
          <div className="hawala-cash-shortage" role="status">
            <div className="hawala-cash-shortage-lines">
              <p>
                {t.hawala.requiredPayout}:{" "}
                <BoldMoney amount={pay} currency={detail.currencyCode} />
              </p>
              <p>
                {t.hawala.availableCash}:{" "}
                <BoldMoney amount={vaultAvailable ?? 0} currency={detail.currencyCode} />
              </p>
              <p>
                {t.hawala.shortage}:{" "}
                <BoldMoney amount={shortage} currency={detail.currencyCode} />
              </p>
              <p>
                {t.hawala.resultingMainVault}:{" "}
                <BoldMoney
                  amount={resultingVault}
                  currency={detail.currencyCode}
                  className={moneyToneClass(resultingVault)}
                />
              </p>
            </div>
            <p className="hawala-cash-shortage-note">{t.hawala.completeShortageWarning}</p>
          </div>
        ) : (
          <p style={{ margin: 0 }}>{message}</p>
        )}
        <table>
          <tbody>
            <tr>
              <th>{t.desk.hawalaNumber}</th>
              <td>
                <strong>{txDisplayRef(detail)}</strong>
              </td>
            </tr>
            <tr>
              <th>{t.hawala.receiver}</th>
              <td>{detail.receiverName}</td>
            </tr>
            <tr>
              <th>{t.common.amount}</th>
              <td>
                {formatAmountDisplay(detail.amount)} {detail.currencyCode}
              </td>
            </tr>
            <tr>
              <th>{t.hawala.netPayout}</th>
              <td>
                {formatAmountDisplay(pay)} {detail.currencyCode}
              </td>
            </tr>
            <tr>
              <th>{t.hawala.completeConfirmStatus}</th>
              <td>
                <span className={statusBadgeClass(detail.status)}>
                  {statusLabel(t, detail.status)}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
        <div className="row" style={{ justifyContent: "flex-end", gap: "0.5rem" }}>
          <button type="button" className="secondary" disabled={busy} onClick={onClose}>
            {t.common.cancel}
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={busy || waitingForCash}
            onClick={() => void confirm()}
          >
            {busy ? t.common.saving : waitingForCash ? t.common.loading : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
