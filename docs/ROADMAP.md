# Saraf — Product / Engineering Roadmap

**Last updated:** 2026-08-17  
**Related:** `docs/HANDOFF.md`, `docs/DECISIONS.md`

Suggested implementation order. Adjust when product priorities change.

---

## Milestone summary

| Day / slice | Status |
|---|---|
| Foundation + auth + financial DB | Done |
| Customers + wallets | Done |
| Transactions / posting + history | Done |
| **Day 10 — Hawala** | **Done** |
| **Day 11 — Currency / rates + Settings** | **Done** |
| **Currency exchange** | **Done** |
| **UI simplification (hide wallets from ops)** | **Done** |
| **Business Cash Overview** | **Done** — `/cash` |
| **Customer transfer** | **Done** — `/transfers` |
| **Dashboard** | **Done** — `/` |
| **Reports Center** | **Done** — `/reports` eight historical reports (ADR-043) |
| **Audit log** | **Done** — `/audit` |
| **Role & permission enforcement** | **Done** — ADR-030 |
| **User Management** | **Done** — `/users` |
| **Production hardening** | **Done** (working tree — ADR-032 / ADR-033) |

---

## Done (through production hardening)

- [x] App foundation (Next.js 16, Tailwind 4, shadcn, design tokens, Tauri scaffold)
- [x] Prisma 7 + SQLite + LibSQL adapter + migrations + seed
- [x] Local auth (users, sessions, login/logout, route guards)
- [x] Auth shell polish (header user + role + logout)
- [x] Financial models + repositories + ledger domain
- [x] **Customer management**
- [x] **Wallet management** (architecture retained; admin UI under Settings)
- [x] **Transactions / posting** (`postTransaction` sole writer)
- [x] **Customer history** (read-only ledger events)
- [x] **Hawala (Day 10)** — posts via `postTransaction`
- [x] UX polish (clickable rows, auto codes, hawala parties/locations, wallet descriptions)
- [x] **Day 11 — Currencies / Exchange rates / Settings**
- [x] **Currency Exchange** — `exchangeFunds` → `postTransaction` (existing customer + walk-in; ADR-036)
- [x] **UI simplification**
  - [x] Hide wallet selection on Deposit, Withdrawal, Currency Exchange, Hawala
  - [x] Auto-resolve shop cash to **Main Vault** (ADR-044); Hawala Clearing / Exchange Difference stay SYSTEM
  - [x] Customer profile: tabbed Information | Balances | History (ADR-034)
  - [x] Remove Wallets from primary sidebar; keep under Settings → System
  - [x] `/wallets` redirects to `/settings/wallets`
- [x] **Business Cash Overview** (`/cash`) — Main Vault balances by currency from ledger
- [x] **One shop cash wallet (ADR-044)** — Cash Till retired from seed/ops; consolidate on migrate; no cash-wallet pickers on desk forms
- [x] **Unified account numbers (ADR-045)** — Main Vault #1; customers #2+; wipe resets to clean slate; Daybook Opposite Account from ledger
- [x] **Customer Transfer** — `transferFunds` → `postTransaction` (`type: TRANSFER`)
- [x] **Dashboard** — read-only `getDashboardStats` + `/` UI
- [x] **Reports Center** — **complete** (ADR-043): Overview, Daily, Monthly, Cash Flow, Hawala, Exchange, Customer Statement, Transactions Report; read-only ledger SQL; green/red = money direction; clickable rows → transaction detail; print/CSV
- [x] **Reports** (Next-era hub + drill-in / ADR-035) — superseded for native desk by Reports Center above
- [x] **Audit Log** — append-only `AuditLog`; `recordAuditEvent` / `auditAction`
- [x] **Role & permission enforcement** — `requirePermission` + role-filtered nav + 403
- [x] **User Management** — `/users` (ADMIN / `users.manage`)
- [x] **Production hardening**
  - [x] Query/perf: batched ledger balance reads; `groupBy` KPI counts; SQL date filters; list indexes migration
  - [x] Security: login Zod; id/boolean action schemas; server-enforced FX override rule; unified inactive-login client message
  - [x] Errors: app + global error boundaries; root/transaction not-found; audit detail loading; resilient logout

---

## Next (near-term)

1. Global developer footer (`Developed by Rahmat & Samsoor · © 2026` + phones) — **not in code yet**
2. Decide whether to hide **Transactions** from primary nav (page still exists)
3. Optionally surface Debtors/Creditors **totals** using existing `includeTotals` (SPA currently skips)
4. P&L: transfer/service fees only if those fees are posted
5. Expand i18n dictionary coverage beyond nav/common strings
6. Deeper integration tests for posting / hawala / exchange
7. Remove unused `argon2` if still present

---

## Later

4. ~~**Backup / restore**~~ — Engine + Settings tab (continue polishing restore UX)
5. ~~**Production Tauri packaging**~~ — Sidecar wired; first-run migrate best-effort in desktop-entry
6. ~~**i18n / RTL**~~ — Foundation: en/fa/ps locale + `dir` on root layout (expand dictionary coverage)
7. Remove unused **`argon2`** dependency if still present
8. Optional: **restore archived customers / wallets**
9. ~~Transaction **void** / reversing entries~~ — Done (ADR-039)
10. Transaction list **filters** (desk-level; Reports Center already filters)
11. ~~Report **export** + dedicated **FX gain/loss** P&L~~ — Export on Reports Center; FX P&L / exchange period report covered
12. Optional: Dashboard charts
13. OS/Tauri **printer integration** (beyond browser print); wire receipt preference settings
14. ~~CI: lint + typecheck + migrate + seed smoke~~ — GitHub Actions + Vitest ledger tests
15. Integration tests for auth, customers, wallets, posting balancing, hawala, rates, exchange, cash overview, transfers, dashboard, reports, audit, users/RBAC
16. Optional: consolidate dual currency repositories (`features/currencies` vs `features/ledger`)
17. Optional: hide `transaction-snapshot` rates from Settings inactive list
18. Optional: restrict Manual Adjustment (wallet picks) to admin roles
19. Optional: customer-history / desk search server-side pagination where still in-memory
20. ~~Partner Sarafi catalog~~ — Settings → Partner Sarafis (ADR-038)
21. ~~**Reports Center**~~ — **Done** (ADR-043): eight native reports, direction colors, clickable detail

---

## Explicitly out of scope for now

- Cloud auth / remote APIs
- Hard-deleting customers, wallets, users, or ledger history
- Storing wallet balances as mutable columns (always derive from ledger)
- Bypassing `postTransaction` for money movement
- Deleting wallet tables/services/repositories (admin maintenance still needs them)
- Teaching `postTransaction` to invent wallets — callers still supply `walletId`s
- Static-export-only Next packaging without a Prisma sidecar plan
- Writing financial records from Dashboard, Reports, or Audit Log (read-only compose / activity only)
- Using Audit Log rows as balances or money truth

---

## Financial architecture reminder (every future money feature)

- Posting Service (`postTransaction`) is the **only** financial write entry point.
- Never duplicate posting logic.
- Ledger is the source of truth; balances are derived.
- Every post balances per currency inside one `prisma.$transaction()`.
- Append-only ledger history; soft-archive master data.
- Normal operators should not pick shop cash wallets; resolve **Main Vault** in the feature layer (ADR-044).
- Do **not** fold Hawala Clearing or Exchange Difference into Main Vault — they are required SYSTEM contras for balanced multi-currency / hawala posting.
- Dashboard and Reports must stay read-only — compose existing readers; never post (ADR-043 for Reports Center).
- Audit Log records who did what; it must never write `LedgerEntry` or invent balances.
