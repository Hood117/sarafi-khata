# Native desktop migration (ADR-042)

Replace **Next.js + Prisma + Node sidecar** with **Vite React SPA + Tauri commands + SQLite (rusqlite)**.

## How to run

| Command | What |
|---------|------|
| `npm run dev` | Default — React SPA + Tauri + rusqlite |
| `npm run build:desktop` | Slim NSIS installer (SPA + migrations, **no** Next tarball) |
| `npm run dev:legacy` / `build:desktop:legacy` | Deprecated Next sidecar path |

Login: `admin` / `ChangeMe123!`

## Phase status

| Phase | Status |
|-------|--------|
| 1–4 Foundation → desks | **Done** |
| 5 Cutover | **Done** — native default; backup/restore in Rust; sidecar packaging deprecated |

## Backup (native)

- Manual: Settings → Create backup
- Auto: debounced after successful `post_transaction`
- Location: `%APPDATA%\com.saraf.desktop\SarafBackups\{stamp}-{reason}\`
- Files: `saraf.db`, `saraf.db.sha256`, `backup.json`
- Restore: stages pending file → **restart app** to apply
- Retention: 50 copies per location; mirrors to other Windows drives when possible

## Remaining optional cleanup

- [ ] Retire `scripts/prepare-tauri-sidecar.mjs` + `tauri.legacy.conf.json` when unused
- [ ] Prisma seed-only (or Rust seed) without shipping Prisma client in desktop
- [ ] Settings: users / audit screens on SPA
- [ ] Measure NSIS size after first native `build:desktop`
