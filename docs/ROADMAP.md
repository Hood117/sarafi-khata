# Saraf — Product / Engineering Roadmap

**Last updated:** 2026-07-26 (end of Day 11 — Currency / rates / Settings complete)  
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
| **Day 11 — Currency / rates + Settings** | **Done** (working tree — commit next) |
| Currency exchange | **Next** (after Day 11 commit) |
| Customer transfer | After exchange (unless reprioritized) |

---

## Done (through Day 11)

- [x] App foundation (Next.js 16, Tailwind 4, shadcn, design tokens, Tauri scaffold)
- [x] Prisma 7 + SQLite + LibSQL adapter + migrations + seed
- [x] Local auth (users, sessions, login/logout, route guards)
- [x] Auth shell polish (header user + role + logout)
- [x] Financial models + repositories + ledger domain
- [x] **Customer management**
- [x] **Wallet management**
- [x] **Transactions / posting** (`postTransaction` sole writer)
- [x] **Customer history** (read-only ledger events)
- [x] **Hawala (Day 10)** — posts via `postTransaction`
- [x] UX polish (clickable rows, auto codes, hawala parties/locations, wallet descriptions)
- [x] **Day 11 — Currencies**
  - [x] Feature module `features/currencies` (Zod + services + Server Actions + UI)
  - [x] `/settings/currencies` list + create/edit + activate/deactivate
  - [x] Code immutable after create; protect base currency from deactivation
- [x] **Day 11 — Exchange rates**
  - [x] Feature module `features/exchange-rates`
  - [x] `/settings/exchange-rates` list + create/edit + activate/deactivate
  - [x] Rate convention: quote units per 1 base (e.g. 1 USD = 70 AFN)
  - [x] No exchange transaction posting in this slice
- [x] **Day 11 — Settings**
  - [x] `/settings` shop prefs via `SystemSetting` (`app.name`, `app.baseCurrencyCode`, `app.locale`)
  - [x] Catalog links to Currencies / Exchange Rates
  - [x] Receipt preferences placeholder (not persisted)

---

## Next (near-term)

1. **Commit** Day 11 + docs. Exclude `prisma/dev.db*`.
2. **Currency exchange flow** (core sarafi UX)
   - Must reuse `postTransaction`
   - Use Exchange Difference wallet for FX gain/loss legs as designed
   - Consume rates entered in Settings → Exchange Rates
3. **Customer transfer** flow — must reuse `postTransaction`

---

## Later

4. Optional hawala polish: Cancel button in UI for PENDING; hawala receipt
5. **Reports** — daily position, customer statement, FX gain/loss
6. **Audit log** (separate from auth sessions)
7. **Backup / restore** via Tauri filesystem commands
8. **Enforce `requirePermission`** on routes/actions + role-filtered nav
9. **Users admin UI** — create cashiers/managers, reset passwords
10. **Production Tauri packaging** — Next standalone/sidecar so Prisma works outside `tauri dev`
11. **i18n / RTL** (Dari/Pashto) when product-ready — locale setting already stubbed
12. Remove unused **`argon2`** dependency if still present
13. Optional: **restore archived customers / wallets**
14. Transaction **void** / reversing entries
15. Transaction list **filters**
16. OS/Tauri **printer integration** (beyond browser print); wire receipt preference settings
17. CI: lint + typecheck + migrate + seed smoke
18. Integration tests for auth, customers, wallets, posting balancing, hawala, rates
19. Optional: consolidate dual currency repositories (`features/currencies` vs `features/ledger`)

---

## Explicitly out of scope for now

- Cloud auth / remote APIs
- Hard-deleting customers, wallets, or ledger history
- Storing wallet balances as mutable columns (always derive from ledger)
- Bypassing `postTransaction` for money movement
- Static-export-only Next packaging without a Prisma sidecar plan
- Starting Currency Exchange before Day 11 is committed

---

## Financial architecture reminder (every future money feature)

- Posting Service (`postTransaction`) is the **only** financial write entry point.
- Never duplicate posting logic.
- Ledger is the source of truth; balances are derived.
- Every post balances per currency inside one `prisma.$transaction()`.
- Append-only ledger history; soft-archive master data.
