# Saraf — Architecture / Product Decisions

**Last updated:** 2026-07-26 (end of Day 11 — Currency / rates / Settings)  
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
| ADR-021 | Exchange rates are master data; quote-per-base convention |
| ADR-022 | App Settings use SystemSetting keys |

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

See ADR-004, ADR-014, ADR-015, ADR-019–022.

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
- **Consequence:** Soft-archive only; `/wallets` list does not show balances (master-data CRUD only).

---

## ADR-013 — Customer wallet balances are derived on read

- **Decision:** Do not store current balance on `Wallet`. Customer profile loads rows via `getCustomerWalletBalanceRows`, bridging DB `LedgerEntry` → domain money and `createBalanceCalculator()`.
- **Display rules:**
  - No ledger lines (or no mappable lines) → show `0` in `app.baseCurrencyCode` (default `AFN`).
  - Do not call the calculator on an empty entry set (domain validation would throw).
  - Skip lines with unknown currency or invalid direction (`isLedgerDirection`).
  - Multi-currency wallets may yield one UI row per currency.
- **Why:** Keeps ADR-004 (ledger-first) intact.
- **Consequence:** Profile balances update automatically when deposit/withdrawal/adjustment/hawala post ledger lines; `/wallets` stays a CRUD screen without balance columns.

---

## ADR-014 — Posting service is the only financial write path

- **Decision:** All money movements go through `postTransaction` in `src/features/transactions/services/post-transaction.ts`.
- **Guarantees:**
  - Domain validation + `assertLedgerBalanced` (per currency) before commit.
  - One interactive `prisma.$transaction()` creates the `Transaction` (`POSTED`) and all `LedgerEntry` rows.
  - Append-only ledger; no wallet balance column updates.
- **Movement services** that only build balanced `PostTransactionInput` and call posting:
  - `depositFunds`, `withdrawFunds`, `adjustFunds`
  - `postHawalaMovement` (used by send/receive/complete hawala)
- **Public API:** `@/features/transactions` and `@/features/ledger` barrels do **not** export low-level `createTransaction` / `createLedgerEntry*` writers.
- **Why:** Prevent bypasses and keep a single integrity gate for every future exchange, transfer, and hawala flow.
- **Consequence:** New financial features must reuse `postTransaction`; never open parallel write paths.

---

## ADR-015 — Deposit / withdrawal / adjustment directions (asset convention)

- **Decision:** Under the ledger asset convention (debit +, credit −):
  - **Deposit:** DEBIT customer wallet, CREDIT cash (vault/till).
  - **Withdrawal:** CREDIT customer wallet, DEBIT cash (vault/till).
  - **Manual adjustment:** explicit DEBIT wallet + CREDIT wallet.
- **Why:** Matches existing balance calculator used on customer profiles.
- **Consequence:** Movement UIs must select a customer wallet plus a vault/till (or two wallets for adjustment); posting rejects unbalanced sets.

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

## ADR-021 — Exchange rates are master data; quote-per-base convention

- **Decision:** Exchange rates live in `src/features/exchange-rates/` with UI at `/settings/exchange-rates`. Rate means **quote units per 1 base unit** (example: base USD, quote AFN, rate `70` → `1 USD = 70 AFN`).
- **Rules:**
  - Base and quote must differ; both currencies must exist.
  - Rate must be positive; enforce decimal scale in services (max 8).
  - Active status maps to `ExchangeRate.deletedAt` (null = active) — no new column in Day 11.
  - Create/update/activate only; **no** exchange transaction calculation or posting in this slice.
- **Why:** Enter usable rates before building Currency Exchange; keep ADR-014 intact.
- **Consequence:** Future exchange flow must look up rates and still post only through `postTransaction` (optional `LedgerEntry.exchangeRateId` already supported by posting).

---

## ADR-022 — App Settings use SystemSetting keys

- **Decision:** Shop preferences persist via existing `SystemSetting` key/value rows managed by `features/settings` services/actions.
- **Keys (Day 11):**
  - `app.name` — business name (receipts / branding)
  - `app.baseCurrencyCode` — default/base currency (e.g. AFN)
  - `app.locale` — default language (`en` only for now; Dari/Pashto placeholders in UI)
- **UI:** `/settings` form + catalog links to Currencies and Exchange Rates. Receipt preference toggles are **placeholders** (not persisted yet).
- **Why:** Reuse seeded settings model; avoid new tables for simple prefs.
- **Consequence:** Changing base currency does not rewrite ledger history; it only affects defaults such as empty-balance display. Permission gate uses `settings.manage` stub.

---

## Superseded notes

- Earlier handoff text implied customer soft-delete **releases** unique `code`/`phone` by nulling them. **Superseded by ADR-006** for customers: preserve fields + partial unique indexes so archived history remains searchable and reusable values can be used by new *active* customers.
- Roadmap text that said “do not start Day 11 until UX polish is committed” is **historical** — UX polish is on `main`; Day 11 is the current uncommitted slice.
