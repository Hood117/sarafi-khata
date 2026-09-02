# Saraf

Offline Sarafi (money exchange) Management System for Windows.

## Stack

- **Desk (shipping):** Vite React SPA (`desktop-ui/`) + Tauri 2 + rusqlite (`saraf.db` in `%APPDATA%\com.saraf.desktop\`)
- Next.js 16 + Prisma remain as **legacy / seed tooling**, not the default desk runtime

## Prerequisites

- Node.js 20+
- Rust toolchain (for Tauri desktop builds): https://rustup.rs

## Setup

```bash
cp .env.example .env
npm install
```

Default login after seed: `admin` / `ChangeMe123!`

## Scripts

| Script | Description |
| --- | --- |
| `npm run tauri -- dev` | Tauri desktop + Vite SPA on 127.0.0.1:1421 |
| `npm run dev` | Same as `tauri -- dev` |
| `npm.cmd run tauri -- dev` | Windows PowerShell if `npm.ps1` is blocked |
| `npm run dev:spa` | Vite SPA only |
| `npm run typecheck:spa` | Typecheck `desktop-ui/` |
| `npm run build:desktop` | Build Tauri NSIS installer (requires Rust) |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript `--noEmit` (root) |
| `npm test` | Unit tests (Vitest) |
| `node scripts/wipe-business-data.mjs` | Wipe shop/demo data; keep admin, currencies, Main Vault, SYSTEM wallets |

See `docs/HANDOFF.md` for architecture, completed vs pending work, and accounting rules.
