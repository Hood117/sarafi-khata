import { useEffect, useMemo, useState, type FormEvent } from "react";

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
import { todayIso } from "@desktop/lib/datetime";

type Tab = "deposit" | "withdraw" | "transfer";

export function MovementsPage() {
  const { session } = useAuth();
  const [tab, setTab] = useState<Tab>("deposit");
  const [currencies, setCurrencies] = useState<CurrencyListItem[]>([]);
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [customerWallets, setCustomerWallets] = useState<WalletListItem[]>([]);
  const [cashWallets, setCashWallets] = useState<WalletListItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [reference, setReference] = useState(`REF-${Date.now()}`);
  const [amount, setAmount] = useState("");
  const [currencyCode, setCurrencyCode] = useState("");
  const [customerWalletId, setCustomerWalletId] = useState("");
  const [cashWalletId, setCashWalletId] = useState("");
  const [senderCustomerId, setSenderCustomerId] = useState("");
  const [receiverCustomerId, setReceiverCustomerId] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    void Promise.all([
      listCurrenciesPage({ activeOnly: true, pageSize: 100 }),
      listCustomersPage({ archiveFilter: "active", page: 1, pageSize: 100 }),
      listWalletsPage({ walletType: "CUSTOMER", activeOnly: true, pageSize: 200 }),
      listWalletsPage({ pageSize: 100, activeOnly: true }),
    ])
      .then(([ccy, cust, cw, allWallets]) => {
        setCurrencies(ccy.items);
        setCustomers(cust.items);
        setCustomerWallets(cw.items);
        const cash = allWallets.items.filter(
          (w) => w.type === "TILL" || w.type === "VAULT",
        );
        setCashWallets(cash);
        if (ccy.items[0]) setCurrencyCode(ccy.items[0].code);
        if (cw.items[0]) setCustomerWalletId(cw.items[0].id);
        if (cash[0]) setCashWalletId(cash[0].id);
        if (cust.items[0]) setSenderCustomerId(cust.items[0].id);
        if (cust.items[1]) setReceiverCustomerId(cust.items[1].id);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      });
  }, []);

  const customerWalletOptions = useMemo(
    () =>
      customerWallets.map((w) => ({
        id: w.id,
        label: `${w.name}${w.customerId ? "" : ""}`,
      })),
    [customerWallets],
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!session) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      if (tab === "deposit") {
        const posted = await depositFunds({
          reference,
          customerWalletId,
          cashWalletId,
          currencyCode,
          amount,
          valueDate: todayIso(),
          description: description || undefined,
          createdById: session.userId,
        });
        setOk(`Deposit posted: ${posted.reference}`);
      } else if (tab === "withdraw") {
        const posted = await withdrawFunds({
          reference,
          customerWalletId,
          cashWalletId,
          currencyCode,
          amount,
          valueDate: todayIso(),
          description: description || undefined,
          createdById: session.userId,
        });
        setOk(`Withdrawal posted: ${posted.reference}`);
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
        setOk(`Transfer posted: ${posted.reference}`);
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
      <div>
        <h1 style={{ margin: "0 0 0.25rem" }}>Cash desk</h1>
        <p className="muted" style={{ margin: 0 }}>
          Deposit, withdrawal, and customer transfer — all via Rust posting
        </p>
      </div>

      <div className="nav-row">
        {(
          [
            ["deposit", "Deposit", <IconCash key="d" />],
            ["withdraw", "Withdrawal", <IconTransfers key="w" />],
            ["transfer", "Transfer", <IconTransfers key="t" />],
          ] as const
        ).map(([id, label, icon]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? "nav-link active" : "nav-link"}
            onClick={() => {
              setTab(id);
              setError(null);
              setOk(null);
            }}
          >
            <span className="nav-link-icon">{icon}</span>
            <span className="nav-link-label">{label}</span>
          </button>
        ))}
      </div>

      <form className="card stack" onSubmit={(e) => void handleSubmit(e)}>
        <label>
          Reference *
          <input required value={reference} onChange={(e) => setReference(e.target.value)} />
        </label>
        <div className="row">
          <label style={{ flex: 1 }}>
            Amount *
            <input
              required
              value={amount}
              placeholder="0.00"
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label style={{ minWidth: 120 }}>
            Currency *
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
          <>
            <label>
              Customer wallet *
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
            <label>
              Cash wallet (till/vault) *
              <select
                required
                value={cashWalletId}
                onChange={(e) => setCashWalletId(e.target.value)}
              >
                {cashWallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.type})
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <>
            <label>
              Sender customer *
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
              Receiver customer *
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
          Description
          <input value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>

        {error ? <p className="error">{error}</p> : null}
        {ok ? <p className="ok">{ok}</p> : null}
        <button type="submit" disabled={busy}>
          {busy ? "Posting…" : "Post"}
        </button>
      </form>
    </div>
  );
}
