# ASMS client delivery checklist

Product: **ASMS** (Afghan Sarafi Management System)  
Ship path: Vite SPA (`desktop-ui`) + Tauri 2 NSIS installer  
Do **not** use `build:desktop:legacy` for clients (Next sidecar).

## Before you ask to build

1. Run readiness checks (does **not** build the installer):

   ```bash
   npm run prepare:release
   ```

2. Confirm version in these files matches (currently **1.0.0**):
   - `package.json`
   - `src-tauri/Cargo.toml`
   - `src-tauri/tauri.conf.json`

3. License (activation):
   - Worker URL + `APP_TOKEN` live in `src-tauri/src/license_config.rs`
   - Cloudflare Worker secret `APP_TOKEN` must match that value
   - Issue a license key for the client (`npm run license:issue` / Worker dashboard)

4. Branding:
   - Icons under `src-tauri/icons/` are what the installer and exe use
   - Window title / product name: **ASMS**

5. First-run admin (give **privately**, not in the installer UI):
   - Username: `Saraf@@`
   - Password: `Saraf@@!!77`
   - Instruct the client to change the password under **Settings → Users** after first login

## Build (only when ready)

```bash
npm run build:desktop
```

Requires: Node.js, Rust toolchain, Windows NSIS (Tauri usually downloads it).

### WebView2 (bundled offline)

The NSIS installer embeds Microsoft’s **offline WebView2 Runtime** installer
(`bundle.windows.webviewInstallMode = offlineInstaller`).

- New PCs can install ASMS **without internet** for WebView2.
- If WebView2 is already present, the installer skips that step.
- Expect the setup `.exe` to grow by roughly **~120–130 MB**.

### Outputs

| Artifact | Typical path |
|----------|----------------|
| NSIS setup | `dist/ASMS_<version>_x64-setup.exe` |
| Alias copy | `dist/Saraf_<version>_x64-setup.exe` |
| Raw exe | `src-tauri/target/release/saraf.exe` |

## Client PC — what is needed

### Already in the installer (nothing else to download for these)

- ASMS app (exe + UI + migrations + splash)
- **WebView2 Runtime** (offline package; installed only if missing)

### OS / hardware (not inside the ASMS setup)

| Need | Notes |
|------|--------|
| Windows 10/11 **64-bit** | Target platform for the desk build |
| Printer drivers | Receipt/thermal printer vendor drivers if they print |
| Fingerprint reader drivers | Only if they use fingerprint; install the device maker’s SDK/drivers |

### Hand to the client separately (not in the installer UI)

- [ ] `ASMS_<version>_x64-setup.exe`
- [ ] License activation key (separate channel)
- [ ] First-run username/password (separate channel)
- [ ] Short note: offline desktop app; change admin password; activate license when prompted

## Optional later

- Authenticode code signing (reduces SmartScreen warnings)
- Auto-updater (`plugins.updater`) for remote updates
- Rotate `APP_TOKEN` if the placeholder was ever shared publicly
- VC++ redistributable only if a clean PC hits a missing-DLL error (most Win10/11 desks already have it)

## Do not ship

- Dev database with test/perf seed data (`npm run db:seed:perf`)
- Legacy Next installer (`build:desktop:legacy`)
- Source tree / `.env` with secrets
