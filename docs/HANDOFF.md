# Saraf — Developer Handoff Document

**Audience:** Next AI agent / developer continuing this codebase  
**Product:** Offline Sarafi (money exchange) Management System for Windows  
**Handoff date:** 2026-07-27 (Users + RBAC)  
**Do not treat this file as source of truth over code** — verify against the repo when unsure.

**Related:** `docs/ROADMAP.md`, `docs/DECISIONS.md`

---

## 1. Current project status

Greenfield offline-first desktop app. **Day 10 Hawala**, **UX polish**, **Day 11** (currencies / rates / Settings), and **Currency Exchange** are on `main`. **UI simplification**, **Business Cash Overview**, **Customer Transfer**, **Dashboard**, **Reports**, **Audit Log**, **Role & permission enforcement**, and **User Management** are in the working tree (**uncommitted** — see §19–§23).

| Layer | Status |
|---|---|
| Next.js App Router + TypeScript + Tailwind v4 + shadcn/ui | Done |
| Tauri shell scaffold | Done (Rust may still be needed locally for desktop builds) |
| Prisma 7 + SQLite (LibSQL adapter) | Done |
| Feature-first folders | Done (backup placeholder remains) |
| App shell + navigation | Done (role-filtered) |
| Design system tokens / primitives | Done |
| Auth (users, sessions, login, guards, logout UI) | Done (**committed**) |
| **Role & permission enforcement** | **Done** (uncommitted — ADR-030) |
| Financial Prisma models + repos + ledger domain + seed | Done |
| **Customer management** | **Done** (**committed**) |
| **Wallet management** | **Done** (admin under Settings; hidden from primary nav) |
| **Transactions / posting engine** | **Done** (**committed**) |
| **Customer history** | **Done** (**committed**) |
| **Hawala (Day 10)** | **Done** (**committed**) |
| Clickable list-row navigation | **Done** (**committed**) |
| Location catalog (country/city selects) | **Done** (**committed**) |
| **Currencies (Day 11)** | **Done** (**committed** — `/settings/currencies`) |
| **Exchange rates (Day 11)** | **Done** (**committed** — `/settings/exchange-rates`) |
| **Settings / app prefs (Day 11)** | **Done** (**committed** — `/settings`) |
| **Currency Exchange** | **Done** (**committed** — `/exchange`) |
| **UI simplification (wallet-free ops UX)** | **Done** (uncommitted — see §19) |
| **Business Cash Overview** | **Done** (uncommitted — `/cash`) |
| **Customer Transfer** | **Done** (uncommitted — `/transfers`) |
| **Dashboard** | **Done** (uncommitted — `/`) |
| **Reports** | **Done** (uncommitted — `/reports` + drill-in routes) |
| **Audit Log** | **Done** (uncommitted — `/audit` + detail; see §22) |
| **User Management** | **Done** (uncommitted — `/users`; see §23) |

**Runtime model:** Tauri window → local Next.js server → Server Actions / server code → Prisma → SQLite file. No cloud APIs.

**Default login (after seed):**
- Username: `admin`
- Password: `ChangeMe123!`

```bash
npm install
cp .env.example .env   # if needed
npx prisma migrate deploy
npm run db:seed
npm run dev            # web
# npm run dev:desktop  # needs Rust/Tauri
```

---

## 2. Completed features (through Users + RBAC)

### Foundation
- Next.js 16 App Router, TypeScript strict, Tailwind 4, ESLint + Prettier
- shadcn/ui (base-nova): button, card, table, input, textarea, select, checkbox, label, dialog, field, tooltip, scroll-area, separator
- Design system: CSS tokens (light/dark), typography, form layout helpers, `ThemeProvider` / `ThemeToggle`
- Zod for customer, wallet, transaction, hawala, currency, exchange-rate, settings, transfer, and **user** form validation
- Tauri v2 under `src-tauri/` (`com.saraf.app`)
- Scripts: `dev`, `dev:desktop`, `build`, `build:desktop`, `db:*`, `lint`, `format`, `typecheck`

### UX shell
- Desktop shell: dark sidebar, header, main content panel
- Real UI: **Dashboard**, **Cash**, **Customers**, **Transactions**, **Transfers**, **Exchange**, **Hawala**, **Reports**, **Audit Logs**, **Users**, **Settings** (+ Currencies, Exchange Rates, **Wallets** under System)
- Placeholder: Backup & Restore
- Login at `/login`
- Shared **`ClickableTableRow`** for list → detail navigation
- **Wallets removed from primary sidebar** — admin maintenance at `/settings/wallets` (`/wallets` redirects)
- **Sidebar nav role-filtered** via `filterNavForRole` (ADR-030)

### Authentication (committed) + RBAC (working tree)
- `User` + `Session`; bcrypt (12 rounds); session cookie `saraf_session` (12h, SHA-256 hash in DB)
- `loginAction` / `logoutAction` / `getCurrentUserAction`
- Guards: `(app)` → `requireAuth()`; `(auth)` → `requireGuest()`
- Header: username + role + Logout
- **`requirePermission` enforces `rolePermissions`** → unauthorized → `forbidden()` (403; `authInterrupts`)
- Shared helpers: `hashPassword`, `revokeUserSessions`, `hasPermission`, password policy constants
- Roles: **ADMIN** (full), **MANAGER** (ops + reports/audit/settings), **CASHIER** (desk ops only)
- `wallets.manage` = ADMIN/MANAGER only (Settings wallet admin; not cashier)

### User Management (working tree)
- `/users` — Admin only (`users.manage`)
- List + Add / Edit / Reset Password / Activate–Deactivate dialogs (currencies-style UI)
- Username immutable after create; password never audited
- Safety: no self role-change / self-deactivate; cannot remove last active admin
- Deactivate + password reset revoke target user’s sessions
- Audited: `user.create` / `user.update` / `user.set_active` / `user.reset_password`

### Customer management
- `/customers` list: empty/loading, search (`?q=`), archive filter (`?status=archived`), pagination-ready
- **Row-click →** `/customers/[id]` (Edit actions stay isolated)
- Add / Edit shared `CustomerForm` + Server Actions + Zod
- **Codes auto-generated** on create (`1001`, `1002`, …); no manual code field; edit never mutates code
- Labels: `formatCustomerLabel` (`CODE — Name`) in dropdowns / related screens
- `/customers/[id]` profile:
  1. **Customer Information**
  2. **Current Balances** (per currency, ledger-derived; no wallet picker)
  3. **Customer History** timeline
- Soft archive only (`deletedAt` + `isActive=false`); phone/code/notes preserved
- Active phone uniqueness via partial DB indexes

### Wallet management (admin / system)
- Architecture, tables, services, repositories **retained**
- UI moved to **Settings → System → Wallets** (`/settings/wallets`)
- Primary nav no longer lists Wallets; `/wallets` → redirect
- Soft archive only; **no balances on wallet list**
- Seeded descriptions (display-only): Main Vault, Cash Till, Exchange Difference, Hawala Clearing
- Day-to-day operators use **Business Cash Overview** + customer balances instead of inspecting wallets

### Transactions / posting
- **`postTransaction`** — sole financial write entry point (**unchanged by UI simplification**)
- Deposit / Withdrawal / Manual Adjustment (services + actions + shared form)
- **Deposit / Withdrawal forms hide wallet selection** — resolve customer + cash (Cash Till / Main Vault) in the UI layer, then call existing actions
- Manual Adjustment still exposes debit/credit wallet picks (operator tool)
- `/transactions` list + `/transactions/[id]` detail + printable receipt (`window.print`)
- Public barrels do not export low-level create APIs for Transaction/LedgerEntry

### Customer history
- Read-only `getCustomerHistory` (ledger-line events + transaction metadata)
- Timeline UI with URL filters (date, type, currency, ref), sort, pagination
- Detail via existing `/transactions/[id]?returnTo=…`

### Hawala (Day 10 + party / location UX)
- Domain: send / receive / complete / cancel
- Money only via `postHawalaMovement` → `postTransaction` (`type: HAWALA`) — **posting service not modified**
- Status: `PENDING` → `COMPLETED` | `CANCELLED`
- UI: `/hawala` list + search + Send/Receive dialogs; `/hawala/[id]` detail; **row-click → detail**
- **Cash / clearing wallet selects hidden** — UI resolves Cash Till + Hawala Clearing automatically
- **Sender / receiver:** Existing local customer **or** External person (not registered)
- **Corridor:** country + city **dropdowns only** (`src/lib/locations`)
- Cancel: domain + Server Action ready; **no Cancel button in UI yet**

### Currencies / Exchange rates / Settings (Day 11)
- `/settings/currencies`, `/settings/exchange-rates`, `/settings` shop prefs
- Settings catalog + **System** section (Wallets)

### Currency Exchange
- Desk UI `src/features/exchange/` + `exchangeFunds` → `postTransaction` (`type: EXCHANGE`)
- **From/To wallet selects hidden** — resolve customer’s CUSTOMER wallet automatically
- Rates from Settings; inactive deal-rate snapshots on ledger lines
- UI: `/exchange` + `/exchange/[id]`

### Business Cash Overview
- `/cash` (primary nav **Cash**)
- Available company cash by currency from active **VAULT** + **TILL** wallets
- Derived via shared `deriveCurrencyBalancesForWallets` → `createBalanceCalculator` (not stored)

### Customer Transfer
- Desk UI `src/features/transfers/` + `transferFunds` → `postTransaction` (`type: TRANSFER`)
- Form: sender, receiver, currency, amount, reference, notes — **no wallet fields**
- `transferFunds` resolves each party’s sole active CUSTOMER wallet; rejects insufficient sender balance
- Ledger: CREDIT sender wallet, DEBIT receiver wallet (same currency)
- UI: `/transfers` form + history (`?q=`); `/transfers/[id]` detail reuses `getTransactionDetail`
- Action: `createTransferAction` → `transferFunds` only (never posts from UI)

### Dashboard (read-only)
- `/` — `getDashboardStats` composes existing readers only (no posting / no ledger writes)
- Summary cards: today’s transactions / exchanges / hawala; active customers
- Business cash tiles: `getBusinessCashBalances` (VAULT + TILL)
- Recent activity table → existing `/transactions/[id]?returnTo=/`
- Quick Actions: links to existing desks (deposit/withdrawal → `/transactions`, exchange, hawala, transfers)
- ADR-027

### Reports (read-only)
- Hub `/reports` — `getReportsPageData`; sections: daily, monthly (or filtered activity), customer statement, hawala, exchange, transfers
- URL filters (customer-history style): `from`, `to`, `customerId`, `currency`, `type`, `operator`
- Drill-in list pages reuse existing tables: `/reports/transactions`, `/hawala`, `/exchange`, `/transfers`, `/customer-statement`
- Entity detail via existing pages with `returnTo` (Hawala detail now supports `returnTo`)
- No file export yet; never posts money
- ADR-028

### Audit Log (activity history — not ledger)
- Append-only `AuditLog` table; writers: `recordAuditEvent` / `auditAction` (never throw; never write `LedgerEntry`)
- Instrumented Server Actions: login/logout, customers, deposits/withdrawals/adjustments/exchange/transfers, hawala, app settings
- `/audit` list: search + date/user/module/action filters; SQL pagination
- `/audit/[id]` detail: event fields + readable before/after values
- ADR-029

---

## 3. Current architecture

### Runtime
```text
Tauri (desktop shell)
  → local Next.js App Router
    → Server Actions / server-only services
      → Prisma 7 + @prisma/adapter-libsql
        → SQLite (local file)
```

### Module layout
```text
src/features/<name>/
  components/   # UI
  domain/       # types, errors, pure rules
  schemas/      # Zod
  services/     # use-cases
  repositories/ # Prisma only
  actions/      # thin Server Actions
  index.ts      # public barrel
```

Active feature modules: `auth`, `customers`, `wallets`, `transactions`, `transfers`, `exchange`, `hawala`, `ledger` (domain + repos), `currencies`, `exchange-rates`, `settings`, `cash-overview`, `dashboard`, `reports`, `audit`. Placeholders: `backup`, `users`.

### Current architecture rules (non-negotiable)
1. **`postTransaction` is the ONLY component allowed to create financial postings.**
2. Every future money feature must reuse it — never duplicate posting logic or write `LedgerEntry` directly from features.
3. The ledger (`LedgerEntry`) is the source of truth for financial history.
4. Wallet balances are derived; do not add/remove balance storage unless explicitly required.
5. Every posting must balance per currency before commit.
6. Execute each financial post inside a single `prisma.$transaction()`.
7. Append-only ledger — never permanently delete financial records.
8. Extend the existing architecture; do not refactor completed modules unless fixing a bug or satisfying an explicit requirement.
9. Offline-first: no cloud auth / APIs for core money operations.
10. Soft archive for customers/wallets; do not hard-delete financial entities.
11. **Normal money-movement UX must not ask operators to pick internal wallets** — resolve wallets in the UI/feature layer, keep posting APIs wallet-aware.
12. **Audit Log is activity history only** — never derive balances from it; never write ledger rows from audit.

---

## 4. Database models

**Provider:** SQLite via Prisma 7 (`prisma-client` → `src/generated/prisma`)  
**Config:** `prisma.config.ts` (`DATABASE_URL`, seed `tsx prisma/seed.ts`)  
**Adapter:** `@prisma/adapter-libsql` + `@libsql/client`

### Auth
| Model | Notes |
|---|---|
| `User` | cuid; Role `ADMIN\|MANAGER\|CASHIER`; soft-deactivate via `isActive` |
| `Session` | tokenHash unique; expiresAt; revokedAt; Cascade on User |

### Financial
| Model | Notes |
|---|---|
| `Currency` | uuid; unique code; soft delete |
| `ExchangeRate` | base/quote → Currency; Decimal rate; soft delete |
| `Customer` | uuid; optional `code` (auto on create from 1001), phone/address/nationalId/notes; soft archive |
| `Wallet` | `VAULT\|TILL\|CUSTOMER\|SYSTEM`; optional customerId; soft delete; **no balance column** |
| `Transaction` | unique reference; type/status enums; valueDate; postedAt; createdById; soft delete |
| `LedgerEntry` | **append-only** (no updatedAt/deletedAt); DEBIT\|CREDIT; amount Decimal |
| `SystemSetting` | key/value |
| `HawalaTransfer` | SEND\|RECEIVE; PENDING\|COMPLETED\|CANCELLED; cash + clearing; optional party customer ids; optional linked Transaction |
| `AuditLog` | **append-only** activity history (separate from ledger); userId?, action, module, entityType/Id, ipAddress, before/after Json |

### Enums
- `TransactionType`: `EXCHANGE`, `DEPOSIT`, `WITHDRAWAL`, `TRANSFER`, `HAWALA`, `ADJUSTMENT`
- `TransactionStatus`: `DRAFT`, `POSTED`, `VOIDED`
- `HawalaDirection`: `SEND`, `RECEIVE`
- `HawalaStatus`: `PENDING`, `COMPLETED`, `CANCELLED`

### Migrations (applied locally)
1. `20260725111115_init_users`
2. `20260725111743_add_sessions`
3. `20260725115950_add_financial_models`
4. `20260725120422_add_system_settings`
5. `20260725120925_harden_financial_schema`
6. `20260725121140_db_layer_indexes`
7. `20260726030000_add_customer_profile_fields`
8. `20260726040000_customer_archive_preserve_uniques`
9. `20260726090000_add_hawala_transfers`
10. `20260726095000_hawala_party_customers`
11. `20260727153000_add_audit_logs`

### Seed highlights
- Admin: `admin` / `ChangeMe123!`
- Currencies: AFN, USD, PKR, EUR (no rates seeded)
- Settings: `app.name=Saraf`, `app.baseCurrencyCode=AFN`, `app.locale=en`
- Wallets: Main Vault, Cash Till, Exchange Difference, **Hawala Clearing** (SYSTEM)

---

## 5. Financial flow (UI → ledger)

```text
UI (dialog / form)  — operator picks customer(s)/currency/amount/ref/notes
  → UI/feature layer resolves internal wallet IDs
       (customer wallet, Cash Till, Hawala Clearing, …)
       OR transferFunds resolves sender/receiver CUSTOMER wallets
  → Server Action (`requirePermission` + Zod)
    → Domain movement service
         depositFunds / withdrawFunds / adjustFunds / exchangeFunds / transferFunds
         OR sendHawala / receiveHawala / completeHawala
              → postHawalaMovement (builds balanced HAWALA legs only)
      → postTransaction          ← ONLY financial write entry point
           → prisma.$transaction {
                create Transaction (status POSTED, postedAt)
                createMany LedgerEntry (assertLedgerBalanced per currency)
              }
```

### Ledger conventions (asset: debit +, credit −)
| Movement | Legs |
|---|---|
| Deposit | DEBIT customer wallet, CREDIT cash (vault/till) |
| Withdrawal | CREDIT customer wallet, DEBIT cash |
| Adjustment | explicit DEBIT wallet + CREDIT wallet |
| Exchange | CREDIT fromWallet/fromCcy, DEBIT toWallet/toCcy; Exchange Difference balances each currency |
| Transfer | CREDIT sender customer wallet, DEBIT receiver customer wallet (same currency) |
| Hawala SEND | DEBIT cash, CREDIT Hawala Clearing |
| Hawala RECEIVE | DEBIT Hawala Clearing, CREDIT cash |

### Integrity
- Only `postTransaction` calls `tx.ledgerEntry.createMany`.
- Hawala / Exchange / Transfer / deposit / withdraw do **not** bypass the ledger.
- UI simplification **does not** change posting or ledger domain — only how wallet IDs are obtained before actions.
- Cancel hawala is status-only; it does not reverse ledger rows.

### Read paths (not writers)
- Customer balances → `getCustomerCurrencyBalances` → `deriveCurrencyBalancesForWallets` → `createBalanceCalculator`
- Business cash → `getBusinessCashBalances` (VAULT + TILL) → same derive helper
- Customer history → `getCustomerHistory`
- Transaction / hawala / exchange / transfer detail → `getTransactionDetail` (transfer wraps it)

---

## 6. Services created (high-signal)

### Wallets (`src/features/wallets/services/`)
`create-wallet`, `update-wallet`, `archive-wallet`, `list-wallets`, `get-wallet`, `get-customer-wallets`, **`derive-currency-balances`**, **`get-business-cash-balances`**

### Transactions (`src/features/transactions/services/`)
| Service | Role |
|---|---|
| `post-transaction` | **Sole financial writer** |
| `deposit` / `withdraw` / `adjust` / `exchange` / `transfer` | Build legs → post |
| `list-transactions` / `get-transaction-detail` / `get-customer-history` | Reads |

### Transfers (`src/features/transfers/`)
Desk UI + reads: form options, history list, detail (wraps `getTransactionDetail`)

### UI wallet resolution (not posting)
- `src/features/wallets/domain/resolve-form-wallets.ts` — `resolveCustomerWalletId`, `resolveCashWalletId`, `resolveHawalaClearingWalletId`
- Transfer resolves CUSTOMER wallets inside `transferFunds` (not the form)

---

## 7. Folder structure (high level)

```text
saraf/
├── docs/
├── prisma/
├── src/
│   ├── app/(app)/             # cash, customers, transactions, transfers, exchange, hawala, settings/…
│   ├── app/(auth)/login/
│   ├── components/layout|ui/
│   ├── design-system/
│   ├── features/              # …, transfers, cash-overview, wallets, transactions, …
│   ├── server/db/
│   ├── generated/prisma/
│   └── lib/
├── src-tauri/
└── package.json
```

---

## 8. Important files

| Area | Paths |
|---|---|
| Posting | `src/features/transactions/services/post-transaction.ts` |
| Transfer service | `src/features/transactions/services/transfer.ts` |
| Transfer UI | `src/features/transfers/` · `/transfers` · `/transfers/[id]` |
| UI wallet resolve | `src/features/wallets/domain/resolve-form-wallets.ts` |
| Currency balances | `src/features/wallets/services/derive-currency-balances.ts` |
| Business cash | `src/features/wallets/services/get-business-cash-balances.ts` · `/cash` |
| Customer profile | `src/features/customers/components/customer-profile.tsx` |
| Wallet admin UI | `/settings/wallets` (redirect from `/wallets`) |
| Nav | `src/components/layout/nav-config.ts` |
| Docs | `docs/HANDOFF.md`, `docs/ROADMAP.md`, `docs/DECISIONS.md` |

---

## 9. Known issues

1. **Uncommitted money UX + transfers + Dashboard + Reports + Audit Log** — see §19–§22; do not commit `prisma/dev.db*` WAL/SHM.
2. **Tauri production build** — static export conflicts with Prisma/Server Actions; sidecar architecture not implemented.
3. **Rust may be missing** — `dev:desktop` / `build:desktop` need rustup.
4. **`argon2` still in package.json** while auth/seed use **bcrypt**.
5. **ID style split** — User/Session `cuid()`; financial models `uuid()` (AuditLog uses uuid).
6. ~~Permission stub~~ — **Done (ADR-030):** catalog enforced; role-filtered nav; 403 via `forbidden()`.
7. **Placeholder page** — backup only (Users implemented — §23).
8. **SQLite `@db.Decimal(p,s)` unsupported** — enforce scale in services (posting does).
9. **Hawala cancel UI** not wired (Server Action exists; cancel is audited when used).
10. **Seed Hawala Clearing / Exchange Difference** — run `npm run db:seed` on existing DBs after pull.
11. **Receipt** is browser `window.print` only — no Tauri printer SDK.
12. **Create-then-post hawala** can leave `PENDING` if post fails (recover via complete/cancel).
13. **Older customers** created before auto-codes may still have `code = null`.
14. **Exchange rate snapshots** (`transaction-snapshot*`) appear as inactive rows if Settings list includes inactive — optional filter later.
15. **Multiple CUSTOMER wallets per customer** — UI resolution errors (no picker); keep one wallet per customer for normal ops.
16. **Manual Adjustment** still shows wallet selectors (intentional operator escape hatch).
17. **Currency / exchange-rate / wallet settings mutations** are not yet wired to `auditAction` (app settings + money/customer/auth/hawala are).

---

## 10. Technical debt

| Item | Notes |
|---|---|
| Uncommitted money UX + transfers + dashboard + reports + audit + RBAC + users | Commit remaining working tree + migration `add_audit_logs` + docs; exclude `prisma/dev.db*` |
| Low-level ledger/transaction create helpers | Unused; keep unused or eventually remove/gate |
| Dual currency repositories | `features/currencies` CRUD vs `features/ledger` readers |
| No void/reversal | Completed movements cannot be financially undone yet |
| No integration tests | Auth, posting balance, hawala, exchange, cash overview, transfers, dashboard, reports |
| No CI smoke | lint + typecheck + migrate + seed |
| i18n / RTL | Not started |
| Pagination | Often in-memory after full fetch (exchange + transfer history; some report aggregations) |
| Report export | Not implemented (PDF/CSV later) |
| FX gain/loss report | Substrate exists (Exchange Difference wallet); dedicated P&L report not built |

---

## 11. Next steps

See `docs/ROADMAP.md`. Immediate order:

1. **Commit** UI simplification + Business Cash Overview + Customer Transfer + Dashboard + Reports + Audit Log + **RBAC + Users** + docs (+ migration `20260727153000_add_audit_logs`). Exclude `prisma/dev.db*`.
2. Optional: hawala Cancel UI / receipt; wire currency/rate/wallet settings mutations to `auditAction`.
3. Later: backup, Tauri packaging, void/reversal, report export / FX P&L, i18n/RTL.

**Do not** bypass `postTransaction` for any money movement.  
**Do not** store balances on wallets/customers.  
**Do not** hard-delete users (deactivate with `isActive`).  
**Do not** treat Audit Log rows as financial truth (ledger remains source of truth).

---

## 12. Git status (at handoff)

```text
Branch: main
HEAD:   68d04a3 feat(exchange): add currency exchange desk with rate snapshots

Committed (includes Currency Exchange + Day 11 + Day 10):
  - feat(exchange): currency exchange desk with rate snapshots
  - feat(settings): currencies, exchange rates, app preferences
  - Day 10 / hawala + UX polish + auth + financial DB

Uncommitted (UI simplification + Customer Transfer + Dashboard + Reports + Audit Log + RBAC + Users — see §19–§23):
  - Hide wallet selection on deposit/withdrawal/exchange/hawala forms
  - Customer profile Current Balances (currency tiles)
  - Business Cash Overview (/cash)
  - Wallets moved to Settings → System; removed from primary nav
  - resolve-form-wallets + derive-currency-balances helpers
  - Customer Transfer: transferFunds + createTransferAction + /transfers desk
  - Dashboard: getDashboardStats + / page
  - Reports: getReportsPageData + filters + drill-in routes
  - Audit Log: AuditLog model + recordAuditEvent/auditAction + /audit list/detail/filters
  - Server Action instrumentation (auth, customers, transactions, hawala, settings, users)
  - Role enforcement: requirePermission + role-filtered nav + forbidden 403
  - User Management: /users CRUD, reset password, activate/deactivate
  - docs/HANDOFF.md, docs/ROADMAP.md, docs/DECISIONS.md
  - prisma/migrations/20260727153000_add_audit_logs

Unchanged vs HEAD (posting / ledger domain):
  - src/features/transactions/services/post-transaction.ts
  - src/features/ledger/**

Do not commit:
  prisma/dev.db, prisma/dev.db-shm, prisma/dev.db-wal
  .env, src/generated/
```

---

## 13. Last completed task

**Audit Log (2026-07-27):**
- Append-only `AuditLog` model (separate from `LedgerEntry`) + migration
- Reusable `recordAuditEvent` / `auditAction` (failures never block business ops)
- Instrumented: login/logout, customers, deposits/withdrawals/adjustments/exchange/transfers, hawala, app settings
- Read-only `/audit` list (filters + pagination) + `/audit/[id]` detail (before/after values)
- `tsc --noEmit` — pass; ESLint on audit paths — pass
- Docs updated (ADR-029)

---

## 14–18. Historical summaries

Day 10 Hawala, UX polish, Day 11 Settings, and Currency Exchange are on `main` (see git log / prior sections in earlier handoffs). Key invariant: money writes only through `postTransaction`. Audit Log is activity history only — never balances or money truth.

---

## 19. UI simplification review (2026-07-26)

### Delivered
| Area | Change |
|---|---|
| Deposit / Withdrawal | No wallet fields; resolve customer + Cash Till |
| Currency Exchange | No from/to wallet fields; resolve customer wallet |
| Hawala | No cash/clearing fields; resolve Cash Till + Hawala Clearing |
| Customer profile | Information → Current Balances → History |
| Business Cash | `/cash` — VAULT+TILL balances by currency |
| Wallet admin | Settings → System → Wallets; off primary nav |

### Verification
| Check | Result |
|---|---|
| No normal txn form asks for wallets | **Pass** — deposit/withdrawal/exchange/hawala; adjustment still has wallet picks |
| Customer balances visible | **Pass** — `CustomerBalancesSection` + `getCustomerCurrencyBalances` |
| Business Cash page works | **Pass** — `/cash` + `getBusinessCashBalances` |
| Wallet architecture internal | **Pass** — tables/services/repos retained; admin UI under Settings |
| Posting Service only write path | **Pass** — features still call deposit/withdraw/exchange/hawala → `postTransaction` |
| Ledger logic unchanged | **Pass** — no `src/features/ledger/**` diffs vs HEAD |
| `post-transaction.ts` unchanged | **Pass** — no diff vs HEAD this session |
| `npm run typecheck` | **Pass** |
| `npm run lint` | **Pass** |

---

## 20. Customer Transfer review (2026-07-27)

### Delivered
| Area | Change |
|---|---|
| Service | `transferFunds` builds CREDIT/DEBIT legs → `postTransaction` |
| Action | `createTransferAction` (`transactions.manage`) |
| Form | `/transfers` — sender, receiver, currency, amount, reference, notes |
| History | Search, empty/loading, pagination-ready table |
| Detail | `/transfers/[id]` — parties + amount; related txn + ledger from `getTransactionDetail` |
| Nav | Primary **Transfers** |

### Verification
| Check | Result |
|---|---|
| Customer Transfers work | **Pass** — form → action → `transferFunds` → `postTransaction` |
| Transfer History works | **Pass** — `getTransferHistory` + table/search |
| Transfer Detail works | **Pass** — `getTransferDetail` wraps transaction detail |
| Customer balances update correctly | **Pass** — ledger-derived; no stored balance writes |
| Posting Service reused everywhere | **Pass** — only write path for transfer money |
| No wallet pickers | **Pass** — wallets resolved in `transferFunds` |
| `npm run typecheck` | **Pass** |
| `npm run lint` | **Pass** |
| UI matches design system | **Pass** — same patterns as Exchange desk |

### Exact next step
1. **Commit** UI simplification + cash overview + Customer Transfer + Dashboard + Reports + Audit Log + RBAC + Users + docs (exclude `prisma/dev.db*`).

---

## 21. Dashboard + Reports review (2026-07-27)

### Dashboard delivered
| Area | Change |
|---|---|
| Service | `getDashboardStats` — today’s type counts, customer counts, business cash, recent txns |
| UI | `/` — summary cards, business cash, recent activity, quick-action links |
| Writes | None — compose `listTransactionTypes`, `getTransactionList`, `countCustomers`, `getBusinessCashBalances` |

### Reports delivered
| Area | Change |
|---|---|
| Hub | `/reports` — daily/monthly (or filtered activity), statement, hawala, exchange, transfers |
| Filters | URL: `from`, `to`, `customerId`, `currency`, `type`, `operator` |
| Drill-in | `/reports/transactions\|hawala\|exchange\|transfers\|customer-statement` reuse existing tables |
| Entity detail | Existing `/transactions/[id]`, `/hawala/[id]`, `/exchange/[id]`, `/transfers/[id]`, customer profile |
| Writes | None — never call `postTransaction` or write `LedgerEntry` |
| Export | Not implemented |

### Verification
| Check | Result |
|---|---|
| Dashboard works | **Pass** — `/` → `getDashboardStats` → `DashboardView` |
| Summary cards work | **Pass** — today counts + active customers |
| Business Cash works | **Pass** — same `getBusinessCashBalances` as `/cash` |
| Reports work | **Pass** — hub sections + empty/loading states |
| Filters work | **Pass** — Apply/Clear URL filters drive all sections |
| Detail pages work | **Pass** — drill-in lists + existing entity details + `returnTo` |
| No TypeScript errors | **Pass** — `npm run typecheck` |
| No ESLint errors | **Pass** — `npm run lint` |
| UI matches design system | **Pass** — Typography, ring cards, tables, outline buttons |
| Read-only / no posting | **Pass** — no financial writes from dashboard/reports |

### Exact next step
1. **Commit** remaining working-tree money UX + Dashboard + Reports + Audit Log + RBAC + Users + docs (exclude `prisma/dev.db*`).

---

## 22. Audit Log review (2026-07-27)

### Delivered
| Area | Change |
|---|---|
| Model | Append-only `AuditLog` (uuid); indexes on createdAt / userId / module / action |
| Write API | `recordAuditEvent` + `auditAction` (IP helper); never throws; never writes ledger |
| Instrumentation | Auth login/logout; customer create/update/archive; deposit/withdrawal/adjustment/exchange/transfer; hawala send/receive/cancel; settings update; **user create/update/set_active/reset_password** |
| List | `/audit` — search + date/user/module/action filters; SQL where + skip/take; empty/loading |
| Detail | `/audit/[id]` — event info + readable before/after values; `returnTo` back nav |
| Permission | `audit.view` **enforced** for ADMIN/MANAGER (ADR-030) |

### Verification
| Check | Result |
|---|---|
| Audit records created correctly | **Pass** — single `auditAction` after successful mutations (login failure also logged) |
| Filters work | **Pass** — URL `from`/`to`/`user`/`module`/`action`/`q`/`page`; indexed equality + date range |
| Detail pages work | **Pass** — `getAuditLogDetail` + `AuditDetailView` + not-found |
| Login/logout audited | **Pass** — success, failure, logout |
| Financial actions audited | **Pass** — deposit, withdrawal, adjustment, exchange, transfer, hawala |
| Customer actions audited | **Pass** — create, update, archive |
| Settings changes audited | **Pass** — `updateAppSettingsAction` |
| Failures never block business ops | **Pass** — try/catch in `recordAuditEvent` + `auditAction` |
| No duplicate logging | **Pass** — action-layer only; services do not double-write |
| Audit ≠ ledger | **Pass** — separate table; no `LedgerEntry` from audit feature |
| No TypeScript errors | **Pass** — `tsc --noEmit` |
| No ESLint errors | **Pass** — audit + instrumented action paths |
| UI matches design system | **Pass** — reports-style filters, table chrome, InfoRow detail |

### Exact next step
1. **Commit** working-tree features including Audit Log + RBAC + Users + migration + docs (exclude `prisma/dev.db*`).

---

## 23. Users + RBAC review (2026-07-27)

### RBAC delivered
| Area | Change |
|---|---|
| Gate | `requirePermission` checks `rolePermissions` then `forbidden()` |
| Config | `experimental.authInterrupts` + `src/app/forbidden.tsx` |
| Nav | `filterNavForRole` in `AppShell` from live `user.role` |
| Pages | Layouts/gates: reports, audit, settings, users, backup, cash; `/wallets` → settings |
| Catalog | Cashier desk ops; Manager + reports/audit/settings; Admin + users/backup; `wallets.manage` Admin/Manager only |

### Users delivered
| Area | Change |
|---|---|
| Feature | `src/features/users/` — list, create, edit, reset password, activate/deactivate |
| Page | `/users` + loading skeleton; `users.manage` (ADMIN) |
| Auth reuse | `hashPassword`, `revokeUserSessions`, bcrypt 12 |
| Safety | No self role/status change; no last-admin demote/deactivate; sessions revoked on deactivate/reset |
| Audit | `user.*` actions; no password/hash in snapshots |

### Verification
| Check | Result |
|---|---|
| User CRUD works | **Pass** — create/update/list via actions + Zod + repository |
| Password reset works | **Pass** — `resetUserPasswordRecord` + session revoke + audit |
| Activation/Deactivation works | **Pass** — `setUserActiveRecord` + session revoke + guards |
| Role enforcement works | **Pass** — catalog + `requirePermission` + page layouts |
| Navigation matches permissions | **Pass** — sidebar filtered per role |
| Unauthorized access blocked | **Pass** — 403 `forbidden()` / login redirect |
| `npm run typecheck` | **Pass** |
| `npm run lint` | **Pass** |
| UI matches design system | **Pass** — currencies-style table/dialogs |

### Exact next step
1. **Commit** remaining working tree including Users + RBAC + docs (exclude `prisma/dev.db*`).

---

## Quick pointers for the next agent

1. **Commit** uncommitted money UX + transfers + dashboard + reports + audit + RBAC + users + docs (exclude DB WAL/SHM).  
2. Never invent cloud auth or bypass **`postTransaction`**.  
3. Prefer extending `features/*` over new top-level packages.  
4. Do not modify posting/ledger unless a bug requires it.  
5. Read `docs/DECISIONS.md` (ADR-014, ADR-024–031) before financial/UX/auth work.  
6. Soft-deactivate users with `isActive`; never hard-delete.  
7. Audit Log is activity history only — never use it for balances or money truth.

---

*End of handoff.*
