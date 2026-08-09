# Saraf

Offline Sarafi (money exchange) Management System for Windows.

## Stack

- Next.js 16 (App Router) + TypeScript + React 19
- Tailwind CSS 4 + shadcn/ui
- Tauri 2 desktop shell (WebView + local Next sidecar)
- Prisma 7 + SQLite via `better-sqlite3` (WAL)

## Prerequisites

- Node.js 20+
- Rust toolchain (for Tauri desktop builds): https://rustup.rs

## Setup

```bash
cp .env.example .env
npm install
npx prisma migrate deploy
npm run db:seed
```

Default login after seed: `admin` / `ChangeMe123!`

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Tauri desktop app (WebView + Next on 127.0.0.1:3000) |
| `npm run dev:web` | Next.js only (optional) |
| `npm run build` | Generate Prisma client and build Next.js |
| `npm run build:desktop` | Build Tauri NSIS installer (requires Rust) |
| `npm run start` | Start production Next server |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript `--noEmit` |
| `npm test` | Unit tests (Vitest) |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:seed` | Seed admin, currencies, wallets, settings |
| `npm run db:studio` | Open Prisma Studio |

## Architecture rules

1. `postTransaction` is the only financial write path.
2. Ledger (`LedgerEntry`) is money truth; balances are derived.
3. Append-only ledger — void via reversing entries.
4. Soft-archive master data; offline-only (no cloud money APIs).
5. Audit Log is activity history — never balances.

See `docs/HANDOFF.md`, `docs/ROADMAP.md`, and `docs/DECISIONS.md`.
