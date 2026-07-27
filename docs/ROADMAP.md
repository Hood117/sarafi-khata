# Saraf — Product / Engineering Roadmap

**Last updated:** 2026-07-27 (Dashboard + Reports)  
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
| **Currency exchange** | **Done** (committed) |
| **UI simplification (hide wallets from ops)** | **Done** (working tree) |
| **Business Cash Overview** | **Done** (working tree — `/cash`) |
| **Customer transfer** | **Done** (working tree — `/transfers`) |
| **Dashboard** | **Done** (working tree — `/`) |
| **Reports** | **Done** (working tree — `/reports` + drill-in) |

---

## Done (through Dashboard + Reports)

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
  - [x] Form: sender, receiver, currency, amount, reference, notes (no wallets)
  - [x] History + search + pagination-ready layout
  - [x] Detail reuses `getTransactionDetail` for related txn + ledger lines
- [x] **Dashboard** — read-only `getDashboardStats` + `/` UI (summary cards, business cash, recent activity, quick actions)
- [x] **Reports** — read-only hub + URL filters + drill-in pages reusing existing list/detail UIs
  - [x] Daily / monthly (or filtered activity) totals
  - [x] Customer statement
  - [x] Hawala / Exchange / Transfers sections
  - [x] No file export yet

---

## Next (near-term)

1. **Commit** UI simplification + Business Cash Overview + Customer Transfer + Dashboard + Reports + docs. Exclude `prisma/dev.db*`.
2. Optional hawala polish: Cancel button in UI for PENDING; hawala receipt

---

## Later

3. **Audit log** (separate from auth sessions)
4. **Backup / restore** via Tauri filesystem commands
5. **Enforce `requirePermission`** on routes/actions + role-filtered nav
6. **Users admin UI** — create cashiers/managers, reset passwords
7. **Production Tauri packaging** — Next standalone/sidecar so Prisma works outside `tauri dev`
8. **i18n / RTL** (Dari/Pashto) when product-ready — locale setting already stubbed
9. Remove unused **`argon2`** dependency if still present
10. Optional: **restore archived customers / wallets**
11. Transaction **void** / reversing entries
12. Transaction list **filters** (desk-level; Reports already filters)
13. Report **export** (PDF/CSV) and dedicated **FX gain/loss** P&L (Exchange Difference substrate exists)
14. Optional: Dashboard charts
15. OS/Tauri **printer integration** (beyond browser print); wire receipt preference settings
16. CI: lint + typecheck + migrate + seed smoke
17. Integration tests for auth, customers, wallets, posting balancing, hawala, rates, exchange, cash overview, transfers, dashboard, reports
18. Optional: consolidate dual currency repositories (`features/currencies` vs `features/ledger`)
19. Optional: hide `transaction-snapshot` rates from Settings inactive list
20. Optional: restrict Manual Adjustment (wallet picks) to admin roles when permissions are enforced
21. Optional: transfer history server-side pagination (currently in-memory filter like exchange)

---

## Explicitly out of scope for now

- Cloud auth / remote APIs
- Hard-deleting customers, wallets, or ledger history
- Storing wallet balances as mutable columns (always derive from ledger)
- Bypassing `postTransaction` for money movement
- Deleting wallet tables/services/repositories (admin maintenance still needs them)
- Teaching `postTransaction` to invent wallets — callers still supply `walletId`s
- Static-export-only Next packaging without a Prisma sidecar plan
- Writing financial records from Dashboard or Reports (read-only compose only)

---

## Financial architecture reminder (every future money feature)

- Posting Service (`postTransaction`) is the **only** financial write entry point.
- Never duplicate posting logic.
- Ledger is the source of truth; balances are derived.
- Every post balances per currency inside one `prisma.$transaction()`.
- Append-only ledger history; soft-archive master data.
- Normal operators should not pick internal wallets; resolve them in the UI/feature layer.
- Dashboard and Reports must stay read-only — compose existing readers; never post.
