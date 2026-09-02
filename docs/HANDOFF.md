# Saraf — Developer Handoff Document

**Audience:** Next AI agent / developer continuing this codebase  
**Product:** Offline Sarafi (money exchange) Management System for Windows  
**Handoff date:** 2026-08-17  
**Do not treat this file as source of truth over code** — verify against the repo when unsure.

**Related:** `docs/ROADMAP.md`, `docs/DECISIONS.md`, `AGENTS.md`

---

## 1. Current architecture

**Primary product runtime (ADR-042):** Vite React SPA (`desktop-ui/`) + Tauri 2 + **rusqlite** (native SQLite). Live DB: `%APPDATA%\com.saraf.desktop\saraf.db`.

| Layer | Status |
|---|---|
| Desktop UI (`desktop-ui/`) | **Active** — React Router SPA |
| Tauri + rusqlite commands | **Active** — sole money/data path for desk |
| SQL migrations in `src-tauri/migrations/` | **Active** (+ `ensure_*` repair in `migrate.rs`) |
| Next.js + Prisma | **Legacy / seed tooling only** — not the default desk runtime |
| Next sidecar (`SARAF_LEGACY=1`) | Opt-in only |

**Default login (seed):** `admin` / `ChangeMe123!`

**UI skin:** `DESKTOP_UI_SKIN = "liquid-glass"` in `desktop-ui/src/ui-skin.ts` (preview theme). Set to `""` to restore the solid skin.

**Sticky chrome:** `.app-chrome` holds **nav + Quick Actions only**. The old top Saraf banner (brand mark, user/role, Online chip) was **removed** from the desk layout (`desktop-ui/src/layout.tsx`). Login / license screens still show the Saraf mark.

```text
Tauri WebView
  → Vite React SPA (desktop-ui/)
    → invoke("command_name")  (@desktop/api.ts)
      → src-tauri/src/commands/*.rs
        → rusqlite → saraf.db
          → post_transaction (ledger) for all money writes
```

### Key paths

| Area | Path |
|---|---|
| SPA pages | `desktop-ui/src/pages/` |
| Shared form modals | `desktop-ui/src/components/*-form-modal.tsx` |
| Persistent quick actions | `desktop-ui/src/components/quick-actions-bar.tsx` |
| API wrappers | `desktop-ui/src/api.ts` |
| Nav + sticky chrome | `desktop-ui/src/layout.tsx` |
| Styles | `desktop-ui/src/styles.css` (+ `styles-liquid-glass.css`) |
| Accessibility prefs | `desktop-ui/src/ui-text-prefs.tsx` |
| i18n | `src/lib/i18n/messages/{en,fa,ps}.ts` + `desktop-ui/src/i18n.tsx` |
| Commands | `src-tauri/src/commands/` |
| Ledger | `src-tauri/src/ledger/` |
| Schema repair | `src-tauri/src/migrate.rs` |
| Permissions | `src-tauri/permissions/saraf.toml` |
| Migrations | `src-tauri/migrations/` |
| Business-data wipe | `scripts/wipe-business-data.mjs` |

### SPA nav (desk)

Dashboard · Daily Book · **Cash** · Vaults · Customers · **Debtors & Creditors** · Hawala · Partners · Trading · Transactions · Expenses · Employees · Reports · Owner Capital · Rates · Calculator · Settings

Cash is a **live nav item** (`/cash`) — Main Vault balances by currency. Dashboard still shows cash cards and links to `/cash`.

**Transactions** (`/transactions`) is still in nav and still implemented. Removing it from navigation is a **future UX decision**, not done.

---

## 2. How to start the desktop app

Vite SPA listens on **127.0.0.1:1421** (`dev:spa`).

```bash
npm install
npm run tauri -- dev
# equivalent: npm run dev
```

On **Windows PowerShell**, if `npm.ps1` is blocked by execution policy, use the cmd shim:

```powershell
npm.cmd run tauri -- dev
```

Git Bash can use `npm run tauri -- dev` normally.

Other useful scripts:

```bash
npm run dev:spa          # Vite only
npm run typecheck:spa    # desktop-ui TypeScript
npm run build:desktop    # SPA + Tauri NSIS
```

On Windows, if `cargo` / `vswhom-sys` fails with exit **259**, kill leftover `saraf.exe` / locked build processes and retry.

After **Rust command** changes, restart the Tauri process so commands reload. Vite HMR covers most SPA-only CSS/TSX edits.

---

## 3. Database / demo-data reset

```bash
node scripts/wipe-business-data.mjs
# optional: node scripts/wipe-business-data.mjs "C:\path\to\saraf.db"
```

Default DB: `%APPDATA%\com.saraf.desktop\saraf.db`

**Keeps:** schema/migrations, admin user, Currency (+ denominations), SystemSetting, Main Vault, SYSTEM wallets, AccountNumberSequence (reset so next customer = **#2**).

**Deletes:** customers, CUSTOMER / PARTNER / BANK wallets, extra VAULT/TILL rows (not Main Vault / Cash Till), `WalletCurrencyBalance` cache, all ledger/transactions/business-day/hawala/exchange/trading/employee data, PartnerSarafi, non-admin users, sessions, audit log.

After wipe: Main Vault account number = **#1**; next allocated number = **#2**. Does **not** delete migration files or change posting architecture.

---

## 4. Financial / accounting invariants

Do not change these unless product explicitly redesigns accounting.

1. **`post_transaction`** (Rust ledger) is the **only** financial write entry point.
2. Balances are **derived** from `LedgerEntry` (SUM debit − credit). Never store a second source of truth. `WalletCurrencyBalance` is a **cache**, wiped with the ledger.
3. Soft-delete money via `Transaction.deletedAt` — do not hard-delete ledger rows.
4. Offline-first: no cloud APIs for core money ops.
5. **Shop cash = Main Vault only** (ADR-044). SYSTEM wallets (Hawala Clearing, Exchange Difference, Opening Equity, …) are accounting contras — not cash drawers.
6. **Unified account numbers** (ADR-045): Main Vault = **#1**; customers = **#2, #3…** auto-allocated, never edited, never reused.
7. **Money vouchers:** Deposit / Withdraw / Transfer / Exchange / Hawala modals post through the ledger; edit via soft-delete + re-post (`replaceTransactionId`).
8. **Main Vault Cash In/Out** (ADR-046) on `/vaults`; customer balances may go **negative** (customer owes Sarafi).
9. Daily Journal / Customer History **running balances are display/reporting values**. They must reuse ledger SUM — never invent a parallel posting system.

### Vault opening cash vs customer opening balances

These are **separate posts**. Do not mix them.

| Action | What it does | Contra |
|---|---|---|
| **Vault Cash In / Out** (`post_main_vault_cash_move`) | Moves **physical shop cash** in Main Vault. Not a customer transaction. | Opening Equity |
| **Customer Opening Kata** (`post_opening_kata_line` in `customers_write.rs`) | Records the customer’s **starting claim** (GIVE = shop holds for customer; TAKE = customer owes). **Does not touch Main Vault.** | Opening Equity |

Live deposits/withdrawals in `movements.rs` still move **both** the customer wallet and Main Vault.

### Ledger convention (cash asset)

| Direction on VAULT/TILL | Meaning |
|---|---|
| DEBIT | Money into that vault/till |
| CREDIT | Money out of that vault/till |

---

## 5. Completed features (current desk)

### Daily Journal (`/daybook`) — primary detailed activity view

- **The journal table is the detailed source of truth** for what happened that day (not a generic Deposit/Withdrawal list).
- Date picker: **today, yesterday, and older calendar dates**. Filters: currency, search. Server-side **pagination**.
- Columns: Row · Date · Account # · Account Name · Opposite Account · Description · Debit · Credit · **Balance** · Currency.
- **Detailed descriptions** stored on `Transaction.description` (examples: “Opening customer balance”, “rahmat deposited 1000 USD to his account by karim (Phone: …)”, “… — debt repayment”). Fallback copy only when description is empty (`daybook_description` in `daybook.rs`).
- **Running Balance (completed):** per **row account** (wallet × currency), after that entry. Independent per currency. Opening = ledger SUM **before** the selected business day; pagination applies same-day prefix nets before the page, then walks the page. Positive = Sarafi green (`money-in`); zero = neutral; negative = red (`money-out`) with unicode minus `−`. Header is not colored. Backend field: `DaybookJournalLine.balanceAfter`.
- **Layout:** compact Account # and Opposite Account (ellipsis + `title` tooltip); recovered space goes to Description and Balance.
- Print/CSV include Balance. Context menu still supports print / edit / delete for desk movements.
- Optional “more details” sections (cash position, etc.) remain below the journal.

### Customer History (`/customers/:id`)

- **Completed:** prefers stored `Transaction.description` (`ledger_history_description` in `transactions.rs`) so wording matches Daily Journal.
- **Completed:** **Balance** column (`balanceAfter`) with opening-before-date + full chronological walk so pagination/type filters stay correct. Debit/credit/balance use `.amount-emphasis`.

### Customer debt-repayment descriptions

When a **deposit** is posted against a **negative** customer balance, Rust stores e.g. `{name} deposited {amt} {ccy} — debt repayment` (`deposit_debt_repayment_description` in `movements.rs`). UI prefers the stored description.

### Debtors & Creditors (`/debtors-creditors`)

Read-only, ledger/cache-derived (`list_debtors_creditors`).

- Request **lifecycle/race protection:** `cancelled` flag on the list `useEffect`.
- Currencies loaded once; list fetch is **one** `listDebtorsCreditors` call per tab/filter/page (debounced search).
- **Server-side pagination** remains (page size 50).
- **Debtors ordered by `b.balance ASC`** (most negative first), not `ABS(balance) DESC`. Comment in `debtors_creditors.rs`: equivalent ranking for negatives, index-friendly.
- Backend **can** return **both** debtor and creditor totals in **one** aggregate when `includeTotals: true`.
- **Current SPA list load uses `includeTotals: false`** (cheap COUNT for pagination only). The Debtors page **does not currently display** combined side totals. Debtors amounts show a leading minus and `.amount-emphasis` + `money-out`.

### Profit & Loss (`/reports?r=profit-loss`)

Quick period filters: **Today · Yesterday · This Week · This Month · This Year · Custom**.

**Income currently included** (`get_profit_loss_report`):

- Exchange profit
- Trading sell gross profit
- Hawala **own commission**

**Expenses currently included:** employee salary payments + SYSTEM expense-like wallets (name match: expense/rent/salary/utility/transport/office).

**Not included:** transfer fees / service fees — there is **no** fee posting in `get_profit_loss_report`. Do not document them as income unless code is added.

Reports Center also includes Overview, Daily, Monthly, Cash Flow, Hawala, Exchange, Customer Statement, Transactions, **Partners**, **Debtors**.

### Accessibility (Settings → General)

- **Text size:** small / default / large / extra-large (`app.ui.fontSize`).
- **Bold text:** `app.ui.boldText`.
- Applied via `data-font-size` / `data-bold-text` on `html`. Layout rem baseline stays fixed so padding does not explode with text size.

### Typography / color (display only)

- **Debtors & Creditors** and **Cash:** `.amount-emphasis` on money cells.
- **Owner Capital:** “Customer money Sarafi holds” = green (`money-in`); “Money customers owe Sarafi” = red (`money-out`) with a **display minus** (`formatCustomersOweDisplay`). Totals/posting unchanged.

### Desk UX polish (2026-08-17)

- Global **vertical density** via spacing tokens in `styles.css` (`--space-*`, `--shell-pad-*`). Stacks, cards, filters, tables, modals tightened; not cramped.
- Hidden main scrollbar (`.app-frame` clip) unchanged in intent.

### Persistent Quick Actions

Second bar under nav on **every** screen (`quick-actions-bar.tsx`): Deposit, Withdraw, Transfer, Exchange, Send/Receive Hawala, Add customer. Dispatches `desk:movement-saved`.

### Dashboard

Overview stats + business cash cards. **No** activity table — Daily Journal owns detailed activity.

### Other implemented modules

| Module | Route / notes |
|---|---|
| Owner Capital | `/capital` — ledger-derived; invest/withdraw; ownership recon |
| Vaults | `/vaults` — Main Vault Cash In/Out / history (ADR-046) |
| Hawala | Form modal (send/receive, FX, WhatsApp templates) |
| Exchange | Desk modal; P/L summary; rates page `/rates` |
| Trading | `/trading/*` |
| Partners | `/partners` |
| Employees | `/employees` |
| Expenses | `/expenses` |
| Calculator | `/calculator` |
| Settings | locale, business name, accessibility, users/rights |

---

## 6. In progress / pending (do not mark done)

| Item | Status |
|---|---|
| Global developer footer `Developed by Rahmat & Samsoor · © 2026` + configured phone numbers | **Not in the codebase** |
| Remove **Transactions** from primary nav | **Not done** — page still exists; future UX decision |
| P&L transfer / service fees | **Not implemented** |
| Debtors page showing both-side totals in the UI | API supports it; **SPA currently skips totals** (`includeTotals: false`) |
| Dedicated Vault report readers | Optional / not started |
| Persist daybook page-size preference | Not persisted |

Daily Journal running balance and Customer History running balance are **completed**, not pending.

---

## 7. Verification / build status

| Check | Notes |
|---|---|
| `npm run typecheck:spa` | Passing as of 2026-08-17 (desktop-ui). |
| `cargo check` (src-tauri) | Builds; existing dead-code / unused-assignment **warnings** in `daybook.rs`, `exchange.rs`, `vaults.rs`, `util.rs` — not blockers. |
| Rust command edits | Require Tauri restart, not Vite HMR. |

---

## 8. Known issues / pitfalls

1. **`User.deletedAt` does not exist** — never filter User that way (`list_users_lite`).
2. Windows **file lock / exit 259** on `vswhom-sys` when `saraf.exe` or cargo leftover holds build artifacts.
3. Bare `ALTER TABLE` in migrations may fail if columns already exist; rely on `ensure_column` repair.
4. Do not invent a second cash/balance store for vaults, journal, or customer history.
5. Next/Prisma paths are **not** the desk product; extend `desktop-ui` + `src-tauri` unless asked for legacy.
6. Hidden main scrollbar uses `.app-frame` clipping — do not “fix” by re-showing scrollbars unless product asks; nested `.table-scroll` may still scroll.
7. After editing Hawala/Exchange via replace, listen to `DESK_MOVEMENT_SAVED_EVENT` so daybook/dashboard stay in sync.
8. **PowerShell execution policy** can block `npm.ps1` — use `npm.cmd` (see §2).
9. Older handoff text said Cash was removed from nav and Daily Journal had **no Balance column** — both are **obsolete**. Cash is in nav; journal Balance is implemented.

---

## 9. Next recommended tasks

1. If product wants it: add the global developer footer + phone numbers (currently missing).
2. Decide whether to **hide Transactions** from nav (do not delete the page until product confirms).
3. Optionally show Debtors/Creditors **totals** using the existing `includeTotals` payload without a second request.
4. P&L: only add transfer/service fees if posting those fees exists and product wants them in income.
5. Optional dedicated Vault report readers; stronger vault RBAC.
6. Business Day close: surface vault closing counts in the existing close flow (do not add a second closing system).
7. Expand i18n coverage; deeper posting/hawala/exchange integration tests.
8. Retire Prisma/Next packaging when unused.

---

## 10. Concept map (operators)

| Concept | Meaning |
|---|---|
| **Main Vault** | The **only** physical shop cash wallet (`Wallet.type = VAULT`, name `Main Vault`). Account number **#1**. Cash In/Out on `/vaults`. Overview on `/cash` and Dashboard. |
| **Account number** | Unified sequence (ADR-045): Main Vault #1, customers #2+. Auto-assigned; never edited or reused. |
| **SYSTEM wallets** | Hidden accounting accounts. **Not** cash drawers; never offered in “which wallet?” pickers. |
| **Customer wallet** | Per-customer multi-currency account. Positive = Sarafi holds; negative = customer owes; zero = settled. |
| **Daybook / Daily Journal** | Primary detailed activity for a selected date: one row per business transaction (primary party), Opposite Account, human descriptions, per-account running Balance. |
| **Quick Actions** | Always-visible bar under nav for common money ops. |
| **Business Day** | Open / operate / reconcile / close control for a calendar day. |
| **Accounting / Ledger** | Financial source of truth (`Transaction` + `LedgerEntry`). |
| **Reports** | Read-only historical analysis (Reports Center). |

**One-PC shop rule (ADR-044):** One physical PC and one physical cash box. Operators never choose Cash Till vs Vault. Forms auto-post shop cash to **Main Vault**.

---

## 11. Vault Management

> `/vaults` is Main Vault only: Cash In, Cash Out, Cash History, and link to detail. Creating extra vaults is blocked; consolidation deactivates non–Main Vault VAULT/TILL wallets.

### Product rules

- Shop cash for new posts is always **Main Vault** (`resolve_shop_cash_wallet_id` / `ensure_main_vault` in `src-tauri/src/ledger/main_vault.rs`).
- Vault balances = ledger balances on that wallet.
- Startup repair: `ensure_single_main_vault_cash` in `migrate.rs` consolidates other VAULT/TILL into Main Vault (does **not** touch SYSTEM wallets or delete ledger history).
- Closed Business Day blocks normal vault moves / edits / deletes (admin correction path required later).

### Schema

Migration: `src-tauri/migrations/20260808120000_vault_management.sql`  
Repair: `ensure_vault_management_schema` in `migrate.rs`

| Object | Role |
|---|---|
| `Wallet` extras | `code`, `location`, `description`, `notes` (+ existing `userId` = responsible user) |
| `CurrencyDenomination` | Configurable note values per currency |
| `VaultReconciliation` + `VaultReconciliationLine` | Physical count vs expected |

### Rust commands (`src-tauri/src/commands/vaults.rs`)

| Command | Purpose |
|---|---|
| `get_vault_dashboard` | Stats + vault cards |
| `upsert_vault` / `archive_vault` | Create/edit/deactivate |
| `get_vault_detail` | Per-currency opening / in / out / expected |
| `transfer_between_vaults` | Move cash (double-entry, `VT-` ref) |
| `list_vault_movements` | History |
| `update_vault_movement` / `delete_vault_movement` | Edit or soft-delete transfer |
| `post_main_vault_cash_move` | Cash In/Out vs Opening Equity |
| `reconcile_vault` | Draft/confirm physical counts |
| `list_currency_denominations` | Denom config |
| `list_users_lite` | Responsible-user picker (**User has no `deletedAt`**) |
| `list_vault_audit` | AuditLog module `VAULT` |

Older `transfer_cash_between_vaults` in `reports.rs` still exists; prefer `transfer_between_vaults` for Vault UI.

### SPA

| Route | UI |
|---|---|
| `/cash` | Main Vault balances by currency (condition + amounts) |
| `/vaults` | Main Vault: Cash In / Cash Out / history; detail link |
| `/vaults/:id` | Tabs: Overview, Balances, Transactions, Transfers, Reconciliation, Count cash, Audit |

Prefer “Move cash”, “Money added/out” — not debit/credit jargon on Vault screens.

---

## 12. Reports Center

**Route:** `/reports` (hub) · `/reports?r=<id>`  
**UI:** `desktop-ui/src/pages/reports.tsx`  
**Backend:** `src-tauri/src/commands/reports.rs` (read-only)  
**No ledger writes** from this screen.

| `r=` id | Title |
|---|---|
| `overview` | Overview |
| `daily` | Daily |
| `monthly` | Monthly |
| `cash-flow` | Cash Flow |
| `profit-loss` | Profit & Loss (period presets — see §5) |
| `hawala` | Hawala |
| `exchange` | Exchange |
| `customer-statement` | Customer Statement |
| `transactions` | Transactions Report |
| `partners` | Partner balances |
| `debtors` | Debtors & Creditors snapshot |

**Green** = money in · **Red** = money out · **Neutral** = information. Colors mean **direction**, not good/bad. Clickable rows open transaction (or hawala) detail. Print + CSV where wired.

---

## 13. Database (native)

Migrations live under `src-tauri/migrations/`. On boot, Rust applies pending SQL and runs `ensure_schema_compat` repairs.

### Important tables

- `Wallet` (`VAULT` / `TILL` / `CUSTOMER` / `SYSTEM` / `PARTNER` / `BANK`) + unified `accountNumber` where applicable
- `Transaction` + `LedgerEntry` (money truth); soft-delete via `deletedAt`
- `WalletCurrencyBalance` (derived cache)
- `BusinessDay` + `BusinessDayCashCount`
- `CurrencyDenomination`, `VaultReconciliation`, `VaultReconciliationLine`
- `Employee` (+ salary payments)
- `AuditLog`
- `User` — **no `deletedAt`** (`isActive` only)
- `SystemSetting` — locale, business name, `app.ui.fontSize`, `app.ui.boldText`

---

## 14. Quick pointers for the next agent

1. Read **ADR-042** / **ADR-043** / **ADR-044** / **ADR-045** / **ADR-046** in `docs/DECISIONS.md`.
2. Default work: `desktop-ui/` + `src-tauri/src/commands/` + migrations.
3. Never bypass `post_transaction` for money.
4. Shop cash = **Main Vault only**; Hawala Clearing / Exchange Difference remain hidden SYSTEM accounts.
5. Account numbers: Main Vault **#1**, customers **#2+**. Wipe via `node scripts/wipe-business-data.mjs`.
6. Seed login: `admin` / `ChangeMe123!`.
7. Desk shortcuts belong in `QuickActionsBar`.
8. Detailed activity belongs on **Daily Journal**, not Dashboard.
9. Journal/Customer History balances are **reporting** — reuse ledger SUM.

---

## 15. Historical note (pre–ADR-042)

Older sections of this handoff (through ~2026-07-28) described the **Next.js App Router + Prisma + Server Actions** stack. That work informed domain rules (posting-only writes, soft archive, RBAC) but **the shipping desk UI is the native SPA**. Prefer this document and `desktop-ui/` / `src-tauri/` over any Next-era path lists.

Handoff text from 2026-08-11 that described Daily Book “Recent activity” as a separate table, **no Balance column**, and Cash removed from nav is **superseded**.

---

*End of handoff.*
