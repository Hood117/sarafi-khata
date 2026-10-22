import { useEffect, useMemo, useState, useRef, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useSearchParams } from "react-router-dom";

import {
  depositFunds,
  listCurrenciesPage,
  listCustomersPage,
  listWalletsPage,
  transferFunds,
  withdrawFunds,
  type CurrencyListItem,
  type CustomerListItem,
  type WalletListItem,
} from "@desktop/api";
import { useAuth } from "@desktop/auth";
import { IconCash, IconTransfers } from "@desktop/icons";
import { useT } from "@desktop/i18n";
import { todayIso } from "@desktop/lib/datetime";
import { pickDefaultCurrency } from "@desktop/lib/default-currency";
import { handleDeskFormKeyDown } from "@desktop/lib/form-keyboard";
import { txDisplayRef } from "@desktop/lib/tx-ref";
import { AmountInput } from "@desktop/ui/amount-input";
import { useSuccessModal } from "@desktop/ui/use-success-modal";

type Tab = "deposit" | "withdraw" | "transfer";

function parseTab(raw: string | null): Tab {
  if (raw === "withdraw" || raw === "transfer" || raw === "deposit") return raw;
  return "deposit";
}

export function MovementsPage() {
  const t = useT();
  const { session } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));
  const [currencies, setCurrencies] = useState<CurrencyListItem[]>([]);
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [customerWallets, setCustomerWallets] = useState<WalletListItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showSuccess, successModal } = useSuccessModal();

  const [reference, setReference] = useState(() => `REF-${Date.now()}`);
  const [amount, setAmount] = useState("");
  const [currencyCode, setCurrencyCode] = useState("");
  const [customerWalletId, setCustomerWalletId] = useState("");
  const [senderCustomerId, setSenderCustomerId] = useState("");
  const [receiverCustomerId, setReceiverCustomerId] = useState("");
  const [description, setDescription] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  function selectTab(next: Tab) {
    setError(null);
    setSearchParams({ tab: next }, { replace: true });
  }

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      listCurrenciesPage({ activeOnly: true, pageSize: 100 }),
      listCustomersPage({ archiveFilter: "active", page: 1, pageSize: 100 }),
      listWalletsPage({ walletType: "CUSTOMER", activeOnly: true, pageSize: 200 }),
    ])
      .then(([ccy, cust, cw]) => {
        if (cancelled) return;
        setCurrencies(ccy.items);
        setCustomers(cust.items);
        setCustomerWallets(cw.items);
        if (ccy.items[0]) setCurrencyCode(pickDefaultCurrency(ccy.items));
        if (cw.items[0]) setCustomerWalletId(cw.items[0].id);
        if (cust.items[0]) setSenderCustomerId(cust.items[0].id);
        if (cust.items[1]) setReceiverCustomerId(cust.items[1].id);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const customerWalletOptions = useMemo(
    () =>
      customerWallets.map((w) => ({
        id: w.id,
        label: w.name,
      })),
    [customerWallets],
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      if (tab === "deposit") {
        const posted = await depositFunds({
          reference,
          customerWalletId,
          currencyCode,
          amount,
          valueDate: todayIso(),
          description: description || undefined,
          createdById: session.userId,
        });
        showSuccess(`${t.txLine.typeDeposit}: ${txDisplayRef(posted)}`);
      } else if (tab === "withdraw") {
        const posted = await withdrawFunds({
          reference,
          customerWalletId,
          currencyCode,
          amount,
          valueDate: todayIso(),
          description: description || undefined,
          createdById: session.userId,
        });
        showSuccess(`${t.txLine.typeWithdrawal}: ${txDisplayRef(posted)}`);
      } else {
        const posted = await transferFunds({
          reference,
          senderCustomerId,
          receiverCustomerId,
          currencyCode,
          amount,
          valueDate: todayIso(),
          description: description || undefined,
          createdById: session.userId,
        });
        showSuccess(`${t.txLine.typeTransfer}: ${txDisplayRef(posted)}`);
      }
      setReference(`REF-${Date.now()}`);
      setAmount("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="nav-row">
        {(
          [
            ["deposit", t.txLine.typeDeposit, <IconCash key="d" />],
            ["withdraw", t.txLine.typeWithdrawal, <IconTransfers key="w" />],
            ["transfer", t.txLine.typeTransfer, <IconTransfers key="t" />],
          ] as const
        ).map(([id, label, icon]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? "nav-link active" : "nav-link"}
            onClick={() => selectTab(id)}
          >
            <span className="nav-link-icon">{icon}</span>
            <span className="nav-link-label">{label}</span>
          </button>
        ))}
      </div>

      <form
        ref={formRef}
        className="card stack"
        data-desk-form
        onKeyDown={(e: ReactKeyboardEvent<HTMLFormElement>) =>
          handleDeskFormKeyDown(e, {
            busy,
            onSubmit: () => formRef.current?.requestSubmit(),
          })
        }
        onSubmit={(e) => void handleSubmit(e)}
      >
        <label>
          {t.common.reference} *
          <input required value={reference} onChange={(e) => setReference(e.target.value)} />
        </label>
        <div className="row">
          <label style={{ flex: 1 }}>
            {t.common.amount} *
            <AmountInput
              required
              value={amount}
              placeholder="0.00"
              onValueChange={setAmount}
            />
          </label>
          <label style={{ minWidth: 120 }}>
            {t.common.currency} *
            <select
              required
              value={currencyCode}
              onChange={(e) => setCurrencyCode(e.target.value)}
            >
              {currencies.map((c) => (
                <option key={c.id} value={c.code}>
                  {c.code}
                </option>
              ))}
            </select>
          </label>
        </div>

        {tab !== "transfer" ? (
          <label>
            {t.common.wallet} *
            <select
              required
              value={customerWalletId}
              onChange={(e) => setCustomerWalletId(e.target.value)}
            >
              {customerWalletOptions.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label>
              {t.common.sender} *
              <select
                required
                value={senderCustomerId}
                onChange={(e) => setSenderCustomerId(e.target.value)}
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName} {c.code ? `(${c.code})` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t.common.receiver} *
              <select
                required
                value={receiverCustomerId}
                onChange={(e) => setReceiverCustomerId(e.target.value)}
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName} {c.code ? `(${c.code})` : ""}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        <label>
          {t.common.description}
          <input value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>

        {error ? <p className="error">{error}</p> : null}
        <button type="submit" disabled={busy}>
          {busy ? t.common.posting : t.common.submit}
        </button>
      </form>
      {successModal}
    </div>
  );
}
