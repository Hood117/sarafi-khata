import { useEffect, useRef, useState } from "react";

import {
  completeReceiveHawala,
  getBusinessName,
  getCashBalances,
  verifyHawalaCollectorFingerprint,
  type HawalaDetail,
} from "@desktop/api";
import { useAuth } from "@desktop/auth";
import { useT } from "@desktop/i18n";
import { moneyToneClass } from "@desktop/lib/currency-labels";
import {
  pauseFingerprintIdentify,
  resumeFingerprintIdentify,
} from "@desktop/lib/fingerprint-identify-gate";
import { playFingerprintSound } from "@desktop/lib/fingerprint-sounds";
import { statusLabel } from "@desktop/lib/i18n-labels";
import {
  buildHawalaReceiptText,
  printHawalaReceipt,
} from "@desktop/lib/print-hawala-receipt";
import { getPreferredPrinterName } from "@desktop/lib/preferred-printer";
import { hawalaNumberRef } from "@desktop/lib/tx-ref";
import { endSubmit, errorMessage, tryBeginSubmit } from "@desktop/lib/datetime";
import {
  formatAmountDisplay,
  formatMoney,
  parseMoney,
  statusBadgeClass,
} from "@desktop/pages/hawala-helpers";
import { Modal } from "@desktop/ui/modal";

type FpVerifyState = "ready" | "scanning" | "verified" | "failed";

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
  const [collectorPhone, setCollectorPhone] = useState(
    () => detail.receiverPhone ?? "",
  );
  const [collectorNationalId, setCollectorNationalId] = useState(
    () => detail.receiverNationalId ?? "",
  );
  const [fpState, setFpState] = useState<FpVerifyState>("ready");
  const [fpMessage, setFpMessage] = useState<string | null>(null);
  const [fpScore, setFpScore] = useState<number | null>(null);
  const [completed, setCompleted] = useState<HawalaDetail | null>(null);
  const [businessName, setBusinessName] = useState("ASMS");
  const [printBusy, setPrintBusy] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const [printOk, setPrintOk] = useState<string | null>(null);
  const message = (
    toCustomer
      ? t.hawala.completeConfirmCreditAccount
      : t.hawala.completeConfirmPayVault
  )
    .replace("{amount}", formatAmountDisplay(pay))
    .replace("{currency}", detail.currencyCode)
    .replace("{receiver}", detail.receiverName);

  useEffect(() => {
    let cancelled = false;
    void getBusinessName()
      .then((res) => {
        if (cancelled) return;
        const name = (res.businessName ?? "").trim();
        if (name) setBusinessName(name);
      })
      .catch(() => {
        /* keep default */
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  async function verifyFingerprint() {
    if (busy || fpState === "scanning") return;
    const nationalId = collectorNationalId.trim();
    const phone = collectorPhone.trim();
    if (!nationalId && !phone) {
      setFpState("failed");
      setFpScore(null);
      setFpMessage(t.hawala.verifyFingerprintNeedId);
      return;
    }
    setFpState("scanning");
    setFpMessage(t.hawala.verifyFingerprintScanning);
    setFpScore(null);
    pauseFingerprintIdentify();
    try {
      const result = await verifyHawalaCollectorFingerprint(detail.id, {
        receiverNationalId: nationalId || null,
        receiverPhone: phone || null,
      });
      if (result.ok) {
        playFingerprintSound("success");
        setFpState("verified");
        setFpScore(result.matchScore);
        setFpMessage(
          result.message?.trim() || t.hawala.verifyFingerprintVerified,
        );
      } else {
        playFingerprintSound("wrong");
        setFpState("failed");
        setFpScore(result.matchScore);
        setFpMessage(
          result.message?.trim() || t.hawala.verifyFingerprintFailed,
        );
      }
    } catch (err: unknown) {
      playFingerprintSound("wrong");
      setFpState("failed");
      setFpScore(null);
      setFpMessage(errorMessage(err, t.hawala.verifyFingerprintFailed));
    } finally {
      resumeFingerprintIdentify();
    }
  }

  function receiptLabels() {
    return {
      title: t.hawala.collectionReceiptTitle,
      hawalaNumber: t.desk.hawalaNumber,
      sender: t.hawala.sender,
      receiver: t.hawala.receiver,
      collector: t.hawala.receiver,
      phone: t.common.phone,
      nationalId: t.common.nationalId,
      amount: t.common.amount,
      netPayout: t.hawala.netPayout,
      currency: t.common.currency,
      commission: t.hawala.ownCommissionAmount,
      partnerCommission: t.hawala.partnerCommissionAmount,
      date: t.common.date,
      time: t.common.time,
      status: t.common.status,
      reference: t.common.reference,
      transaction: t.transactions.transactionType,
      thankYou: t.transactions.thankYou,
      noPrinterConfigured: t.hawala.receiptNoPrinter,
      printerUnavailable: t.hawala.receiptPrinterUnavailable,
    };
  }

  async function confirm() {
    if (!session || busy || waitingForCash || fpState === "scanning" || !tryBeginSubmit(submittingRef)) return;
    onBusy(true);
    onError("");
    try {
      const updated = await completeReceiveHawala({
        id: detail.id,
        actorUserId: session.userId,
        receiverPhone: collectorPhone.trim() || null,
        receiverNationalId: collectorNationalId.trim() || null,
      });
      // Keep the receipt on screen — do not auto-print.
      setCompleted(updated);
      setPrintError(null);
      setPrintOk(null);
    } catch (err: unknown) {
      onError(errorMessage(err, t.errors.hawalaSave));
    } finally {
      endSubmit(submittingRef);
      onBusy(false);
    }
  }

  async function handlePrintReceipt() {
    if (!completed || printBusy) return;
    setPrintBusy(true);
    setPrintError(null);
    setPrintOk(null);
    try {
      const preferred = getPreferredPrinterName();
      if (!preferred) {
        setPrintError(t.hawala.receiptNoPrinter);
        return;
      }
      const result = await printHawalaReceipt({
        businessName,
        detail: completed,
        statusLabel: statusLabel(t, completed.status),
        labels: receiptLabels(),
      });
      if (result.ok) {
        setPrintOk(result.message);
      } else {
        setPrintError(result.message);
      }
    } catch (err: unknown) {
      setPrintError(errorMessage(err, t.hawala.receiptPrintFailed));
    } finally {
      setPrintBusy(false);
    }
  }

  function finishAfterReceipt() {
    if (!completed) return;
    onCompleted(completed);
  }

  const fpStatusLabel =
    fpState === "scanning"
      ? t.hawala.verifyFingerprintScanning
      : fpState === "verified"
        ? t.hawala.verifyFingerprintVerified
        : fpState === "failed"
          ? t.hawala.verifyFingerprintFailed
          : t.hawala.verifyFingerprintReady;

  if (completed) {
    const receiptPay = payoutAmount(completed);
    const preview = buildHawalaReceiptText({
      businessName,
      detail: completed,
      statusLabel: statusLabel(t, completed.status),
      labels: receiptLabels(),
      formFactor: "thermal",
    });
    return (
      <Modal
        title={t.hawala.collectionReceiptTitle}
        onClose={finishAfterReceipt}
        size="md"
      >
        <div className="stack hawala-receipt-panel">
          <p className="muted" style={{ margin: 0 }}>
            {t.hawala.collectionReceiptHint}
          </p>
          <pre className="hawala-receipt-preview" aria-label={t.hawala.collectionReceiptTitle}>
            {preview}
          </pre>
          <table>
            <tbody>
              <tr>
                <th>{t.desk.hawalaNumber}</th>
                <td>
                  <strong>{hawalaNumberRef(completed)}</strong>
                </td>
              </tr>
              <tr>
                <th>{t.hawala.sender}</th>
                <td>{completed.senderName}</td>
              </tr>
              <tr>
                <th>{t.hawala.receiver}</th>
                <td>{completed.receiverName}</td>
              </tr>
              <tr>
                <th>{t.common.phone}</th>
                <td>{completed.receiverPhone?.trim() || "—"}</td>
              </tr>
              <tr>
                <th>{t.common.nationalId}</th>
                <td>{completed.receiverNationalId?.trim() || "—"}</td>
              </tr>
              <tr>
                <th>{t.common.amount}</th>
                <td>
                  {formatAmountDisplay(completed.amount)} {completed.currencyCode}
                </td>
              </tr>
              <tr>
                <th>{t.hawala.netPayout}</th>
                <td>
                  {formatAmountDisplay(receiptPay)} {completed.currencyCode}
                </td>
              </tr>
              <tr>
                <th>{t.hawala.completeConfirmStatus}</th>
                <td>
                  <span className={statusBadgeClass(completed.status)}>
                    {statusLabel(t, completed.status)}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
          {printError ? <p className="error">{printError}</p> : null}
          {printOk ? <p className="muted">{printOk}</p> : null}
          <div className="row" style={{ justifyContent: "flex-end", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn secondary"
              disabled={printBusy}
              onClick={() => void handlePrintReceipt()}
            >
              {printBusy ? t.common.loading : t.transactions.printReceipt}
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={printBusy}
              onClick={finishAfterReceipt}
            >
              {t.common.close}
            </button>
          </div>
        </div>
      </Modal>
    );
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
                <strong>{hawalaNumberRef(detail)}</strong>
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
            <tr>
              <th>{t.common.nationalId}</th>
              <td>
                <input
                  value={collectorNationalId}
                  onChange={(e) => setCollectorNationalId(e.target.value)}
                  disabled={busy || fpState === "scanning"}
                  autoComplete="off"
                  placeholder={t.common.nationalId}
                />
              </td>
            </tr>
            <tr>
              <th>{t.common.phone}</th>
              <td>
                <input
                  value={collectorPhone}
                  onChange={(e) => setCollectorPhone(e.target.value)}
                  disabled={busy || fpState === "scanning"}
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder={t.common.phone}
                />
              </td>
            </tr>
            <tr>
              <th>{t.hawala.verifyFingerprint}</th>
              <td>
                <div className="hawala-fp-verify stack" style={{ gap: "0.4rem" }}>
                  <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="btn secondary"
                      disabled={busy || fpState === "scanning"}
                      onClick={() => void verifyFingerprint()}
                    >
                      {fpState === "scanning"
                        ? t.hawala.verifyFingerprintScanning
                        : t.hawala.verifyFingerprint}
                    </button>
                    <span
                      className={
                        fpState === "verified"
                          ? "hawala-fp-status hawala-fp-status--ok"
                          : fpState === "failed"
                            ? "hawala-fp-status hawala-fp-status--fail"
                            : fpState === "scanning"
                              ? "hawala-fp-status hawala-fp-status--scan"
                              : "hawala-fp-status muted"
                      }
                    >
                      {fpStatusLabel}
                      {fpState === "verified" && fpScore != null
                        ? ` · ${fpScore}`
                        : ""}
                    </span>
                  </div>
                  {fpMessage && fpState !== "ready" ? (
                    <p
                      className={
                        fpState === "failed" ? "error" : "muted"
                      }
                      style={{ margin: 0, fontSize: "0.85rem" }}
                    >
                      {fpMessage}
                    </p>
                  ) : null}
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <div className="row" style={{ justifyContent: "flex-end", gap: "0.5rem" }}>
          <button
            type="button"
            className="secondary"
            disabled={busy || fpState === "scanning"}
            onClick={onClose}
          >
            {t.common.cancel}
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={
              busy ||
              waitingForCash ||
              fpState === "scanning" ||
              fpState !== "verified"
            }
            onClick={() => void confirm()}
          >
            {busy
              ? t.common.saving
              : waitingForCash
                ? t.common.loading
                : fpState !== "verified"
                  ? t.hawala.verifyFingerprintFirst
                  : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
