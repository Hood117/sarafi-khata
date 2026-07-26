# Saraf — Developer Handoff Document

**Audience:** Next AI agent / developer continuing this codebase  
**Product:** Offline Sarafi (money exchange) Management System for Windows  
**Handoff date:** 2026-07-26  
**Do not treat this file as source of truth over code** — verify against repo when unsure.

---

## 1. Current project status

Greenfield offline-first desktop app foundation is largely in place:

| Layer | Status |
|---|---|
| Next.js App Router + TypeScript + Tailwind v4 + shadcn/ui | Done |
| Tauri shell scaffold | Done (Rust toolchain may still be needed locally for desktop builds) |
| Prisma 7 + SQLite (LibSQL adapter) | Done |
| Feature-first folders | Done (many features still placeholders) |
| App shell + navigation + placeholder pages | Done |
| Design system tokens / primitives | Done |
| Auth (users, sessions, login, guards, logout UI) | Done (logout UI may be **uncommitted** — see §12) |
| Financial Prisma models + repos + ledger domain + seed | Done |
| Business posting / exchange / hawala services + real UI | **Not started** |

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

## 2. Completed features

### Foundation
- Next.js 16 App Router, TypeScript strict, Tailwind 4, ESLint + Prettier
- shadcn/ui (base-nova) components: button, card, table, input, textarea, select, checkbox, label, dialog, field, tooltip, scroll-area, separator
- Design system: CSS tokens (light/dark), Typography helpers, form layout helpers, `ThemeProvider` / `ThemeToggle`
- Tauri v2 project under `src-tauri/` (`com.saraf.app`)
- Scripts: `dev`, `dev:desktop`, `build`, `build:desktop`, `db:*`, `lint`, `format`, `typecheck`

### UX shell
- Desktop app shell: dark sidebar, header, main content panel
- Nav pages (placeholders only): Dashboard, Customers, Wallets, Transactions, Hawala, Reports, Audit Logs, Backup & Restore, Users, Settings
- Login screen UI at `/login`

### Authentication
- `User` + `Session` models; bcrypt password verify; Argon2 package may still be in deps but **auth uses bcrypt**
- Session token: random 32-byte hex, SHA-256 hash in DB, httpOnly cookie `saraf_session` (12h)
- `loginAction` / `logoutAction` / `getCurrentUserAction`
- Route guards: `(app)` → `requireAuth()`; `(auth)` → `requireGuest()`
- Permission catalog stub (`requirePermission` currently = auth only)
- Auth polish: header shows username + role + Logout (destroys session → `/login`)

### Financial data layer
- Models: Currency, ExchangeRate, Customer, Wallet, Transaction, LedgerEntry, SystemSetting
- Repositories (DB only): customers, wallets, transactions, ledger entries, currencies, exchange rates, system settings
- Ledger **domain** (no DB): Money (minor units bigint), CurrencyCode, validation, balance calculator
- Seed: admin user, currencies AFN/USD/PKR/EUR, empty rates, system settings, default wallets (Main Vault, Cash Till, Exchange Difference)

---

## 3. Folder structure (high level)

```text
saraf/
├── docs/                      # handoff / architecture notes
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   ├── migrations/
│   └── dev.db                 # local SQLite (gitignored patterns apply to db files)
├── src/
│   ├── app/
│   │   ├── (app)/             # authenticated shell + placeholder pages
│   │   ├── (auth)/login/      # login page
│   │   ├── layout.tsx         # root + ThemeProvider
│   │   └── globals.css        # design tokens
│   ├── components/
│   │   ├── layout/            # AppShell, sidebar, header, user-session-menu
│   │   └── ui/                # shadcn primitives
│   ├── design-system/         # theme, typography, form layouts, barrel exports
│   ├── features/
│   │   ├── auth/              # domain, services, actions, permissions stub, login UI
│   │   ├── customers/         # repositories (+ empty feature folders)
│   │   ├── wallets/
│   │   ├── transactions/
│   │   ├── ledger/            # domain + repositories
│   │   ├── settings/          # system-setting repository
│   │   ├── hawala|reports|audit|backup|users|dashboard/  # stubs
│   ├── server/db/             # Prisma client (LibSQL + SQLite pragmas)
│   ├── generated/prisma/      # generated client (gitignored)
│   └── lib/utils.ts
├── src-tauri/                 # Tauri Rust shell
└── package.json
```

**Feature module convention (intended):**
`components/`, `domain/`, `schemas/`, `services/`, `repositories/`, `hooks/`, public `index.ts`

---

## 4. Database schema summary

**Provider:** SQLite via Prisma 7 (`prisma-client` generator → `src/generated/prisma`)  
**Config:** `prisma.config.ts` (`DATABASE_URL`, seed command `tsx prisma/seed.ts`)  
**Adapter:** `@prisma/adapter-libsql` + `@libsql/client` (required by Prisma 7)

### Auth
- `User` — cuid id, unique username, passwordHash, Role enum (`ADMIN|MANAGER|CASHIER`), isActive, timestamps
- `Session` — tokenHash (unique), expiresAt, revokedAt?, userId → User (Cascade)

### Financial
- `Currency` — uuid, unique code, decimalPlaces, soft delete
- `ExchangeRate` — base/quote → Currency (Restrict), Decimal rate, effectiveAt, soft delete
- `Customer` — uuid, optional unique code, soft delete
- `Wallet` — type `VAULT|TILL|CUSTOMER|SYSTEM`, optional customerId (Restrict), soft delete
- `Transaction` — unique reference, type/status enums, valueDate, postedAt?, createdById → User (Restrict), soft delete
- `LedgerEntry` — **append-only** (no updatedAt/deletedAt); amount Decimal; direction DEBIT|CREDIT; FKs Restrict
- `SystemSetting` — key/value

### Migrations (applied locally)
1. `20260725111115_init_users`
2. `20260725111743_add_sessions`
3. `20260725115950_add_financial_models`
4. `20260725120422_add_system_settings`
5. `20260725120925_harden_financial_schema`
6. `20260725121140_db_layer_indexes`

### Seed highlights
- Admin: `admin` / `ChangeMe123!` (bcrypt, upsert; rehashes only if not bcrypt)
- Currencies: AFN, USD, PKR, EUR
- Exchange rates: none
- Settings: `app.name=Saraf`, `app.baseCurrencyCode=AFN`, `app.locale=en`
- Wallets: Main Vault, Cash Till, Exchange Difference

---

## 5. Authentication status

| Capability | Status |
|---|---|
| Local users in SQLite | Yes |
| Password hashing (bcrypt, 12 rounds) | Yes |
| Login UI + server action | Yes |
| Session create / destroy / getCurrentUser | Yes |
| httpOnly cookie session | Yes (`SESSION_COOKIE_SECURE` opt-in; default off for Tauri HTTP) |
| App route protection | Yes (`requireAuth`) |
| Login guest-only | Yes (`requireGuest`) |
| Logout + show user in header | Implemented in working tree; **commit pending** (see §12) |
| Role permission enforcement | **Stub only** — `rolePermissions` catalog exists; `requirePermission` does not enforce yet |
| First-run setup wizard | No |
| User admin CRUD UI | No (placeholder page only) |

**Important auth files:**
- `src/features/auth/services/authenticate-user.ts`
- `src/features/auth/services/session.ts` / `session-cookie.ts` / `session-config.ts`
- `src/features/auth/services/require-auth.ts`
- `src/features/auth/actions/session-actions.ts`
- `src/features/auth/permissions/*`
- `src/features/auth/components/login-form.tsx`
- `src/components/layout/user-session-menu.tsx`

---

## 6. Architecture decisions

1. **Offline-only** — no cloud auth, no remote APIs.
2. **Tauri + local Next server** — not static-export-first for Prisma/Server Actions; `next.config.ts` exports static only when `TAURI_ENV_PLATFORM` is set (desktop packaging still needs a real sidecar plan for SSR/Prisma in production).
3. **Feature-first modules** — import via feature `index.ts`.
4. **Ledger-first accounting** — `Transaction` = document; `LedgerEntry` = postings; balances derived, not stored on Wallet.
5. **Money in domain** — integer **minor units** (`bigint`); DB stores Prisma `Decimal` (bridge in future services).
6. **Append-only ledger** — no update/delete APIs in ledger repository; void via reversing entries later.
7. **Soft delete** for master data; unique fields released on soft delete (customer `code` → null; currency code renamed; transaction `reference` → `deleted:{id}`).
8. **FK Restrict** on financial history links (prefer soft-deactivate users/customers over hard delete).
9. **SQLite pragmas** on client ready: `foreign_keys=ON`, `WAL`, `busy_timeout=5000`, `synchronous=NORMAL`.
10. **Permissions prepared, not enforced** — implement later in `requirePermission`.

---

## 7. Development conventions

- **Language:** TypeScript strict; App Router; server code marked `server-only` where needed.
- **UI:** shadcn + design tokens from `globals.css`; prefer `@/design-system` / `@/components/ui`.
- **Aliases:** `@/*` → `src/*`.
- **Features:** business logic in `features/*/services` + `domain`; DB only in `repositories`; thin Server Actions.
- **Naming:** feature folders kebab-ish already; components PascalCase; use-cases verb phrases.
- **Quality:** `npm run lint`, `npm run typecheck`, `npm run format`.
- **DB:** never edit applied migrations; use `prisma migrate dev` for schema changes; `npm run db:seed` for seed.
- **Env:** `.env` from `.env.example` — `DATABASE_URL`, optional `SESSION_COOKIE_SECURE`.
- **Do not commit:** `.env`, `src/generated`, SQLite db/wal/shm (and avoid committing local DB artifacts).

---

## 8. Important business rules (intended / partially encoded)

Encode in services next; domain already has some ledger rules:

1. Users are soft-deactivated (`isActive`), not hard-deleted.
2. Login rejects invalid credentials and inactive users (inactive only after password verify).
3. One new login revokes prior active sessions for that user.
4. Ledger amounts in domain are **positive**; sign via `DEBIT` / `CREDIT`.
5. A posting set must **balance per currency** (`assertLedgerBalanced`).
6. Corrections = reversing entries + transaction `VOIDED`, not mutating ledger rows.
7. Wallet balances are computed from ledger lines (debit +, credit − asset convention in domain calculator).
8. Multi-currency: every ledger line has `currencyId`; FX via `ExchangeRate` (+ system “Exchange Difference” wallet seeded).
9. Base currency setting key: `app.baseCurrencyCode` (seeded `AFN`).
10. Roles planned: Admin full; Manager ops/reports; Cashier transactional — **not enforced in routes yet**.

---

## 9. Remaining roadmap (suggested order)

1. **Commit auth polish** if still uncommitted (user menu / logout).
2. **Currency / rates services + Settings UI** (manage currencies, enter rates).
3. **Customer CRUD** (service + UI on `/customers`).
4. **Wallet management UI** (beyond seeded system wallets; customer wallets).
5. **Posting service** — draft → validate domain → write Transaction + LedgerEntries in a DB transaction.
6. **Exchange transaction flow** (core sarafi UX).
7. **Transfer / deposit / withdrawal**.
8. **Hawala** feature (may extend schema later).
9. **Reports** (daily position, customer statement, FX gain).
10. **Audit log** feature (separate from auth sessions).
11. **Backup / restore** via Tauri filesystem commands.
12. **Enforce `requirePermission`** on routes/actions.
13. **Users admin UI** (create cashiers/managers, reset passwords).
14. **Production Tauri packaging** — Next standalone/sidecar so Prisma works outside `tauri dev`.
15. **i18n / RTL** (Dari/Pashto) when product-ready.
16. Remove unused `argon2` dependency if still present.

---

## 10. Known issues

1. **Uncommitted auth polish** — `user-session-menu.tsx` + shell/header/layout changes not on `origin/main` at handoff time.
2. **WAL files untracked** — `prisma/dev.db-shm`, `prisma/dev.db-wal` appear in git status; do not commit.
3. **Tauri production build** — static export path conflicts with Prisma/Server Actions; sidecar architecture not implemented.
4. **Rust may be missing** on some machines — `dev:desktop` / `build:desktop` need rustup.
5. **`argon2` still in package.json** while auth/seed use **bcrypt** — leftover dependency.
6. **ID style split** — User/Session use `cuid()`; financial models use `uuid()`.
7. **Permission stub** — UI nav not role-filtered; server `requirePermission` does not check catalog.
8. **Placeholder pages** — no real CRUD/posting UI yet.
9. **SQLite `@db.Decimal(p,s)` unsupported** — amounts/rates are Prisma `Decimal` without native scale; enforce scale in services.
10. **Prisma client proxy** wraps delegates to await SQLite pragmas — be careful if adding unusual Prisma client APIs.

---

## 11. Pending improvements

- Commit and push auth polish.
- Add currency/exchange-rate/settings services (not only repos).
- Implement posting orchestration service with `$transaction`.
- Wire login success / logout consistently with `router.refresh()`.
- Add integration tests for auth + ledger domain balancing.
- Document backup format and DB file path for Tauri app data dir.
- Consider `lineNo`/`sequence` on `LedgerEntry` if same-ms ordering becomes an issue.
- i18n/RTL readiness.
- CI: lint + typecheck + migrate + seed smoke.

---

## 12. Git status (at handoff)

```text
Branch: main (tracks origin/main, reported up to date with remote for last push)
HEAD:   85b3579 feat(database): complete financial database foundation

Uncommitted (modified):
  src/app/(app)/layout.tsx
  src/components/layout/app-header.tsx
  src/components/layout/app-shell.tsx
  src/components/layout/index.ts

Untracked:
  src/components/layout/user-session-menu.tsx   ← auth polish (logout / user display)
  prisma/dev.db-shm                            ← do not commit
  prisma/dev.db-wal                            ← do not commit
```

**Action for next agent:** stage/commit auth polish files only (not WAL/SHM), message e.g. `feat(auth): show user session and logout in shell`.

---

## 13. Current branch

- **Branch:** `main`
- **Remote:** `origin/main` (local reported up to date with remote for committed history)
- **Working tree:** dirty (auth polish uncommitted)

---

## 14. Last completed task

**Authentication polish (session UI):**
- Logout button in application header
- Display logged-in username + role
- Logout destroys session and redirects to `/login`
- Confirmed guards: unauthenticated → `/login`; authenticated → cannot stay on `/login`

Immediately prior completed workstreams in this project:
- Financial DB foundation + hardening + repository layer + seed
- Ledger domain foundation (Money/Currency/validation/balances)
- Full local auth stack (model, seed admin, login service, sessions, route protection)

---

## Quick pointers for the next agent

1. Start by **committing auth polish** if still uncommitted.  
2. Do **not** invent cloud auth or change to static-only Next without a Prisma sidecar plan.  
3. Next valuable vertical slice: **Customers CRUD** or **Exchange posting service** (domain + repo + one Server Action + minimal UI).  
4. Always run ledger domain validation before writing `LedgerEntry` rows.  
5. Prefer extending existing `features/*` modules over new top-level packages.

---

*End of handoff.*
