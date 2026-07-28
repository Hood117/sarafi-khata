# Saraf — Product / Engineering Roadmap

**Last updated:** 2026-07-28 (production hardening)  
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
| **Reports** | **Done** — `/reports` + drill-in |
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
- [x] **Currency Exchange** — `exchangeFunds` → `postTransaction`
- [x] **UI simplification**
  - [x] Hide wallet selection on Deposit, Withdrawal, Currency Exchange, Hawala
  - [x] Auto-resolve internal wallets in UI layer (Cash Till, customer wallet, Hawala Clearing)
  - [x] Customer profile: Information → Current Balances → History
  - [x] Remove Wallets from primary sidebar; keep under Settings → System
  - [x] `/wallets` redirects to `/settings/wallets`
- [x] **Business Cash Overview** (`/cash`) — VAULT + TILL balances by currency from ledger
- [x] **Customer Transfer** — `transferFunds` → `postTransaction` (`type: TRANSFER`)
- [x] **Dashboard** — read-only `getDashboardStats` + `/` UI
- [x] **Reports** — read-only hub + URL filters + drill-in pages
- [x] **Audit Log** — append-only `AuditLog`; `recordAuditEvent` / `auditAction`
- [x] **Role & permission enforcement** — `requirePermission` + role-filtered nav + 403
- [x] **User Management** — `/users` (ADMIN / `users.manage`)
- [x] **Production hardening**
  - [x] Query/perf: batched ledger balance reads; `groupBy` KPI counts; SQL date filters; list indexes migration
  - [x] Security: login Zod; id/boolean action schemas; server-enforced FX override rule; unified inactive-login client message
  - [x] Errors: app + global error boundaries; root/transaction not-found; audit detail loading; resilient logout

---

## Next (near-term)

1. **Commit** production hardening + docs; run `npx prisma migrate deploy` for `20260728120000_perf_list_indexes`. Exclude `prisma/dev.db*`.
2. Optional hawala polish: Cancel button in UI for PENDING; hawala receipt
3. Optional: wire currency / exchange-rate / wallet settings mutations to `auditAction`

---

## Later

4. **Backup / restore** via Tauri filesystem commands
5. **Production Tauri packaging** — Next standalone/sidecar so Prisma works outside `tauri dev`
6. **i18n / RTL** (Dari/Pashto) when product-ready — locale setting already stubbed
7. Remove unused **`argon2`** dependency if still present
8. Optional: **restore archived customers / wallets**
9. Transaction **void** / reversing entries
10. Transaction list **filters** (desk-level; Reports already filters)
11. Report **export** (PDF/CSV) and dedicated **FX gain/loss** P&L (Exchange Difference substrate exists)
12. Optional: Dashboard charts
13. OS/Tauri **printer integration** (beyond browser print); wire receipt preference settings
14. CI: lint + typecheck + migrate + seed smoke
15. Integration tests for auth, customers, wallets, posting balancing, hawala, rates, exchange, cash overview, transfers, dashboard, reports, audit, users/RBAC
16. Optional: consolidate dual currency repositories (`features/currencies` vs `features/ledger`)
17. Optional: hide `transaction-snapshot` rates from Settings inactive list
18. Optional: restrict Manual Adjustment (wallet picks) to admin roles
19. Optional: customer-history / desk search server-side pagination where still in-memory

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
- Normal operators should not pick internal wallets; resolve them in the UI/feature layer.
- Dashboard and Reports must stay read-only — compose existing readers; never post.
- Audit Log records who did what; it must never write `LedgerEntry` or invent balances.
