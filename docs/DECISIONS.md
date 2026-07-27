# Saraf — Architecture / Product Decisions

**Last updated:** 2026-07-27 (Dashboard + Reports)  
**Related:** `docs/HANDOFF.md`, `docs/ROADMAP.md`

Record of intentional decisions. Prefer appending new entries over rewriting history; mark superseded decisions clearly.

---

## Index

| ID | Title |
|---|---|
| ADR-001 | Offline-only desktop product |
| ADR-002 | Tauri + local Next.js (not static-export-first) |
| ADR-003 | Feature-first modules |
| ADR-004 | Ledger-first accounting |
| ADR-005 | Money representation |
| ADR-006 | Soft delete / archive for master data |
| ADR-007 | Permissions prepared, not enforced |
| ADR-008 | Customer forms use Zod + Server Actions |
| ADR-009 | Shared Add/Edit customer form |
| ADR-010 | Auth password hashing (bcrypt) |
| ADR-011 | ID strategy split (accepted for now) |
| ADR-012 | Wallet forms use Zod + customer-link rules |
| ADR-013 | Customer wallet balances are derived on read |
| ADR-014 | Posting service is the only financial write path |
| ADR-015 | Deposit / withdrawal / adjustment directions |
| ADR-016 | Transaction receipt is browser-print only |
| ADR-017 | Customer history is read-only ledger events |
| ADR-018 | Transaction detail back navigation via safe `returnTo` |
| ADR-019 | Hawala is a business document that posts through posting |
| ADR-020 | Currencies are Settings master data (not ledger writes) |
| ADR-021 | Exchange rates are Settings master data; quote-per-base convention |
| ADR-022 | App Settings use SystemSetting keys |
| ADR-023 | Currency Exchange posts through posting; snapshots deal rate |
| ADR-024 | Hide internal wallets from normal money-movement UX |
| ADR-025 | Business Cash Overview replaces day-to-day wallet inspection |
| ADR-026 | Customer Transfer posts through posting; wallets resolved in service |
| ADR-027 | Dashboard is read-only composition of existing readers |
| ADR-028 | Reports are read-only filtered views; drill-in reuses existing detail UIs |

---

## Financial architecture (canonical)

These rules override convenience shortcuts:

1. **`postTransaction` is the ONLY component allowed to create financial postings.**
2. Every future financial feature must reuse the Posting Service.
3. Never duplicate posting logic.
4. The ledger is the source of truth for financial history.
5. Keep wallet balances consistent with derived-from-ledger architecture.
6. Every transaction must balance before commit.
7. Execute every financial operation inside a single `prisma.$transaction()`.
8. Preserve append-only ledger history; never permanently delete financial records.
9. Extend the existing architecture only; do not refactor completed modules unless required to fix a bug or satisfy an explicit requirement.
10. Normal operators must not pick internal wallets; resolve wallet IDs in the UI/feature layer before calling movement actions.
11. Dashboard and Reports are read-only; compose existing readers and never post money.

See ADR-004, ADR-014, ADR-015, ADR-019–028.

---

## ADR-001 — Offline-only desktop product

- **Decision:** No cloud auth, no remote business APIs. All data lives in local SQLite.
- **Why:** Sarafi shops need reliable operation without internet; compliance/privacy preference for local ledgers.
- **Consequence:** Auth, backup, and sync are local concerns; Tauri + local Next server is the runtime model.

---

## ADR-002 — Tauri + local Next.js (not static-export-first)

- **Decision:** Use Server Actions / server code with Prisma; avoid static-export-only packaging as the primary path.
- **Why:** Ledger writes and auth need a real Node/server runtime.
- **Consequence:** Production packaging must eventually provide a Next sidecar/standalone; `TAURI_ENV_PLATFORM` static export is insufficient alone for Prisma.

---

## ADR-003 — Feature-first modules

- **Decision:** Business code lives under `src/features/<name>/` with public `index.ts` barrel.
- **Convention folders:** `components/`, `domain/`, `schemas/`, `services/`, `repositories/`, `actions/`.
- **Why:** Keeps UI, validation, use-cases, and DB access separable and discoverable.

---

## ADR-004 — Ledger-first accounting

- **Decision:** `Transaction` is the document; `LedgerEntry` is the posting; wallet balances are derived, not stored.
- **Why:** Correct multi-currency double-entry and auditable history.
- **Consequence:** Posting services must validate balance rules before write; no update/delete on ledger rows (void via reversing entries).

---

## ADR-005 — Money representation

- **Decision:** Domain money uses integer minor units (`bigint`); DB stores Prisma `Decimal`.
- **Why:** Avoid float rounding in FX/cash operations.
- **Consequence:** Services must bridge domain ↔ Decimal carefully; SQLite has no native Decimal scale — enforce scale in services.

---

## ADR-006 — Soft delete / archive for master data

- **Decision:** Prefer soft-deactivate / soft-archive over hard delete for users, customers, wallets, etc.
- **Why:** Preserve historical links (FK Restrict on financial history).
- **Customer-specific (2026-07-26):**
  - Archive sets `deletedAt` + `isActive=false`.
  - **Do not** null phone/code/notes on archive (preserve searchable history).
  - Active uniqueness for `phone` / `code` via **partial unique indexes** (`WHERE deletedAt IS NULL`).
  - Archived customers hidden by default; list filter `?status=archived` to view.
  - No hard-delete API for customers.

---

## ADR-007 — Permissions prepared, not enforced

- **Decision:** Permission catalog exists (`customers.manage`, `hawala.manage`, etc.); `requirePermission` currently equals `requireAuth`.
- **Why:** Ship auth + features first; enforce role matrix later without rewriting call sites.
- **Consequence:** Nav is not role-filtered yet; do not assume cashier/manager restrictions are active.

---

## ADR-008 — Customer forms use Zod + Server Actions

- **Decision:** Customer create/update validate with Zod (`createCustomerSchema`); mutations go through thin Server Actions → services → repository.
- **Why:** Shared validation for Add/Edit; keep UI free of Prisma; consistent error mapping to field messages.
- **Consequence:** Other features should follow the same pattern when they grow forms (see ADR-012 for wallets, hawala schemas).

---

## ADR-009 — Shared Add/Edit customer form

- **Decision:** One `CustomerForm` component powers Add and Edit dialogs; Edit loads via `getCustomerForEditAction`.
- **Why:** Keep validation and field UX identical; reduce drift.
- **Consequence:** Profile and list both reuse `EditCustomerDialog`.

---

## ADR-010 — Auth password hashing (bcrypt)

- **Decision:** Use bcrypt (12 rounds) for password hashing/verification.
- **Why:** Implemented and seeded; sufficient for offline local users.
- **Note:** `argon2` may still appear in `package.json` as a leftover — remove when convenient (roadmap item).

---

## ADR-011 — ID strategy split (accepted for now)

- **Decision:** Auth models use `cuid()`; financial models (including Customer, HawalaTransfer) use `uuid()`.
- **Why:** Historical choice from early migrations.
- **Consequence:** Do not mix assumptions; no forced unification unless a migration is deliberately planned.

---

## ADR-012 — Wallet forms use Zod + customer-link rules

- **Decision:** Wallet create/update validate with Zod (`walletFormSchema`); shared `WalletForm` for Add/Edit; mutations via thin Server Actions → services → repository.
- **Rules:**
  - `CUSTOMER` wallets **require** `customerId`.
  - `VAULT` / `TILL` / `SYSTEM` wallets **must not** have `customerId` (cleared on transform).
- **Why:** Prevent invalid ownership links at the form boundary; match seed system wallets (vault/till/system) vs per-customer wallets.
- **Consequence:** Soft-archive only; wallet admin list does not show balances (master-data CRUD only). Admin UI lives under Settings (see ADR-024); tables/services/repos remain.

---

## ADR-013 — Customer wallet balances are derived on read

- **Decision:** Do not store current balance on `Wallet` or `Customer`. Profile **Current Balances** use `getCustomerCurrencyBalances` → shared `deriveCurrencyBalancesForWallets` → `createBalanceCalculator().summarizeCurrencies` over the customer’s wallet ledger lines.
- **Display rules:**
  - One tile per currency (aggregated across the customer’s wallets).
  - Active currencies with no activity appear as `0`.
  - Grouped major-unit display (e.g. `25,000`); trailing fractional zeros trimmed.
  - Do not call the calculator on an empty entry set (domain validation would throw) — derive helper handles empty wallets.
  - Skip lines with unknown currency or invalid direction (`isLedgerDirection`).
- **Why:** Keeps ADR-004 (ledger-first) intact while hiding the wallet concept from the profile.
- **Consequence:** Balances update automatically when money posts; wallet admin CRUD stays under Settings without balance columns.

---

## ADR-014 — Posting service is the only financial write path

- **Decision:** All money movements go through `postTransaction` in `src/features/transactions/services/post-transaction.ts`.
- **Guarantees:**
  - Domain validation + `assertLedgerBalanced` (per currency) before commit.
  - One interactive `prisma.$transaction()` creates the `Transaction` (`POSTED`) and all `LedgerEntry` rows.
  - Append-only ledger; no wallet balance column updates.
- **Movement services** that only build balanced `PostTransactionInput` and call posting:
  - `depositFunds`, `withdrawFunds`, `adjustFunds`, `exchangeFunds`, `transferFunds`
  - `postHawalaMovement` (used by send/receive/complete hawala)
- **Public API:** `@/features/transactions` and `@/features/ledger` barrels do **not** export low-level `createTransaction` / `createLedgerEntry*` writers.
- **Why:** Prevent bypasses and keep a single integrity gate for every future transfer and related flow.
- **Consequence:** New financial features must reuse `postTransaction`; never open parallel write paths.
- **Posting note (Exchange):** `postTransaction` may link `LedgerEntry.exchangeRateId` to soft-deleted `ExchangeRate` rows so historical deal snapshots remain attachable without becoming live Settings market rates.

---

## ADR-015 — Deposit / withdrawal / adjustment directions (asset convention)

- **Decision:** Under the ledger asset convention (debit +, credit −):
  - **Deposit:** DEBIT customer wallet, CREDIT cash (vault/till).
  - **Withdrawal:** CREDIT customer wallet, DEBIT cash (vault/till).
  - **Manual adjustment:** explicit DEBIT wallet + CREDIT wallet.
- **Why:** Matches existing balance calculator used on customer profiles.
- **Consequence:** Movement **services/actions** still require wallet IDs. Normal deposit/withdrawal UIs resolve those IDs automatically (ADR-024); Manual Adjustment may still expose wallet picks as an operator escape hatch. Posting rejects unbalanced sets.

---

## ADR-016 — Transaction receipt is browser-print only (for now)

- **Decision:** Detail page includes a receipt preview and **Print Receipt** via `window.print()`. App shell chrome is `print:hidden`.
- **Why:** Ship a usable offline receipt without Tauri printer APIs yet.
- **Consequence:** No OS printer integration, templates, or PDF export until a later roadmap item.

---

## ADR-017 — Customer history is read-only ledger events

- **Decision:** `getCustomerHistory` returns paginated **ledger-line events** for wallets belonging to the customer (including archived wallets), joined to parent `Transaction` metadata.
- **Each event includes:** date (`valueDate`), type, reference, currency, amount, direction (`DEBIT`/`CREDIT` as stored), status, operator.
- **Sorting:** `newest` | `oldest` by value date (stable id tie-break).
- **Filters (applied in memory after one fetch path):** inclusive date range (`YYYY-MM-DD`), transaction type, currency code, reference substring.
- **Pagination:** `page` / `pageSize` (default 20, max 100) over the filtered+sorted event list; out-of-range page is clamped.
- **Queries:** one ledger-entry query for all customer wallet IDs; operators loaded only for `createdById`s present on those transactions.
- **Reuse:** existing wallet/currency reads + `formatPrismaAmount` / type-status labels — no new posting or balance logic.
- **UI:** timeline on customer profile (`CustomerHistorySection`); URL params `from`/`to`/`type`/`currency`/`ref`/`sort`/`page`.
- **Why:** Profile/statement history must not duplicate the posting engine or invent a second money model.
- **Consequence:** UI calls this service and links to existing `/transactions/[id]` for detail/receipt; do not recompute balances here.

---

## ADR-018 — Transaction detail back navigation via safe `returnTo`

- **Decision:** Optional `?returnTo=` on `/transactions/[id]` sets the detail back link. Values must be same-app relative paths (`resolveSafeReturnTo` in `src/lib/navigation.ts`); reject `//…` and absolute URLs.
- **Customer history:** links include `returnTo` built from the current profile URL (filters + page) so Back restores the filtered timeline.
- **Hawala detail:** related-transaction links use `returnTo=/hawala/{id}` (“Back to hawala”).
- **Default:** when `returnTo` is absent or unsafe → `/transactions` (“Back to transactions”).
- **Why:** Reuse one Transaction Detail page without duplicating it or losing history filter state.
- **Consequence:** Other entry points may pass `returnTo` the same way; never open a second detail implementation for history.

---

## ADR-019 — Hawala is a business document that posts through the posting service

- **Decision:** `HawalaTransfer` stores sarafi business fields and status (`PENDING` | `COMPLETED` | `CANCELLED`). Financial legs are posted only by `postHawalaMovement` → `postTransaction` with `type: HAWALA`.
- **Directions:**
  - **SEND:** DEBIT cash (vault/till), CREDIT SYSTEM clearing (seeded **Hawala Clearing**).
  - **RECEIVE:** DEBIT clearing, CREDIT cash.
- **Workflow:** create PENDING → post → COMPLETED; cancel only while PENDING and only if no posted transaction exists for the reference; `completeHawala` retries PENDING (including orphan-post recovery by reference).
- **Detail UI:** reuses `getTransactionDetail` for related transaction + ledger lines — no second ledger aggregation.
- **UI note:** Cancel Server Action exists; Cancel button in UI is optional polish (not required to start Day 11).
- **Why:** Keep ADR-014 (single posting gate) while supporting hawala-specific parties, corridor, and status.
- **Consequence:** Never create `LedgerEntry` rows from hawala UI/actions; never bypass `postTransaction` for hawala money movement.

---

## ADR-020 — Currencies are Settings master data (not ledger writes)

- **Decision:** Currency CRUD lives in `src/features/currencies/` with Zod + Server Actions + Settings UI at `/settings/currencies`.
- **Rules:**
  - Code immutable after create.
  - Activate/deactivate via `Currency.isActive` (not soft-delete of code for Day 11 UI).
  - Cannot deactivate the currency matching `app.baseCurrencyCode`.
  - `decimalPlaces` defaults to 2 on create (not exposed in Day 11 form).
- **Why:** Shop must manage currencies before exchange; keep master-data edits out of the posting path.
- **Consequence:** Feature owns a Prisma currency repository for CRUD. Existing txn/hawala readers may still use `features/ledger` currency repository — do not merge unless planned. Currency changes never write `LedgerEntry`.

---

## ADR-021 — Exchange rates are Settings master data; quote-per-base convention

- **Decision:** Exchange rates live in `src/features/exchange-rates/` with UI at `/settings/exchange-rates`. Rate means **quote units per 1 base unit** (example: base USD, quote AFN, rate `70` → `1 USD = 70 AFN`).
- **Rules:**
  - Base and quote must differ; both currencies must exist.
  - Rate must be positive; enforce decimal scale in services (max 8).
  - Active status maps to `ExchangeRate.deletedAt` (null = active) — no new column in Day 11.
  - Settings CRUD does not post ledger entries.
- **Why:** Shop-managed market rates for Currency Exchange; keep ADR-014 intact.
- **Consequence:** Currency Exchange looks up active rates (`findLatestExchangeRate`) and still posts only through `postTransaction`. Editing a Settings rate later must not rewrite past deals (see ADR-023 snapshots).

---

## ADR-022 — App Settings use SystemSetting keys

- **Decision:** Shop preferences persist via existing `SystemSetting` key/value rows managed by `features/settings` services/actions.
- **Keys (Day 11):**
  - `app.name` — business name (receipts / branding)
  - `app.baseCurrencyCode` — default/base currency (e.g. AFN)
  - `app.locale` — default language (`en` only for now; Dari/Pashto placeholders in UI)
- **UI:** `/settings` form + **Catalog** links (Currencies, Exchange Rates) + **System** link (Wallets admin). Receipt preference toggles are **placeholders** (not persisted yet).
- **Why:** Reuse seeded settings model; avoid new tables for simple prefs.
- **Consequence:** Changing base currency does not rewrite ledger history; it only affects defaults such as empty-balance display. Permission gate uses `settings.manage` stub.

---

## ADR-023 — Currency Exchange posts through posting; snapshots deal rate

- **Decision:** Currency Exchange is a desk workflow in `src/features/exchange/` (UI) + `exchangeFunds` in `src/features/transactions/services/exchange.ts`. Money moves only via `createExchangeAction` → `exchangeFunds` → `postTransaction` with `type: EXCHANGE`.
- **Inputs (API):** customer, from/to wallets, from/to currencies, amount (from currency), optional notes; rate from active Settings catalog by default; optional manual override when `EXCHANGE_BUSINESS_RULES.allowManualRateOverride` is true.
- **Inputs (normal UI):** customer, from/to currencies, amount, rate, notes — wallets resolved automatically (ADR-024).
- **Deal rate convention:** to-currency units per 1 from-currency unit (may invert a Settings base/quote pair).
- **Ledger legs (asset convention, balanced per currency):**
  - CREDIT fromWallet / fromCurrency (original amount)
  - DEBIT toWallet / toCurrency (converted amount)
  - DEBIT Exchange Difference / fromCurrency
  - CREDIT Exchange Difference / toCurrency
- **Historical rate:** before posting, create an inactive (`deletedAt` set) `ExchangeRate` snapshot (`source` prefix `transaction-snapshot`) with the exact deal rate; link `exchangeRateId` on every ledger line. Also store rate text in transaction description / memos. Snapshots are never selected by `findLatestExchangeRate`.
- **UI:** `/exchange` form + history (`?q=`); `/exchange/[id]` detail reuses `getTransactionDetail` for related transaction + ledger lines (no second financial aggregation).
- **Why:** Core sarafi UX while preserving ADR-014 and immutable deal rates after Settings rates change.
- **Consequence:** Never write `LedgerEntry` from exchange UI/actions; never treat Exchange Difference as a from/to wallet. Same-currency customer movement is a separate flow (`TRANSFER`, ADR-026).

---

## ADR-024 — Hide internal wallets from normal money-movement UX

- **Decision:** Operators must not select internal wallets for Deposit, Withdrawal, Currency Exchange, Hawala, or Customer Transfer. The UI/feature layer resolves wallet IDs and still calls the existing movement actions/services (which remain wallet-aware, except Transfer which resolves customer wallets inside `transferFunds`). **Do not** teach `postTransaction` to invent wallets. **Do not** delete wallet tables, services, or repositories.
- **Resolution defaults** (`resolve-form-wallets.ts` for deposit/withdrawal/exchange/hawala UI):
  - Customer account → sole `CUSTOMER` wallet for that customer (error if zero or multiple).
  - Operating cash → prefer **Cash Till**, else **Main Vault**, else first VAULT/TILL.
  - Hawala clearing → prefer **Hawala Clearing** SYSTEM wallet.
- **Transfer:** form collects sender/receiver customers only; `transferFunds` resolves each party’s sole active `CUSTOMER` wallet (same zero/multiple error policy).
- **Wallet admin:** removed from primary sidebar; available under **Settings → System → Wallets** (`/settings/wallets`). `/wallets` redirects there.
- **Exception:** Manual Adjustment may still expose debit/credit wallet picks for rare corrections.
- **Why:** Sarafi operators think in customers, currencies, and amounts — not ledger accounts. Internal wallets remain the accounting substrate.
- **Consequence:** Multiple customer wallets per customer are a configuration error for normal ops, not a picker.

---

## ADR-025 — Business Cash Overview replaces day-to-day wallet inspection

- **Decision:** `/cash` (**Business Cash Overview**) shows available company cash by currency, aggregated from active **VAULT** + **TILL** wallets via `getBusinessCashBalances` → shared `deriveCurrencyBalancesForWallets` → `createBalanceCalculator` (ledger-derived; not stored).
- **Why:** Operators need shop cash position without opening Wallet management.
- **Consequence:** Wallet admin stays for maintenance only. Customer liabilities remain on the customer profile (ADR-013). Do not invent a stored cash-balance table.

---

## ADR-026 — Customer Transfer posts through posting; wallets resolved in service

- **Decision:** Customer Transfer is a desk workflow in `src/features/transfers/` (UI) + `transferFunds` in `src/features/transactions/services/transfer.ts`. Money moves only via `createTransferAction` → `transferFunds` → `postTransaction` with `type: TRANSFER`.
- **Inputs (API / form):** sender customer, receiver customer, currency, amount, reference, optional notes (`description`). No wallet fields.
- **Validation:** sender ≠ receiver; amount > 0; currency exists and is active; sender has sufficient ledger-derived balance in that currency; each party has exactly one active `CUSTOMER` wallet.
- **Ledger legs (asset convention, same currency):**
  - CREDIT sender customer wallet (decrease sender balance)
  - DEBIT receiver customer wallet (increase receiver balance)
- **`Transaction.customerId`:** set to the sender (singular FK); both parties still appear in customer history via wallet ledger lines.
- **UI:** `/transfers` form + history (`?q=`); `/transfers/[id]` detail reuses `getTransactionDetail` for related transaction + ledger lines (amount/currency derived from those rows; sender/receiver labels from wallet→customer links). No second financial aggregation.
- **Why:** Core sarafi customer-to-customer movement while preserving ADR-014 and wallet-free ops UX (ADR-024).
- **Consequence:** Never write `LedgerEntry` from transfer UI/actions; never expose wallet pickers; cross-currency remains Exchange (ADR-023).

---

## ADR-027 — Dashboard is read-only composition of existing readers

- **Decision:** The home Dashboard (`/`) is implemented in `src/features/dashboard/` and loads data only via `getDashboardStats`. It composes existing readers (`listTransactionTypes`, `getTransactionList`, `countCustomers`, `getBusinessCashBalances`) and never calls `postTransaction` or writes `LedgerEntry` / financial tables.
- **UI:** Summary cards (today's txn / exchange / hawala counts; active customers), Business Cash tiles (same VAULT+TILL aggregation as `/cash`), recent POSTED activity linking to `/transactions/[id]?returnTo=/`, and Quick Actions that are links to existing desks (not inline posting forms).
- **Why:** Operators need an at-a-glance shop position without a second money model or write path.
- **Consequence:** Charts and richer analytics can be added later; they must remain read-only. Business cash stays ledger-derived (ADR-025). Do not invent dashboard-specific balance storage.

---

## ADR-028 — Reports are read-only filtered views; drill-in reuses existing detail UIs

- **Decision:** Reports live in `src/features/reports/` with hub `/reports` driven by `getReportsPageData`. Filters use URL search params (`from`, `to`, `customerId`, `currency`, `type`, `operator`) in the same style as customer history. Drill-in routes under `/reports/*` reuse existing list/table components and entity detail pages (`/transactions/[id]`, `/hawala/[id]`, `/exchange/[id]`, `/transfers/[id]`, customer profile) with `returnTo` for back navigation.
- **Sections:** Daily totals, monthly or filtered activity, customer statement, hawala, exchange, transfers. File export (PDF/CSV) and dedicated FX gain/loss P&L are deferred.
- **Why:** Reporting must not create a parallel financial truth or posting path; operators already have trusted detail UIs.
- **Consequence:** Never post money from Reports. Prefer composing existing list/history/balance services over new aggregators that recompute balances differently. Operator filter may require loading a bounded page then filtering in memory when the underlying reader lacks `createdById`.

---

## Superseded notes

- Earlier handoff text implied customer soft-delete **releases** unique `code`/`phone` by nulling them. **Superseded by ADR-006** for customers: preserve fields + partial unique indexes so archived history remains searchable and reusable values can be used by new *active* customers.
- Roadmap / ADR text that implied day-to-day operators pick wallets on deposit/withdrawal/exchange/hawala forms is **superseded by ADR-024** (services still receive wallet IDs; UI resolves them).
- Primary-nav **Wallets** as a normal workflow item is **superseded by ADR-024 / ADR-025** (Settings admin + Business Cash Overview).
- ADR-023 text that said “customer transfer remains a separate later flow” is **superseded by ADR-026** (implemented).
- ADR-024 text that framed Customer Transfer as a future example is **superseded by ADR-026** (Transfer resolves wallets in `transferFunds`).
- Roadmap / handoff text that listed Dashboard and Reports as placeholders / "do not start" is **superseded by ADR-027 / ADR-028** (implemented as read-only modules).
