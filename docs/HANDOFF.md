# Saraf — Developer Handoff Document

**Audience:** Next AI agent / developer continuing this codebase  
**Product:** Offline Sarafi (money exchange) Management System for Windows  
**Handoff date:** 2026-07-26 (end of Day 10 — Hawala complete)  
**Do not treat this file as source of truth over code** — verify against the repo when unsure.

**Related:** `docs/ROADMAP.md`, `docs/DECISIONS.md`

---

## 1. Current project status

Greenfield offline-first desktop app. Foundation through **Day 10 Hawala** is implemented in the working tree (mostly uncommitted — see §12).

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
| **Customer management** | **Done** (uncommitted — see §12) |
| **Wallet management** | **Done** (uncommitted) |
| **Transactions / posting engine** | **Done** (uncommitted) |
| **Customer history** | **Done** (uncommitted) |
| **Hawala (Day 10)** | **Done** (uncommitted) |
| Currency / rates services + Settings UI | **Not started** (Day 11) |
| Currency exchange / customer transfer UI | **Not started** |

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

## 2. Completed features (through Day 10)

### Foundation
- Next.js 16 App Router, TypeScript strict, Tailwind 4, ESLint + Prettier
- shadcn/ui (base-nova): button, card, table, input, textarea, select, checkbox, label, dialog, field, tooltip, scroll-area, separator
- Design system: CSS tokens (light/dark), Typography, form layout helpers, `ThemeProvider` / `ThemeToggle`
- Zod for customer, wallet, transaction, and hawala form validation
- Tauri v2 under `src-tauri/` (`com.saraf.app`)
- Scripts: `dev`, `dev:desktop`, `build`, `build:desktop`, `db:*`, `lint`, `format`, `typecheck`

### UX shell
- Desktop shell: dark sidebar, header, main content panel
- Real UI: Dashboard (stub), **Customers**, **Wallets**, **Transactions**, **Hawala**
- Placeholders: Reports, Audit Logs, Backup & Restore, Users, Settings
- Login at `/login`

### Authentication (committed)
- `User` + `Session`; bcrypt (12 rounds); session cookie `saraf_session` (12h, SHA-256 hash in DB)
- `loginAction` / `logoutAction` / `getCurrentUserAction`
- Guards: `(app)` → `requireAuth()`; `(auth)` → `requireGuest()`
- Header: username + role + Logout
- Permission catalog stub — `requirePermission` ≈ auth only (not role-enforced)

### Customer management
- `/customers` list: empty/loading, search (`?q=`), archive filter (`?status=archived`), pagination-ready
- Add / Edit shared `CustomerForm` + Server Actions + Zod
- `/customers/[id]` profile: fields, wallets (derived balances), customer history timeline
- Soft archive only (`deletedAt` + `isActive=false`); phone/code/notes preserved
- Active phone uniqueness via partial DB indexes

### Wallet management
- `/wallets` list CRUD: Add / Edit / Archive
- Rules: `CUSTOMER` requires `customerId`; `VAULT` / `TILL` / `SYSTEM` forbid it
- Soft archive only; **no balances on wallet list**
- Customer profile balances via ledger `createBalanceCalculator`

### Transactions / posting
- **`postTransaction`** — sole financial write entry point
- Deposit / Withdrawal / Manual Adjustment (services + actions + shared form)
- `/transactions` list + `/transactions/[id]` detail + printable receipt (`window.print`)
- Public barrels do not export low-level create APIs for Transaction/LedgerEntry

### Customer history
- Read-only `getCustomerHistory` (ledger-line events + transaction metadata)
- Timeline UI with URL filters (date, type, currency, ref), sort, pagination
- Detail via existing `/transactions/[id]?returnTo=…`

### Hawala (Day 10)
- Domain: send / receive / complete / cancel
- Money only via `postHawalaMovement` → `postTransaction` (`type: HAWALA`)
- Status: `PENDING` → `COMPLETED` | `CANCELLED`
- UI: `/hawala` list + search + Send/Receive dialogs; `/hawala/[id]` detail
- Detail reuses `getTransactionDetail` for related transaction + ledger
- Cancel: domain + Server Action ready; **no Cancel button in UI yet**

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

Active feature modules: `auth`, `customers`, `wallets`, `transactions`, `hawala`, `ledger` (domain + repos), `settings` (repo stub). Placeholders: `reports`, `audit`, `backup`, `users`, `dashboard`.

### Non-negotiable financial rules
1. **`postTransaction` is the ONLY component allowed to create financial postings.**
2. Every future money feature must reuse it — never duplicate posting logic.
3. The ledger (`LedgerEntry`) is the source of truth for financial history.
4. Wallet balances are derived; do not add/remove balance storage unless explicitly required.
5. Every posting must balance per currency before commit.
6. Execute each financial post inside a single `prisma.$transaction()`.
7. Append-only ledger — never permanently delete financial records.
8. Extend the existing architecture; do not refactor completed modules unless fixing a bug or satisfying an explicit requirement.

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
| `Customer` | uuid; optional code/phone/address/nationalId/notes; soft archive |
| `Wallet` | `VAULT\|TILL\|CUSTOMER\|SYSTEM`; optional customerId; soft delete; **no balance column** |
| `Transaction` | unique reference; type/status enums; valueDate; postedAt; createdById; soft delete |
| `LedgerEntry` | **append-only** (no updatedAt/deletedAt); DEBIT\|CREDIT; amount Decimal |
| `SystemSetting` | key/value |
| `HawalaTransfer` | SEND\|RECEIVE; PENDING\|COMPLETED\|CANCELLED; cash + clearing wallets; optional linked Transaction |

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
         depositFunds / withdrawFunds / adjustFunds
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
| Hawala SEND | DEBIT cash, CREDIT Hawala Clearing |
| Hawala RECEIVE | DEBIT Hawala Clearing, CREDIT cash |

### Integrity (verified after Day 10)
- Only `postTransaction` calls `tx.ledgerEntry.createMany`.
- Hawala does **not** bypass the ledger.
- Deposit/withdraw/adjust/hawala only build balanced input — no duplicate posting engines.
- Low-level `createLedgerEntry` / `createTransaction` helpers exist in repos but are **unused** by feature services and **not exported** from public barrels as write APIs.
- Cancel hawala is status-only; it does not reverse ledger rows (void/reversal is later).

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
| Navigation | `src/lib/navigation.ts` (`resolveSafeReturnTo`) |
| Schema / seed | `prisma/schema.prisma`, `prisma/seed.ts` |
| Hawala migration | `prisma/migrations/20260726090000_add_hawala_transfers/` |
| Docs | `docs/HANDOFF.md`, `docs/ROADMAP.md`, `docs/DECISIONS.md` |

---

## 9. Known issues

1. **Large uncommitted working tree** — customers, wallets, transactions, history, hawala, docs; do not commit `prisma/dev.db*` WAL/SHM.
2. **Tauri production build** — static export conflicts with Prisma/Server Actions; sidecar architecture not implemented.
3. **Rust may be missing** — `dev:desktop` / `build:desktop` need rustup.
4. **`argon2` still in package.json** while auth/seed use **bcrypt**.
5. **ID style split** — User/Session `cuid()`; financial models `uuid()`.
6. **Permission stub** — nav not role-filtered; `requirePermission` does not check catalog.
7. **Placeholder pages** — reports, settings, users, audit, backup, dashboard.
8. **SQLite `@db.Decimal(p,s)` unsupported** — enforce scale in services (posting does).
9. **Hawala cancel UI** not wired (Server Action exists).
10. **Seed Hawala Clearing** — run `npm run db:seed` on existing DBs after pull.
11. **Receipt** is browser `window.print` only — no Tauri printer SDK.
12. **Create-then-post hawala** can leave `PENDING` if post fails (recover via complete/cancel).

---

## 10. Technical debt

| Item | Notes |
|---|---|
| Uncommitted feature modules | Prefer commit (possibly split) before Day 11 |
| Low-level ledger/transaction create helpers | Unused; risk if called outside posting — keep unused or eventually remove/gate |
| Permission enforcement | Catalog exists; not enforced |
| Currency/rate services missing | Repos only — Day 11 |
| No void/reversal | Completed hawala/transactions cannot be financially undone yet |
| No integration tests | Auth, posting balance, hawala |
| No CI smoke | lint + typecheck + migrate + seed |
| Customer status `<select>` | Native token-styled, not shadcn Select |
| i18n / RTL | Not started (Dari/Pashto later) |
| Pagination | UI footers “ready”; list pages often load full sets then filter in memory |

---

## 11. Next steps

See `docs/ROADMAP.md`. Immediate order:

1. **Commit** pending modules + docs (exclude DB artifacts). Suggested message:  
   `feat(hawala): add send/receive workflow with list and detail UI`  
   (Larger tree may warrant split commits: customers → wallets → transactions → history → hawala → docs.)
2. **Day 11 — Currency / exchange-rate services + Settings UI**
   - Manage currencies; enter FX rates
   - Use `app.baseCurrencyCode` (seeded `AFN`)
3. **Currency exchange flow** — must reuse `postTransaction` (do not start without rates/settings).
4. **Customer transfer** — must reuse `postTransaction`.
5. Later: reports, audit, backup, permission enforcement, users admin, Tauri packaging, void/reversal, i18n/RTL.

**Do not** begin Currency Exchange until currency/rate services + Settings exist.  
**Do not** bypass `postTransaction` for any money movement.

---

## 12. Git status (at handoff)

```text
Branch: main (ahead of origin/main by 1 — auth polish)
HEAD:   72a79a1 feat(auth): complete authentication polish

Committed:
  - feat(auth): complete authentication polish
  - feat(database): complete financial database foundation
  - Initial commit

Uncommitted (typical):
  package.json / package-lock.json
  prisma/schema.prisma + migrations (customers + hawala)
  prisma/seed.ts                       ← Hawala Clearing
  src/app/(app)/customers|wallets|transactions|hawala/**
  src/features/customers|wallets|transactions|hawala/**
  src/features/ledger/** (domain/repo tweaks)
  src/components/layout/*, src/app/globals.css
  src/lib/navigation.ts
  docs/HANDOFF.md, docs/ROADMAP.md, docs/DECISIONS.md

Do not commit:
  prisma/dev.db, prisma/dev.db-shm, prisma/dev.db-wal
  .env, src/generated/
```

---

## 13. Last completed task

**Day 10 — Hawala module (verified):**
- Domain send/receive/complete/cancel; posting only through `postTransaction`
- List/search/send/receive UI + detail (timeline, related tx/ledger)
- Migration `HawalaTransfer`; seed Hawala Clearing
- Orphan-post recovery + cancel guards
- TypeScript + ESLint clean at last verification
- Docs handoff package updated

Prior workstreams (in working tree): customer history → transactions/posting → wallets → customers. Auth polish is on `main` (committed).

---

## 14. Day 10 summary

### Completed
- Hawala domain + Server Actions
- List, search, empty/loading, Send/Receive forms, detail
- Status workflow PENDING → COMPLETED | CANCELLED
- Financial legs via shared posting service

### New files (high level)
- `prisma/migrations/20260726090000_add_hawala_transfers/`
- `src/features/hawala/**`
- `src/app/(app)/hawala/**`

### Database changes
- `HawalaDirection`, `HawalaStatus`, `HawalaTransfer`
- Seed: SYSTEM wallet **Hawala Clearing**

### Remaining (hawala polish — not Day 11 blockers)
- Wire Cancel button for PENDING rows
- Optional hawala receipt

---

## Quick pointers for the next agent

1. **Commit** the pending tree before starting Day 11 (exclude DB WAL/SHM).
2. Run `npm run db:seed` if **Hawala Clearing** is missing.
3. Never invent cloud auth or bypass **`postTransaction`**.
4. Next product slice: **Currency/rates + Settings UI**, then **exchange**.
5. Prefer extending `features/*` over new top-level packages.
6. Hawala is **Done** — do not reopen unless fixing a bug.
7. Read `docs/DECISIONS.md` (especially ADR-014 posting, ADR-019 hawala) before financial work.

---

*End of handoff.*
