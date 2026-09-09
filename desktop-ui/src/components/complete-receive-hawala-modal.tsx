import { useRef } from "react";

import { completeReceiveHawala, type HawalaDetail } from "@desktop/api";
import { useAuth } from "@desktop/auth";
import { useT } from "@desktop/i18n";
import { statusLabel } from "@desktop/lib/i18n-labels";
import { txDisplayRef } from "@desktop/lib/tx-ref";
import { endSubmit, errorMessage, tryBeginSubmit } from "@desktop/lib/datetime";
import { formatMoney, parseMoney, statusBadgeClass } from "@desktop/pages/hawala-helpers";
import { Modal } from "@desktop/ui/modal";

function formatAmountDisplay(raw: string): string {
  const n = parseMoney(raw);
  const formatted = formatMoney(n);
  const [intPart, frac] = formatted.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac ? `${grouped}.${frac}` : grouped;
}

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
  const toCustomer = Boolean(detail.receiverCustomerId);
  const message = (
    toCustomer
      ? t.hawala.completeConfirmCreditAccount
      : t.hawala.completeConfirmPayVault
  )
    .replace("{amount}", formatAmountDisplay(pay))
    .replace("{currency}", detail.currencyCode)
    .replace("{receiver}", detail.receiverName);

  async function confirm() {
    if (!session || busy || !tryBeginSubmit(submittingRef)) return;
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
    <Modal title={t.hawala.completeConfirmTitle} onClose={onClose} size="md">
      <div className="stack">
        {error ? <p className="error">{error}</p> : null}
        <p style={{ margin: 0 }}>{message}</p>
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
            disabled={busy}
            onClick={() => void confirm()}
          >
            {busy ? t.common.saving : t.hawala.completeHawala}
          </button>
        </div>
      </div>
    </Modal>
  );
}
