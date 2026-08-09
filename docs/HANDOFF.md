# Saraf — Developer Handoff Document

**Audience:** Next AI agent / developer continuing this codebase  
**Product:** Offline Sarafi (money exchange) Management System for Windows  
**Handoff date:** 2026-08-09 (Reports Center)  
**Do not treat this file as source of truth over code** — verify against the repo when unsure.

**Related:** `docs/ROADMAP.md`, `docs/DECISIONS.md`, `AGENTS.md`

---

## 1. Current project status

**Primary product runtime (ADR-042):** Vite React SPA (`desktop-ui/`) + Tauri 2 + **rusqlite** (native SQLite). Live DB: `%APPDATA%\com.saraf.desktop\saraf.db`.

| Layer | Status |
|---|---|
| Desktop UI (`desktop-ui/`) | **Active** — React Router SPA |
| Tauri + rusqlite commands | **Active** — sole money/data path for desk |
| SQL migrations in `src-tauri/migrations/` | **Active** (+ `ensure_*` repair in `migrate.rs`) |
| Next.js + Prisma | **Legacy / seed tooling only** — not the default desk runtime |
| Next sidecar (`SARAF_LEGACY=1`) | Opt-in only |

**Default login (seed):** `admin` / `ChangeMe123!`

```bash
npm install
npm run dev            # Tauri + Vite SPA on 127.0.0.1:1420 (default)
# npm run dev:spa      # Vite only
# npm run typecheck:spa
# npm run build:desktop
```

On Windows, if `cargo` / `vswhom-sys` fails with exit **259**, kill leftover `saraf.exe` / locked build processes and retry.

---

## 2. Architecture (current)

```text
Tauri WebView
  → Vite React SPA (desktop-ui/)
    → invoke("command_name")  (@desktop/api.ts)
      → src-tauri/src/commands/*.rs
        → rusqlite → saraf.db
          → post_transaction (ledger) for all money writes
```

### Non-negotiable rules
1. **`post_transaction`** (Rust ledger) is the **only** financial write entry point.
2. Balances are **derived** from `LedgerEntry` (SUM debit − credit). Never store parallel balance tables.
3. Soft-delete money via `Transaction.deletedAt` — do not hard-delete ledger rows.
4. Offline-first: no cloud APIs for core money ops.
5. **Cash ≠ Vault** (see §4).

### Key paths
| Area | Path |
|---|---|
| SPA pages | `desktop-ui/src/pages/` |
| API wrappers | `desktop-ui/src/api.ts` |
| Nav | `desktop-ui/src/layout.tsx` |
| i18n | `src/lib/i18n/messages/{en,fa,ps}.ts` + `types.ts` |
| Commands | `src-tauri/src/commands/` |
| Ledger | `src-tauri/src/ledger/` |
| Schema repair | `src-tauri/src/migrate.rs` |
| Permissions | `src-tauri/permissions/saraf.toml` |
| Migrations | `src-tauri/migrations/` |

### SPA nav (desk)
Dashboard · **Cash** · **Vaults** · Customers · Transfers (movements) · Exchange · Hawala · Partners · Trading · Owner Capital · Daily Book · Reports · Transactions · Rates · Settings

---

## 3. Concept map (operators)

| Concept | Meaning |
|---|---|
| **Cash** | Overall monetary balances of the business (ledger SUM of VAULT+TILL). |
| **Vault** | Physical safe / storage location (`Wallet.type = VAULT`). |
| **Till** | Cashier drawer / desk cash box (`Wallet.type = TILL`). |
| **Daybook / Kata** | Chronological daily transaction list for a business date. |
| **Business Day** | Open / operate / reconcile / close control for a calendar day. |
| **Accounting / Ledger** | Financial source of truth (`Transaction` + `LedgerEntry`). |
| **Reports** | Read-only historical analysis (Reports Center). |

**Vault vs Till (simple):**
- **Vault** = locked safe / main box (large holdings).
- **Till** = cashier working cash at the desk.
- Moving cash Vault ↔ Till changes **location only**, not profit, revenue, expense, or total business cash.

---

## 4. Vault Management (2026-08-08)

### Product rules
- Vault is **not** a duplicate of Cash.
- Vault balances = ledger balances on that wallet.
- Vault↔vault / vault↔till transfers are `TRANSFER` posts (double-entry); refs like `VT-…`.
- Closed Business Day blocks normal vault moves / edits / deletes (admin correction path required later).

### Schema
Migration: `src-tauri/migrations/20260808120000_vault_management.sql`  
Repair: `ensure_vault_management_schema` in `migrate.rs`

| Object | Role |
|---|---|
| `Wallet` extras | `code`, `location`, `description`, `notes` (+ existing `userId` = responsible user) |
| `CurrencyDenomination` | Configurable note values per currency (seed USD/AFN when empty) |
| `VaultReconciliation` + `VaultReconciliationLine` | Physical count vs expected; difference reason + audit |

### Rust commands (`src-tauri/src/commands/vaults.rs`)
| Command | Purpose |
|---|---|
| `get_vault_dashboard` | Stats + vault cards |
| `upsert_vault` / `archive_vault` | Create/edit/deactivate (no cash left to deactivate) |
| `get_vault_detail` | Per-currency opening / in / out / expected |
| `transfer_between_vaults` | Move cash (double-entry, `VT-` ref) |
| `list_vault_movements` | History |
| `update_vault_movement` / `delete_vault_movement` | Edit amount/reason or soft-delete transfer |
| `reconcile_vault` | Draft/confirm physical counts |
| `list_currency_denominations` | Denom config (+ seed) |
| `list_users_lite` | Responsible-user picker (**User has no `deletedAt`** — filter `isActive` only) |
| `list_vault_audit` | AuditLog module `VAULT` |

Also: older `transfer_cash_between_vaults` in `reports.rs` still exists; prefer `transfer_between_vaults` for Vault UI.

### SPA
| Route | UI |
|---|---|
| `/vaults` | Dashboard cards; **New vault** / **Move cash** center modals; **Move cash history** with Edit/Delete |
| `/vaults/:id` | Tabs: Overview, Balances, Transactions, Transfers, Reconciliation, Count cash, Audit |

### Integrations
- **Daybook:** VT-/CASH-XFER transfers labeled module **Vault**; filter `vault`; detail links to `/vaults/:id`.
- **Reports Center:** Period / cash-flow / transaction reports include vault-related `TRANSFER` activity from ledger history (no separate vault report module yet).
- **Cashier UX:** CASHIER/TELLER roles only see vaults assigned to them (`Wallet.userId`).

### UX language
Prefer “Move cash”, “Money added/out” — not debit/credit ledger jargon in the Vault screens.

---

## 5. Reports Center (2026-08-09)

**Route:** `/reports` (hub) · `/reports?r=<id>` (individual report)  
**UI:** `desktop-ui/src/pages/reports.tsx`  
**Backend:** `src-tauri/src/commands/reports.rs` (read-only SQL over ledger history)  
**API:** `desktop-ui/src/api.ts` report helpers  

Reports are a **professional financial record** view — not a generic analytics dashboard. All figures come from real `Transaction` / `LedgerEntry` history (plus related tables such as `HawalaTransfer`, `ExchangeDeal`). **No ledger writes** from this screen.

### Eight reports

| `r=` id | Title | What it shows |
|---|---|---|
| `overview` | Overview | Period totals: money in/out/net, hawala, exchanges, activity counts, balances by currency |
| `daily` | Daily | One business date: opening / in / out / closing by currency, activity, full day transaction list |
| `monthly` | Monthly | Calendar month summary + per-day breakdown (click a day → Daily) |
| `cash-flow` | Cash Flow | Money in/out/net by currency and by transaction type |
| `hawala` | Hawala | Filtered hawala list + sent/received totals (click → `/hawala/:id`) |
| `exchange` | Exchange | Filtered FX deals with historical deal/board rates (click → transaction detail) |
| `customer-statement` | Customer Statement | Customer + date range + currency: opening, every line, money in/out, running & closing balance |
| `transactions` | Transactions Report | Searchable ledger of posts (customer, date, currency, type, amount, reference, status) |

### UX rules
- **Green** = money coming in · **Red** = money going out · **Neutral** = information (balances, rates, counts, transfers/exchange detail). Colors mean **direction only**, not good/bad.
- Filters sit in a clear bar at the top; important totals sit directly under filters.
- Tables are ledger-style: what / when / customer / currency / amount / reference / result (status).
- **Clickable rows** open full transaction detail (`get_transaction_detail` modal), except hawala rows which open the hawala detail route.
- Print + CSV export where wired; data is never mocked.

### Commands (examples)
`get_reports_overview`, `get_daily_report`, `get_monthly_report`, `get_cash_flow_report`, `get_hawala_status_report`, `get_exchange_period_report`, `get_customer_statement_report`, `get_transactions_report`, `get_transaction_detail`

---

## 6. Other recent modules (native SPA)

| Module | Route / notes |
|---|---|
| Owner Capital | `/capital` — ledger-derived net position; invest/withdraw |
| Reports Center | `/reports` — eight historical reports; ADR-043 |
| Daybook + Business Day | `/daybook` — open/close day, cash counts, timeline |
| Exchange P/L | `ExchangeDeal` + `get_exchange_pnl_summary`; deal/board rate |
| Trading | `/trading/*` — own inventory FX |
| Partner Sarafis | `/partners` |
| Hawala desk | Single Notes field in SPA; commission columns repaired in migrate |

---

## 7. Database (native)

Migrations live under `src-tauri/migrations/` (including Prisma-era history). On boot, Rust applies pending SQL and runs `ensure_schema_compat` repairs for stamped-but-missing columns/tables.

### Important tables for Vault
- `Wallet` (`VAULT` / `TILL` / `CUSTOMER` / `SYSTEM`)
- `Transaction` + `LedgerEntry` (money truth)
- `BusinessDay` + `BusinessDayCashCount`
- `CurrencyDenomination`, `VaultReconciliation`, `VaultReconciliationLine`
- `AuditLog` (activity; module `VAULT` for vault ops)
- `User` — **no `deletedAt`** column (`isActive` only)

### Ledger convention (cash asset)
| Direction on VAULT/TILL | Meaning |
|---|---|
| DEBIT | Money into that vault/till |
| CREDIT | Money out of that vault/till |

Vault transfer: CREDIT from-wallet + DEBIT to-wallet, same currency, same amount.

---

## 8. Known pitfalls

1. **`User.deletedAt` does not exist** — never filter User that way (`list_users_lite` fixed 2026-08-08).
2. Windows **file lock / exit 259** on `vswhom-sys` when `saraf.exe` or cargo leftover holds build artifacts.
3. Bare `ALTER TABLE` in migrations may fail if columns already exist; rely on `ensure_column` repair.
4. Do not invent a second cash balance store for vaults.
5. Next/Prisma paths are **not** the desk product; extend `desktop-ui` + `src-tauri` unless asked for legacy.
6. Pre-existing SPA typecheck noise may exist in partners pages (`t.*.phone`) — unrelated to Vault.

---

## 9. Next steps (suggested)

1. Optional dedicated Vault report readers (movement / reconciliation / difference / cashier vault) if operators need filters beyond period/cash-flow/transactions.
2. Stronger RBAC for vault permissions (view/create/transfer/reconcile/close) beyond cashier assignment filter.
3. Business Day close: surface vault closing counts inside the existing close flow (do not add a second closing system).
4. Auto-assign vault/till when customer deposit/withdrawal/exchange/hawala posts cash (single source of truth for physical location).
5. Retire Prisma/Next packaging when unused.

---

## 10. Quick pointers for the next agent

1. Read **ADR-042** / **ADR-043** in `docs/DECISIONS.md` and `AGENTS.md` (Next docs under `node_modules/next/dist/docs/` only if touching Next).
2. Default work: `desktop-ui/` + `src-tauri/src/commands/` + migrations.
3. Never bypass `post_transaction` for money.
4. Cash = money totals; Vault/Till = physical location; Daybook = daily list; Business Day = day control; Reports = read-only history.
5. Seed login: `admin` / `ChangeMe123!`.
6. After Rust command changes, restart `npm run dev` so Tauri reloads commands + migrations.

---

## 11. Historical note (pre–ADR-042)

Older sections of this handoff (through ~2026-07-28) described the **Next.js App Router + Prisma + Server Actions** stack, Days 1–16, and production hardening on that path. That work informed domain rules (posting-only writes, soft archive, RBAC catalog ideas) but **the shipping desk UI is now the native SPA**. Prefer this document’s §1–10 and the code under `desktop-ui/` / `src-tauri/` over any Next-era path lists.

---

*End of handoff.*
