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
import {
  isUnmatchedFingerprint,
  notifyWrongFingerprint,
  playFingerprintSound,
} from "@desktop/lib/fingerprint-sounds";
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
  const [fpTemplateBase64, setFpTemplateBase64] = useState<string | null>(null);
  const [completed, setCompleted] = useState<HawalaDetail | null>(null);
  const [businessName, setBusinessName] = useState("ASMS");
  const [printBusy, setPrintBusy] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const [printOk, setPrintOk] = useState<string | null>(null);

  // Hold the global 1:N identify loop for the whole collection modal so it
  // cannot contend for the scanner or navigate away mid-verify.
  useEffect(() => {
    pauseFingerprintIdentify();
    return () => resumeFingerprintIdentify();
  }, []);

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
    setFpTemplateBase64(null);
    try {
      const result = await verifyHawalaCollectorFingerprint(detail.id, {
        receiverNationalId: nationalId || null,
        receiverPhone: phone || null,
      });
      if (result.ok) {
        playFingerprintSound("success");
        setFpState("verified");
        setFpScore(result.matchScore);
        setFpTemplateBase64(result.templateBase64?.trim() || null);
        setFpMessage(
          result.message?.trim() || t.hawala.verifyFingerprintVerified,
        );
      } else {
        const message =
          result.message?.trim() || t.hawala.verifyFingerprintFailed;
        if (isUnmatchedFingerprint(message)) notifyWrongFingerprint();
        setFpState("failed");
        setFpScore(result.matchScore);
        setFpTemplateBase64(null);
        setFpMessage(message);
      }
    } catch (err: unknown) {
      const message = errorMessage(err, t.hawala.verifyFingerprintFailed);
      if (isUnmatchedFingerprint(message)) notifyWrongFingerprint();
      setFpState("failed");
      setFpScore(null);
      setFpTemplateBase64(null);
      setFpMessage(message);
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
        collectorFingerprintTemplate: fpTemplateBase64,
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
        size="wide"
      >
        <div className="stack hawala-complete-form">
          <div className="hawala-complete-scroll">
            <div className="hawala-complete-layout">
              <div className="hawala-complete-main">
                <section className="hawala-complete-section hawala-complete-section--payout">
                  <header className="hawala-complete-section-head">
                    <span className="hawala-complete-section-kicker">
                      {t.hawala.netPayout}
                    </span>
                    <h3 className="hawala-complete-section-title">
                      {formatAmountDisplay(receiptPay)} {completed.currencyCode}
                    </h3>
                  </header>
                  <dl className="hawala-complete-summary">
                    <div>
                      <dt>{t.desk.hawalaNumber}</dt>
                      <dd>
                        <strong>{hawalaNumberRef(completed)}</strong>
                      </dd>
                    </div>
                    <div>
                      <dt>{t.hawala.completeConfirmStatus}</dt>
                      <dd>
                        <span className={statusBadgeClass(completed.status)}>
                          {statusLabel(t, completed.status)}
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt>{t.hawala.sender}</dt>
                      <dd>{completed.senderName}</dd>
                    </div>
                    <div>
                      <dt>{t.hawala.receiver}</dt>
                      <dd>{completed.receiverName}</dd>
                    </div>
                    <div>
                      <dt>{t.common.phone}</dt>
                      <dd>{completed.receiverPhone?.trim() || "—"}</dd>
                    </div>
                    <div>
                      <dt>{t.common.nationalId}</dt>
                      <dd>{completed.receiverNationalId?.trim() || "—"}</dd>
                    </div>
                    <div>
                      <dt>{t.common.amount}</dt>
                      <dd>
                        {formatAmountDisplay(completed.amount)}{" "}
                        {completed.currencyCode}
                      </dd>
                    </div>
                  </dl>
                </section>
              </div>
              <aside className="hawala-complete-aside">
                <section className="hawala-complete-section hawala-complete-section--receipt">
                  <header className="hawala-complete-section-head">
                    <span className="hawala-complete-section-kicker">
                      {t.transactions.printReceipt}
                    </span>
                    <h3 className="hawala-complete-section-title">
                      {t.hawala.collectionReceiptTitle}
                    </h3>
                  </header>
                  <pre
                    className="hawala-receipt-preview"
                    aria-label={t.hawala.collectionReceiptTitle}
                  >
                    {preview}
                  </pre>
                  {printError ? <p className="error">{printError}</p> : null}
                  {printOk ? <p className="muted">{printOk}</p> : null}
                </section>
              </aside>
            </div>
          </div>
          <div className="hawala-complete-footer">
            <div className="modal-actions">
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
      size="wide"
    >
      <div className="stack hawala-complete-form">
        <div className="hawala-complete-scroll">
          {error ? <p className="error">{error}</p> : null}
          <div className="hawala-complete-layout">
            <div className="hawala-complete-main">
              <section className="hawala-complete-section hawala-complete-section--payout">
                <header className="hawala-complete-section-head">
                  <span className="hawala-complete-section-kicker">
                    {t.hawala.netPayout}
                  </span>
                  <h3 className="hawala-complete-section-title">
                    {formatAmountDisplay(pay)} {detail.currencyCode}
                  </h3>
                </header>
                {shortage > 0 && resultingVault != null ? (
                  <div className="hawala-cash-shortage" role="status">
                    <div className="hawala-cash-shortage-lines">
                      <p>
                        {t.hawala.requiredPayout}:{" "}
                        <BoldMoney amount={pay} currency={detail.currencyCode} />
                      </p>
                      <p>
                        {t.hawala.availableCash}:{" "}
                        <BoldMoney
                          amount={vaultAvailable ?? 0}
                          currency={detail.currencyCode}
                        />
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
                    <p className="hawala-cash-shortage-note">
                      {t.hawala.completeShortageWarning}
                    </p>
                  </div>
                ) : null}
                <dl className="hawala-complete-summary">
                  <div>
                    <dt>{t.desk.hawalaNumber}</dt>
                    <dd>
                      <strong>{hawalaNumberRef(detail)}</strong>
                    </dd>
                  </div>
                  <div>
                    <dt>{t.hawala.receiver}</dt>
                    <dd>{detail.receiverName}</dd>
                  </div>
                  <div>
                    <dt>{t.common.amount}</dt>
                    <dd>
                      {formatAmountDisplay(detail.amount)} {detail.currencyCode}
                    </dd>
                  </div>
                  <div>
                    <dt>{t.hawala.completeConfirmStatus}</dt>
                    <dd>
                      <span className={statusBadgeClass(detail.status)}>
                        {statusLabel(t, detail.status)}
                      </span>
                    </dd>
                  </div>
                </dl>
              </section>

              <section className="hawala-complete-section hawala-complete-section--collector">
                <header className="hawala-complete-section-head">
                  <span className="hawala-complete-section-kicker">
                    {t.hawala.receiver}
                  </span>
                  <h3 className="hawala-complete-section-title">
                    {detail.receiverName}
                  </h3>
                </header>
                <div className="hawala-complete-fields">
                  <label>
                    {t.common.nationalId}
                    <input
                      value={collectorNationalId}
                      onChange={(e) => setCollectorNationalId(e.target.value)}
                      disabled={busy || fpState === "scanning"}
                      autoComplete="off"
                      placeholder={t.common.nationalId}
                    />
                  </label>
                  <label>
                    {t.common.phone}
                    <input
                      value={collectorPhone}
                      onChange={(e) => setCollectorPhone(e.target.value)}
                      disabled={busy || fpState === "scanning"}
                      autoComplete="tel"
                      inputMode="tel"
                      placeholder={t.common.phone}
                    />
                  </label>
                </div>
              </section>
            </div>

            <aside className="hawala-complete-aside">
              <section
                className={[
                  "hawala-complete-section",
                  "hawala-complete-section--fingerprint",
                  fpState === "verified" ? "is-verified" : "",
                  fpState === "failed" ? "is-failed" : "",
                  fpState === "scanning" ? "is-scanning" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <header className="hawala-complete-section-head">
                  <span className="hawala-complete-section-kicker">
                    {t.hawala.verifyFingerprint}
                  </span>
                  <h3 className="hawala-complete-section-title">{fpStatusLabel}</h3>
                </header>
                <div className="hawala-fp-hero" aria-hidden>
                  <span className="hawala-fp-hero-ring" />
                  <span className="hawala-fp-hero-core">
                    {fpState === "verified" ? "✓" : fpState === "failed" ? "!" : "◉"}
                  </span>
                </div>
                {fpMessage && (fpState === "failed" || fpState === "verified") ? (
                  <p
                    className={fpState === "failed" ? "error" : "muted"}
                    style={{ margin: 0, fontSize: "0.85rem", textAlign: "center" }}
                  >
                    {fpMessage}
                    {fpState === "verified" && fpScore != null ? ` · ${fpScore}` : ""}
                  </p>
                ) : null}
                <button
                  type="button"
                  className="btn primary hawala-fp-cta"
                  disabled={busy || fpState === "scanning"}
                  onClick={() => void verifyFingerprint()}
                >
                  {fpState === "scanning"
                    ? t.hawala.verifyFingerprintScanning
                    : t.hawala.verifyFingerprint}
                </button>
              </section>
            </aside>
          </div>
        </div>

        <div className="hawala-complete-footer">
          <div className="modal-actions">
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
                  : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
