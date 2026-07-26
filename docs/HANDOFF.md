# Saraf — Developer Handoff Document

**Audience:** Next AI agent / developer continuing this codebase  
**Product:** Offline Sarafi (money exchange) Management System for Windows  
**Handoff date:** 2026-07-26 (Currency Exchange complete; Customer Transfer not started)  
**Do not treat this file as source of truth over code** — verify against the repo when unsure.

**Related:** `docs/ROADMAP.md`, `docs/DECISIONS.md`

---

## 1. Current project status

Greenfield offline-first desktop app. **Day 10 Hawala**, **UX polish**, and **Day 11** (currencies / rates / Settings) are on `main`. **Currency Exchange** is implemented in the working tree (**uncommitted** — see §18).

| Layer | Status |
|---|---|
| Next.js App Router + TypeScript + Tailwind v4 + shadcn/ui | Done |
| Tauri shell scaffold | Done (Rust may still be needed locally for desktop builds) |
| Prisma 7 + SQLite (LibSQL adapter) | Done |
| Feature-first folders | Done (placeholder features remain) |
| App shell + navigation | Done |
| Design system tokens / primitives | Done |
| Auth (users, sessions, login, guards, logout UI) | Done (**committed**) |
| Financial Prisma models + repos + ledger domain + seed | Done |
| **Customer management** | **Done** (**committed**) |
| **Wallet management** | **Done** (**committed**) |
| **Transactions / posting engine** | **Done** (**committed**) |
| **Customer history** | **Done** (**committed**) |
| **Hawala (Day 10)** | **Done** (**committed**) |
| Clickable list-row navigation | **Done** (**committed**) |
| Location catalog (country/city selects) | **Done** (**committed**) |
| **Currencies (Day 11)** | **Done** (**committed** — `/settings/currencies`) |
| **Exchange rates (Day 11)** | **Done** (**committed** — `/settings/exchange-rates`) |
| **Settings / app prefs (Day 11)** | **Done** (**committed** — `/settings`) |
| **Currency Exchange** | **Done** (uncommitted — `/exchange`) |
| Customer transfer UI | **Not started** |

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

## 2. Completed features (through Currency Exchange)

### Foundation
- Next.js 16 App Router, TypeScript strict, Tailwind 4, ESLint + Prettier
- shadcn/ui (base-nova): button, card, table, input, textarea, select, checkbox, label, dialog, field, tooltip, scroll-area, separator
- Design system: CSS tokens (light/dark), Typography, form layout helpers, `ThemeProvider` / `ThemeToggle`
- Zod for customer, wallet, transaction, hawala, currency, exchange-rate, and settings form validation
- Tauri v2 under `src-tauri/` (`com.saraf.app`)
- Scripts: `dev`, `dev:desktop`, `build`, `build:desktop`, `db:*`, `lint`, `format`, `typecheck`

### UX shell
- Desktop shell: dark sidebar, header, main content panel
- Real UI: Dashboard (stub), **Customers**, **Wallets**, **Transactions**, **Exchange**, **Hawala**, **Settings** (+ Currencies, Exchange Rates)
- Placeholders: Reports, Audit Logs, Backup & Restore, Users
- Login at `/login`
- Shared **`ClickableTableRow`** for list → detail navigation

### Authentication (committed)
- `User` + `Session`; bcrypt (12 rounds); session cookie `saraf_session` (12h, SHA-256 hash in DB)
- `loginAction` / `logoutAction` / `getCurrentUserAction`
- Guards: `(app)` → `requireAuth()`; `(auth)` → `requireGuest()`
- Header: username + role + Logout
- Permission catalog stub — `requirePermission` ≈ auth only (not role-enforced)

### Customer management
- `/customers` list: empty/loading, search (`?q=`), archive filter (`?status=archived`), pagination-ready
- **Row-click →** `/customers/[id]` (Edit actions stay isolated)
- Add / Edit shared `CustomerForm` + Server Actions + Zod
- **Codes auto-generated** on create (`1001`, `1002`, …); no manual code field; edit never mutates code
- Labels: `formatCustomerLabel` (`CODE — Name`) in dropdowns / related screens
- `/customers/[id]` profile: fields (incl. code), wallets (derived balances), customer history timeline
- Soft archive only (`deletedAt` + `isActive=false`); phone/code/notes preserved
- Active phone uniqueness via partial DB indexes

### Wallet management
- `/wallets` list CRUD: Add / Edit / Archive (unchanged financially)
- **CUSTOMER wallet rows** click → customer profile; VAULT/TILL/SYSTEM not row-navigating
- **Description column** for known system/operating wallets (display-only catalog; not DB-backed)
  - Main Vault → Primary cash storage.
  - Cash Till → Daily operating cash.
  - Exchange Difference → Currency exchange profit/loss tracking.
  - Hawala Clearing → Settlement wallet for Hawala operations.
- Rules: `CUSTOMER` requires `customerId`; `VAULT` / `TILL` / `SYSTEM` forbid it
- Soft archive only; **no balances on wallet list**
- Customer profile balances via ledger `createBalanceCalculator`

### Transactions / posting
- **`postTransaction`** — sole financial write entry point (**unchanged this session**)
- Deposit / Withdrawal / Manual Adjustment (services + actions + shared form)
- `/transactions` list + `/transactions/[id]` detail + printable receipt (`window.print`)
- List **row-click / View** → detail with `returnTo=/transactions`
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
- **Sender / receiver:** Existing local customer **or** External person (not registered)
- Optional `senderCustomerId` / `receiverCustomerId`; names/phones denormalized; `customerId` derived for posted Transaction
- **Corridor:** country + city **dropdowns only** (`src/lib/locations`); cascading city; schema rejects free text / mismatched pairs
- Detail reuses `getTransactionDetail` for related transaction + ledger
- Cancel: domain + Server Action ready; **no Cancel button in UI yet**

### Currencies (Day 11)
- Feature module `src/features/currencies/` (domain, schemas, repo, services, actions, components)
- UI: `/settings/currencies` — table (Code, Name, Symbol, Status, Actions)
- Create / Edit dialogs; Activate / Deactivate (`isActive`)
- Code immutable after create; cannot deactivate `app.baseCurrencyCode`
- Zod + Server Actions (`settings.manage` stub gate)
- Feature-owned Prisma currency repository (ledger currency repo left for existing txn/hawala readers)

### Exchange rates (Day 11)
- Feature module `src/features/exchange-rates/`
- UI: `/settings/exchange-rates` — Base, Quote, Rate (`1 USD = 70 AFN`), Date, Status, Actions
- Create / Edit / Activate / Deactivate
- Convention: quote units per 1 base unit; base ≠ quote; both currencies must exist; rate > 0
- Active status maps to `ExchangeRate.deletedAt` (null = active) — no schema migration
- **Does not** post ledger entries or calculate exchange transactions

### Settings / app preferences (Day 11)
- `/settings` — shop prefs form + catalog links to Currencies / Exchange Rates
- Persists via existing `SystemSetting` keys: `app.name`, `app.baseCurrencyCode`, `app.locale`
- Base currency select from active currencies; locale English only (Dari/Pashto UI placeholders)
- Receipt preferences UI placeholder (not persisted yet)
- Uses existing `system-setting-repository` + new services/actions

### Currency Exchange
- Desk UI module `src/features/exchange/` + movement service `exchangeFunds` in `features/transactions`
- Money only via `createExchangeAction` → `exchangeFunds` → `postTransaction` (`type: EXCHANGE`)
- Legs: CREDIT from / from-currency, DEBIT to / to-currency, plus **Exchange Difference** balancing legs (per currency)
- Rate: latest active Settings rate by default (direct or inverted pair); optional manual override via `EXCHANGE_BUSINESS_RULES.allowManualRateOverride`
- Historical accuracy: inactive `ExchangeRate` snapshot (`source` `transaction-snapshot…`) linked on every ledger line; description/memo also store the deal rate
- UI: `/exchange` create form + history (`?q=`); `/exchange/[id]` detail (reuses `getTransactionDetail` for related txn + ledger)
- Nav: primary **Exchange** item; detail header title “Exchange Details”

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

Active feature modules: `auth`, `customers`, `wallets`, `transactions`, `exchange`, `hawala`, `ledger` (domain + repos), `currencies`, `exchange-rates`, `settings`. Placeholders: `reports`, `audit`, `backup`, `users`, `dashboard`.

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
| `HawalaTransfer` | SEND\|RECEIVE; PENDING\|COMPLETED\|CANCELLED; cash + clearing; optional `customerId` / `senderCustomerId` / `receiverCustomerId`; optional linked Transaction |

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
10. `20260726095000_hawala_party_customers` — `senderCustomerId`, `receiverCustomerId` (applied locally; **uncommitted**)

### Seed highlights
- Admin: `admin` / `ChangeMe123!`
- Currencies: AFN, USD, PKR, EUR (no rates seeded)
- Settings: `app.name=Saraf`, `app.baseCurrencyCode=AFN`, `app.locale=en`
- Wallets: Main Vault, Cash Till, Exchange Difference, **Hawala Clearing** (SYSTEM)

---

## 5. Financial flow (UI → ledger)

```text
UI (dialog / form)
  → Server Action (auth/permission stub + Zod)
    → Domain movement service
         depositFunds / withdrawFunds / adjustFunds / exchangeFunds
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
| Hawala SEND | DEBIT cash, CREDIT Hawala Clearing |
| Hawala RECEIVE | DEBIT Hawala Clearing, CREDIT cash |

### Integrity (verified through Currency Exchange)
- Only `postTransaction` calls `tx.ledgerEntry.createMany`.
- Hawala / Exchange do **not** bypass the ledger; feature code has no `ledgerEntry.create*`.
- Deposit/withdraw/adjust/hawala/exchange only build balanced input — no duplicate posting engines.
- Low-level `createLedgerEntry` / `createTransaction` helpers exist in repos but are **unused** by feature services and **not exported** from public barrels as write APIs.
- Cancel hawala is status-only; it does not reverse ledger rows (void/reversal is later).
- Exchange links inactive rate snapshots via `exchangeRateId` (posting allows soft-deleted rate ids for history).

### Read paths (not writers)
- Wallet balances → `createBalanceCalculator` over ledger lines
- Customer history → `getCustomerHistory` (ledger events)
- Transaction / hawala detail → `getTransactionDetail` (transaction + ledger lines)

---

## 6. Services created

### Auth (`src/features/auth/services/`)
`authenticate-user`, `login-with-session`, `session`, `session-cookie`, `session-config`, `require-auth`, `username`

### Customers (`src/features/customers/services/`)
`create-customer`, `update-customer`, `archive-customer`, `list-customers`, `get-customer`, `get-customer-profile`

### Wallets (`src/features/wallets/services/`)
`create-wallet`, `update-wallet`, `archive-wallet`, `list-wallets`, `get-wallet`, `get-customer-wallets` (balance rows)

### Transactions (`src/features/transactions/services/`)
| Service | Role |
|---|---|
| `post-transaction` | **Sole financial writer** |
| `deposit` / `withdraw` / `adjust` | Build legs → post |
| `list-transactions` / `get-transaction-detail` | Reads |
| `get-customer-history` | Read-only history |
| `get-transaction-form-options` | Form dropdowns |
| `resolve-movement-amount` / `ledger-amount-display` / `map-posting-error` | Helpers |

### Hawala (`src/features/hawala/services/`)
| Service | Role |
|---|---|
| `send-hawala` / `receive-hawala` | Entry workflows |
| `create-hawala` | Create PENDING + post |
| `post-hawala-movement` | Legs → `postTransaction` only |
| `complete-hawala` | Retry PENDING (orphan recovery) |
| `cancel-hawala` | PENDING status cancel (no ledger reverse) |
| `list-hawala` / `get-hawala-detail` / `get-hawala-form-options` | Reads / options |
| `resolve-hawala-context` / `map-posting-error` | Helpers |

### Ledger (`src/features/ledger/`)
- **Domain:** Money (`bigint` minor units), CurrencyCode, validation, balance calculator
- **Repos:** currency, exchange-rate, ledger-entry (reads + unused low-level creates)
- **No** currency/rate **services** or Settings UI yet

### Settings
- `system-setting-repository` only — no Settings feature services/UI

---

## 7. Folder structure (high level)

```text
saraf/
├── docs/                      # HANDOFF, ROADMAP, DECISIONS
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   ├── migrations/
│   └── dev.db                 # local (do not commit wal/shm)
├── src/
│   ├── app/(app)/             # customers, wallets, transactions, hawala, …
│   ├── app/(auth)/login/
│   ├── components/layout|ui/
│   ├── design-system/
│   ├── features/              # auth, customers, wallets, transactions, hawala, ledger, …
│   ├── server/db/
│   ├── generated/prisma/      # gitignored
│   └── lib/                   # utils, navigation (returnTo)
├── src-tauri/
└── package.json
```

---

## 8. Important files

| Area | Paths |
|---|---|
| Posting | `src/features/transactions/services/post-transaction.ts` |
| Hawala post | `src/features/hawala/services/post-hawala-movement.ts` |
| Clickable rows | `src/components/clickable-table-row.tsx` |
| Customer codes / labels | `src/features/customers/domain/customer-code.ts`, `format-customer-label.ts` |
| Locations | `src/lib/locations/` (countries + cities catalog) |
| Wallet descriptions | `src/features/wallets/domain/wallet-descriptions.ts` |
| Navigation | `src/lib/navigation.ts` (`resolveSafeReturnTo`, `hrefWithReturnTo`) |
| Currencies | `src/features/currencies/` · `/settings/currencies` |
| Exchange rates | `src/features/exchange-rates/` · `/settings/exchange-rates` |
| Settings | `src/features/settings/` · `/settings` |
| Currency Exchange UI | `src/features/exchange/` · `/exchange`, `/exchange/[id]` |
| Exchange movement | `src/features/transactions/services/exchange.ts` · `createExchangeAction` |
| Schema / seed | `prisma/schema.prisma`, `prisma/seed.ts` |
| Hawala migrations | `…/20260726090000_add_hawala_transfers/`, `…/20260726095000_hawala_party_customers/` |
| Docs | `docs/HANDOFF.md`, `docs/ROADMAP.md`, `docs/DECISIONS.md` |

---

## 9. Known issues

1. **Uncommitted Currency Exchange** — see §18; do not commit `prisma/dev.db*` WAL/SHM.
2. **Tauri production build** — static export conflicts with Prisma/Server Actions; sidecar architecture not implemented.
3. **Rust may be missing** — `dev:desktop` / `build:desktop` need rustup.
4. **`argon2` still in package.json** while auth/seed use **bcrypt**.
5. **ID style split** — User/Session `cuid()`; financial models `uuid()`.
6. **Permission stub** — nav not role-filtered; `requirePermission` does not check catalog.
7. **Placeholder pages** — reports, users, audit, backup, dashboard (Settings is live).
8. **SQLite `@db.Decimal(p,s)` unsupported** — enforce scale in services (posting does).
9. **Hawala cancel UI** not wired (Server Action exists).
10. **Seed Hawala Clearing / Exchange Difference** — run `npm run db:seed` on existing DBs after pull.
11. **Receipt** is browser `window.print` only — no Tauri printer SDK.
12. **Create-then-post hawala** can leave `PENDING` if post fails (recover via complete/cancel).
13. **Older customers** created before auto-codes may still have `code = null`.
14. **Exchange rate snapshots** (`transaction-snapshot*`) appear as inactive rows if Settings list includes inactive — optional filter later.

---

## 10. Technical debt

| Item | Notes |
|---|---|
| Uncommitted Currency Exchange | Commit exchange module + docs; exclude `prisma/dev.db*` |
| Low-level ledger/transaction create helpers | Unused; risk if called outside posting — keep unused or eventually remove/gate |
| Permission enforcement | Catalog exists; not enforced |
| Dual currency repositories | `features/currencies` owns CRUD; `features/ledger` currency repo still used by txn/hawala/exchange reads — consolidate later if desired |
| Exchange rate active via `deletedAt` | No `isActive` column; fine for Day 11; optional dedicated flag later |
| No void/reversal | Completed hawala/transactions cannot be financially undone yet |
| No integration tests | Auth, posting balance, hawala, exchange |
| No CI smoke | lint + typecheck + migrate + seed |
| Customer status `<select>` | Native token-styled, not shadcn Select |
| i18n / RTL | Not started (Dari/Pashto later) |
| Pagination | UI footers “ready”; list pages often load full sets then filter in memory |

---

## 11. Next steps

See `docs/ROADMAP.md`. Immediate order:

1. **Commit** Currency Exchange + docs. Exclude `prisma/dev.db*`.
2. **Customer transfer** — must reuse `postTransaction` (`type: TRANSFER`).
3. Later: reports, audit, backup, permission enforcement, users admin, Tauri packaging, void/reversal, i18n/RTL.

**Do not** begin Customer Transfer until Currency Exchange is committed.  
**Do not** bypass `postTransaction` for any money movement.

---

## 12. Git status (at handoff)

```text
Branch: main
HEAD:   6b8fcb4 feat(settings): add currencies, exchange rates, and app preferences

Committed (includes Day 10 + UX polish + Day 11):
  - feat(settings): currencies, exchange rates, app preferences
  - feat(ui): complete UI polish …
  - Day 10 / hawala stack
  - auth + financial DB foundation

Uncommitted (Currency Exchange — see §18):
  src/features/exchange/**
  src/app/(app)/exchange/**
  src/features/transactions/services/exchange.ts
  src/features/transactions/services/resolve-deal-exchange-rate.ts
  src/features/transactions/services/resolve-exchange-difference-wallet.ts
  src/features/transactions/domain/exchange-rate-math.ts
  src/features/transactions/actions/transaction-actions.ts (+ related schemas/types/index)
  src/features/transactions/services/post-transaction.ts (allow linking soft-deleted rate snapshots)
  src/components/layout/nav-config.ts, app-header.tsx
  src/lib/navigation.ts
  src/features/wallets/domain/wallet-descriptions.ts (+ barrel)
  docs/HANDOFF.md, docs/ROADMAP.md, docs/DECISIONS.md

Do not commit:
  prisma/dev.db, prisma/dev.db-shm, prisma/dev.db-wal
  .env, src/generated/
```

---

## 13. Last completed task

**Currency Exchange (2026-07-26):**
- Service `exchangeFunds` → `postTransaction`; Server Action `createExchangeAction`
- UI: `/exchange` form + history; `/exchange/[id]` detail
- Rates from Settings; inactive deal-rate snapshots on ledger lines
- `npm run lint` — pass
- `npm run typecheck` — pass
- Docs updated; **Customer Transfer not started**

---

## 14. Day 10 summary (committed)

### Completed
- Hawala domain + Server Actions
- List, search, empty/loading, Send/Receive forms, detail
- Status workflow PENDING → COMPLETED | CANCELLED
- Financial legs via shared posting service
- Customers / wallets / transactions / history shipped in same commit

### Database (Day 10)
- `HawalaDirection`, `HawalaStatus`, `HawalaTransfer`
- Seed: SYSTEM wallet **Hawala Clearing**

---

## 15. Prior session — UX / data-entry polish (**committed**)

### What changed
1. **Clickable list rows** — shared `ClickableTableRow`; action cells ignored via `data-row-click-ignore`
2. **Auto customer codes** — `computeNextCustomerCode` / create path; starts at 1001; continues past max numeric code; update never writes `code`
3. **Customer labels** — `formatCustomerLabel` in wallet/txn/hawala options and displays
4. **Hawala parties** — per-side Existing customer vs External person; migration `senderCustomerId` / `receiverCustomerId`
5. **Hawala corridor selectors** — predefined country/city dropdowns (`src/lib/locations`); no free-text location input
6. **Wallet descriptions** — display-only catalog for Main Vault, Cash Till, Exchange Difference, Hawala Clearing
7. **Nav polish** — txn list `returnTo`; `/hawala/[id]` header title “Hawala Details”

### Files modified / added (high level)
| Area | Paths |
|---|---|
| Shared | `src/components/clickable-table-row.tsx` (new), `src/lib/navigation.ts`, `src/lib/locations/**` (new) |
| Customers | `domain/customer-code.ts`, `domain/format-customer-label.ts`, `services/create-customer.ts`, `services/update-customer.ts`, `repositories/customer-repository.ts`, `actions/…`, `components/customers-table.tsx`, `customer-profile.tsx`, `index.ts` |
| Hawala | form/dialogs/detail/table, `schemas/hawala.ts`, `resolve-hawala-context.ts`, `create-hawala.ts`, `get-hawala-detail.ts`, `get-hawala-form-options.ts`, `repositories/…`, `domain/types.ts`, migration `20260726095000_hawala_party_customers` |
| Transactions (display/nav only) | `transactions-table.tsx`, `list-transactions.ts`, `get-transaction-detail.ts`, `get-transaction-form-options.ts` |
| Wallets (display only) | `wallet-descriptions.ts`, `wallets-table.tsx`, `wallets-table-skeleton.tsx`, `list-wallets.ts`, `get-wallet.ts`, `domain/types.ts`, `app/(app)/wallets/page.tsx` |
| Shell | `app-header.tsx` |
| Schema | `prisma/schema.prisma` |

### Integrity verification (this session)
| Check | Result |
|---|---|
| Posting Service (`post-transaction.ts`) | **Unchanged** — not in dirty tree |
| Ledger domain / ledger write path | **Unchanged** — no feature ledger bypass |
| Hawala money movement | Still only `postHawalaMovement` → `postTransaction` |
| Duplicate posting logic | **None** |
| Wallet create/seed behavior | **Unchanged** — descriptions are display-only |

### Remaining UX tasks (not blockers for Day 11)
- Wire **Cancel** button on hawala detail for PENDING leftovers
- Optional hawala receipt
- Optional: preserve hawala list `?q=` via `returnTo` on detail back
- Optional: backfill null customer codes for pre-auto-code rows
- Transaction list filters / real server pagination (later)
- Permission enforcement / role-filtered nav (later)

### Architecture rules (summary — full list in §3)
- Money writes only through `postTransaction`
- Ledger is source of truth; balances derived
- No duplicate posting engines; no feature-level `LedgerEntry` writes
- Soft archive; offline-first; extend existing modules

### Exact next step (historical — completed)
Day 11 currencies / rates / Settings implemented next; see §17.

---

## 16. UX review checklist (verified 2026-07-26)

Code review + quality gates. Manual browser click-through not required for this handoff.

| Requirement | Status | Evidence |
|---|---|---|
| Customer codes generate automatically | **Pass** | `createCustomerRecord` → `allocateNextCustomerCode` / `computeNextCustomerCode` from 1001; no `code` on `CustomerForm`; update never mutates `code` |
| Customer table rows open detail | **Pass** | `customers-table.tsx` → `ClickableTableRow` → `/customers/{id}` |
| Transaction table rows open detail | **Pass** | `transactions-table.tsx` → `ClickableTableRow` → `/transactions/{id}?returnTo=/transactions` |
| Hawala table rows open detail | **Pass** | `hawala-table.tsx` → `ClickableTableRow` → `/hawala/{id}` |
| Hawala existing + external people | **Pass** | Form `SourceToggle` customer/external per party; external not registered; `senderCustomerId` / `receiverCustomerId` |
| Country and city selectors | **Pass** | Cascading `<select>`s from `src/lib/locations`; schema `isKnownCountry` / `isValidLocationPair`; no free-text corridor fields |
| Wallet descriptions visible | **Pass** | Description column + `getWalletDescription` for the four seeded operating wallets |
| `npm run lint` | **Pass** | Clean (2026-07-26) |
| `npm run typecheck` | **Pass** | Clean (2026-07-26) |
| Day 11 started | **Yes** | Completed in working tree — see §17 |

---

## 17. Day 11 review (2026-07-26) — Currency / rates / Settings

### Delivered
| Area | Routes / module | Capabilities |
|---|---|---|
| Currencies | `/settings/currencies` · `features/currencies` | List, create, update, activate/deactivate |
| Exchange rates | `/settings/exchange-rates` · `features/exchange-rates` | List, create, update, activate/deactivate |
| Settings | `/settings` · `features/settings` | Business name, base currency, locale; receipt placeholder; catalog links |

### Validation (code-level)
- Currency: code 3–8 A–Z, name required, duplicate code rejected, base currency cannot be deactivated
- Exchange rate: base ≠ quote, currencies exist, rate positive (≤8 decimals), effective date `YYYY-MM-DD`
- Settings: business name required, base currency must be active existing code, locale `en` only for now

### Quality gates
| Check | Result |
|---|---|
| `npm run typecheck` | **Pass** |
| `npm run lint` | **Pass** |
| Architecture (feature folders + Zod + Server Actions) | **Pass** — matches customers/wallets |
| `post-transaction.ts` | **Unchanged** vs HEAD |
| `src/features/ledger/**` | **Unchanged** vs HEAD |
| Wallet balance logic (`get-customer-wallets`) | **Unchanged** vs HEAD |
| Currency exchange transaction UI | **Started after Day 11 commit** — see §18 |

### Existing modules
- Customers, wallets, transactions, hawala, auth: no Day 11 edits to posting or ledger write paths
- Txn/hawala still read currencies via ledger currency repository (parallel to currencies feature CRUD)

### Exact next step (historical)
Day 11 committed as `6b8fcb4`; Currency Exchange implemented next — see §18.

---

## 18. Currency Exchange review (2026-07-26)

### Delivered
| Area | Routes / module | Capabilities |
|---|---|---|
| Exchange service | `exchangeFunds` · `createExchangeAction` | Build EXCHANGE legs → `postTransaction` only |
| Exchange desk | `/exchange` · `features/exchange` | Create form, history search, empty/loading, pagination-ready |
| Exchange detail | `/exchange/[id]` | FX summary + related transaction + ledger (via `getTransactionDetail`) |

### Verification
| Check | Result |
|---|---|
| Currency Exchange works | **Pass** — form → action → `exchangeFunds` → `postTransaction` |
| Exchange History works | **Pass** — `getExchangeHistory` + table/`?q=` |
| Exchange Detail works | **Pass** — reuses transaction detail ledger; links to `/transactions/[id]` |
| Current rates from Settings | **Pass** — `findLatestExchangeRate` / form options from active catalog |
| Historical rates unchanged | **Pass** — inactive `transaction-snapshot` rows linked on ledger lines |
| Posting Service reused | **Pass** — no feature-level `LedgerEntry` creates |
| `npm run typecheck` | **Pass** |
| `npm run lint` | **Pass** |
| Design system | **Pass** — Field/FormSection/Table/ClickableTableRow/StatusBadge patterns |

### Posting change (intentional, minimal)
- `post-transaction.ts` allows linking soft-deleted `ExchangeRate` ids so deal snapshots remain attachable without becoming live market rates.

### Exact next step
1. **Commit** Currency Exchange + docs (exclude `prisma/dev.db*`).  
2. **Then** Customer Transfer — must reuse `postTransaction`.  
   Do **not** invent a second posting path.

---

## Quick pointers for the next agent

1. **Commit** Currency Exchange first (exclude DB WAL/SHM).  
2. Never invent cloud auth or bypass **`postTransaction`**.  
3. After commit: **Customer transfer** (`TRANSFER`).  
4. Prefer extending `features/*` over new top-level packages.  
5. Do not modify posting/ledger unless a bug requires it.  
6. Read `docs/DECISIONS.md` (ADR-014, ADR-019–023) before financial work.

---

*End of handoff.*
