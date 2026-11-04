import { Check } from "lucide-react";

import type { HawalaDetail } from "@desktop/api";
import { useT } from "@desktop/i18n";
import { statusLabel } from "@desktop/lib/i18n-labels";
import { hawalaNumberRef } from "@desktop/lib/tx-ref";
import {
  formatAmountDisplay,
  statusBadgeClass,
} from "@desktop/pages/hawala-helpers";
import { Modal } from "@desktop/ui/modal";

function stamp(value: string | null | undefined): string {
  if (!value) return "—";
  return String(value).replace("T", " ").slice(0, 19);
}

export function HawalaFingerprintMatchModal({
  detail,
  onClose,
}: {
  detail: HawalaDetail;
  onClose: () => void;
}) {
  const t = useT();
  const isSend = detail.direction.toUpperCase() === "SEND";
  const number = hawalaNumberRef(detail);

  return (
    <Modal title={t.hawala.fingerprintMatchCollected} size="wide" onClose={onClose}>
      <div className="stack hawala-complete-form" style={{ gap: "0.75rem" }}>
        <section className="hawala-complete-section hawala-complete-section--payout">
          <header className="hawala-complete-section-head">
            <span className="hawala-complete-section-kicker">
              {t.desk.hawalaNumber}
            </span>
            <h3 className="hawala-complete-section-title">#{number}</h3>
          </header>
          <dl className="hawala-complete-summary">
            <div>
              <dt>{t.hawala.direction}</dt>
              <dd>{isSend ? t.hawala.send : t.hawala.receive}</dd>
            </div>
            <div>
              <dt>{t.common.status}</dt>
              <dd>
                <span className={statusBadgeClass(detail.status)}>
                  {statusLabel(t, detail.status)}
                </span>
              </dd>
            </div>
            <div>
              <dt>{t.hawala.sender}</dt>
              <dd>{detail.senderName || "—"}</dd>
            </div>
            <div>
              <dt>{t.hawala.receiver}</dt>
              <dd>{detail.receiverName || "—"}</dd>
            </div>
            <div>
              <dt>{t.common.amount}</dt>
              <dd>
                <strong>
                  {formatAmountDisplay(detail.amount)} {detail.currencyCode}
                </strong>
              </dd>
            </div>
            <div>
              <dt>{t.common.date}</dt>
              <dd>{stamp(detail.valueDate)}</dd>
            </div>
            {detail.receiverPhone ? (
              <div>
                <dt>{t.common.phone}</dt>
                <dd>{detail.receiverPhone}</dd>
              </div>
            ) : null}
            {detail.receiverNationalId ? (
              <div>
                <dt>{t.common.nationalId}</dt>
                <dd>{detail.receiverNationalId}</dd>
              </div>
            ) : null}
            {detail.completedAt ? (
              <div>
                <dt>{t.hawala.completedAt}</dt>
                <dd>{stamp(detail.completedAt)}</dd>
              </div>
            ) : null}
          </dl>
        </section>
        <div className="modal-actions" style={{ justifyContent: "center" }}>
          <button
            type="button"
            className="btn btn-action btn-action--ok"
            data-desk-action="ok"
            onClick={onClose}
          >
            <Check className="nav-icon" size={18} />
            <span>{t.common.close}</span>
          </button>
        </div>
      </div>
    </Modal>
  );
}
