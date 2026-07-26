# Saraf — Product / Engineering Roadmap

**Last updated:** 2026-07-26 (end of Day 10 — Hawala complete)  
**Related:** `docs/HANDOFF.md`, `docs/DECISIONS.md`

Suggested implementation order. Adjust when product priorities change.

---

## Milestone summary

| Day / slice | Status |
|---|---|
| Foundation + auth + financial DB | Done (auth polish committed) |
| Customers + wallets | Done (working tree) |
| Transactions / posting + history | Done (working tree) |
| **Day 10 — Hawala** | **Done** (working tree) |
| **Day 11 — Currency / rates + Settings** | **Next** |
| Currency exchange | After Day 11 |
| Customer transfer | After exchange (unless reprioritized) |

---

## Done (through Day 10)

- [x] App foundation (Next.js 16, Tailwind 4, shadcn, design tokens, Tauri scaffold)
- [x] Prisma 7 + SQLite + LibSQL adapter + migrations + seed
- [x] Local auth (users, sessions, login/logout, route guards)
- [x] Auth shell polish (header user + role + logout) — **committed**
- [x] Financial models + repositories + ledger domain
- [x] **Customer management**
  - [x] List + empty/loading + pagination-ready layout
  - [x] Add customer (Zod + Server Actions)
  - [x] Edit customer (shared form)
  - [x] Profile page (info + edit/archive)
  - [x] Search (name / phone / code)
  - [x] Soft archive + archived filter (no hard delete)
  - [x] Customer profile wallets section (derived balances)
- [x] **Wallet management**
  - [x] List `/wallets` + empty/loading
  - [x] Add / Edit / Archive (Zod + Server Actions)
  - [x] CUSTOMER requires customer; VAULT/TILL/SYSTEM forbid customer
  - [x] Soft archive only; balances never stored on Wallet
  - [x] Profile balance rows via ledger `createBalanceCalculator`
- [x] **Transactions / posting**
  - [x] `postTransaction` single write entry point + one `$transaction`
  - [x] Deposit / Withdrawal / Manual Adjustment (services + Server Actions)
  - [x] Shared transaction form (Zod → actions → posting)
  - [x] List `/transactions` + empty/loading + pagination-ready
  - [x] Detail `/transactions/[id]` + ledger entries
  - [x] Printable receipt (`window.print`; no printer SDK)
  - [x] Public barrels do not export low-level ledger/transaction create APIs
- [x] **Customer history**
  - [x] `getCustomerHistory` read-only service (ledger events + transaction metadata)
  - [x] Timeline UI on customer profile (design-system badges/typography)
  - [x] Filters: date range, type, currency, reference (URL-driven)
  - [x] Sort: newest / oldest first
  - [x] Pagination (Previous/Next; preserves filters)
  - [x] Navigation to existing transaction detail with `returnTo` (filters preserved)
- [x] **Hawala (Day 10)**
  - [x] `HawalaTransfer` model + migration + Hawala Clearing seed wallet
  - [x] Send / Receive domain services posting via `postTransaction`
  - [x] Complete / Cancel status workflow (PENDING → COMPLETED | CANCELLED)
  - [x] Server Actions (`sendHawalaAction`, `receiveHawalaAction`, `cancelHawalaAction`)
  - [x] List `/hawala` + search + empty/loading + pagination-ready
  - [x] Send / Receive forms
  - [x] Detail `/hawala/[id]` (timeline + related transaction/ledger via `getTransactionDetail`)

---

## Next (near-term) — Day 11 and after

1. **Commit** pending modules + docs (if still uncommitted). Exclude `prisma/dev.db*`.
2. **Day 11 — Currency / exchange-rate services + Settings UI**
   - Manage currencies and enter FX rates
   - Use `app.baseCurrencyCode` (seeded `AFN`)
   - Build on existing `Currency` / `ExchangeRate` / `SystemSetting` repositories
   - Do **not** start the exchange transaction UI in the same slice unless rates entry is already usable
3. **Currency exchange flow** (core sarafi UX)
   - Must reuse `postTransaction`
   - Use Exchange Difference wallet for FX gain/loss legs as designed
4. **Customer transfer** flow — must reuse `postTransaction`

---

## Later

5. Optional hawala polish: Cancel button in UI for PENDING; hawala receipt
6. **Reports** — daily position, customer statement, FX gain/loss
7. **Audit log** (separate from auth sessions)
8. **Backup / restore** via Tauri filesystem commands
9. **Enforce `requirePermission`** on routes/actions + role-filtered nav
10. **Users admin UI** — create cashiers/managers, reset passwords
11. **Production Tauri packaging** — Next standalone/sidecar so Prisma works outside `tauri dev`
12. **i18n / RTL** (Dari/Pashto) when product-ready
13. Remove unused **`argon2`** dependency if still present
14. Optional: **restore archived customers / wallets**
15. Transaction **void** / reversing entries
16. Transaction list **filters**
17. OS/Tauri **printer integration** (beyond browser print)
18. CI: lint + typecheck + migrate + seed smoke
19. Integration tests for auth, customers, wallets, posting balancing, hawala

---

## Explicitly out of scope for now

- Cloud auth / remote APIs
- Hard-deleting customers, wallets, or ledger history
- Storing wallet balances as mutable columns (always derive from ledger)
- Bypassing `postTransaction` for money movement
- Static-export-only Next packaging without a Prisma sidecar plan
- Starting Currency Exchange before currency/rate services + Settings exist

---

## Financial architecture reminder (every future money feature)

- Posting Service (`postTransaction`) is the **only** financial write entry point.
- Never duplicate posting logic.
- Ledger is the source of truth; balances are derived.
- Every post balances per currency inside one `prisma.$transaction()`.
- Append-only ledger history; soft-archive master data.
