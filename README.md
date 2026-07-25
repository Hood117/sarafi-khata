# Saraf

Offline Sarafi Management System for Windows.

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS + shadcn/ui
- Tauri (desktop shell)
- Prisma + SQLite (via LibSQL adapter)

## Prerequisites

- Node.js 20+
- Rust toolchain (for Tauri desktop builds): https://rustup.rs

## Setup

```bash
cp .env.example .env
npm install
```

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start Next.js development server |
| `npm run dev:desktop` | Start Tauri desktop app (dev) |
| `npm run build` | Generate Prisma client and build Next.js for production |
| `npm run build:desktop` | Build the Tauri desktop installer (requires Rust) |
| `npm run start` | Start the production Next.js server |
| `npm run lint` | Run ESLint |
| `npm run format` | Format with Prettier |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:studio` | Open Prisma Studio |

## Notes

- This repository currently contains the project foundation only.
- No business features, authentication, or database models yet.
- Desktop production packaging uses Tauri static export mode when `TAURI_ENV_PLATFORM` is set.
- Normal `npm run build` keeps a server-capable Next.js build for Prisma.