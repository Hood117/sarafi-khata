import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

/**
 * Production readiness checks — does NOT build the installer.
 * Run: npm run prepare:release
 * When ready to ship: npm run build:desktop
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readJson(rel) {
  return JSON.parse(readFileSync(path.join(root, rel), "utf8"));
}

function fail(msg) {
  console.error(`\n[prepare:release] FAIL: ${msg}`);
  process.exit(1);
}

function warn(msg) {
  console.warn(`[prepare:release] WARN: ${msg}`);
}

function ok(msg) {
  console.log(`[prepare:release] OK  ${msg}`);
}

const tauri = readJson("src-tauri/tauri.conf.json");
const pkg = readJson("package.json");
const cargoToml = readFileSync(path.join(root, "src-tauri", "Cargo.toml"), "utf8");
const cargoVer = cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1];

if (!tauri.version) fail("tauri.conf.json missing version");
if (pkg.version !== tauri.version) {
  fail(`package.json (${pkg.version}) != tauri.conf.json (${tauri.version})`);
}
if (cargoVer !== tauri.version) {
  fail(`Cargo.toml (${cargoVer}) != tauri.conf.json (${tauri.version})`);
}
ok(`Version aligned at ${tauri.version}`);

if (tauri.productName !== "Radefy Sarafi Offline") {
  warn(`productName is "${tauri.productName}" (expected Radefy Sarafi Offline)`);
} else {
  ok(`Product name: ${tauri.productName}`);
}

if (tauri.bundle?.targets !== "nsis" && tauri.bundle?.targets?.[0] !== "nsis") {
  warn(`bundle.targets = ${JSON.stringify(tauri.bundle?.targets)}`);
} else {
  ok("NSIS installer target configured");
}

const icons = tauri.bundle?.icon ?? [];
for (const icon of icons) {
  const p = path.join(root, "src-tauri", icon);
  if (!existsSync(p)) fail(`Missing icon: ${icon}`);
}
ok(`Icons present (${icons.length})`);

const csp = tauri.app?.security?.csp;
if (!csp) {
  warn("CSP is null/disabled — set app.security.csp for production");
} else {
  ok("CSP configured");
}

const licenseSrc = readFileSync(
  path.join(root, "src-tauri", "src", "license_config.rs"),
  "utf8",
);
if (licenseSrc.includes("my-secret-app-token-786")) {
  warn(
    "license_config.rs still has placeholder APP_TOKEN — rotate Worker secret before client activation",
  );
} else {
  ok("APP_TOKEN does not look like the default placeholder");
}

const loginSrc = readFileSync(
  path.join(root, "desktop-ui", "src", "pages", "login.tsx"),
  "utf8",
);
if (/useState\(["']Saraf@@["']\)/.test(loginSrc)) {
  fail("Login page still prefills username Saraf@@ — clear for client builds");
}
ok("Login username is not prefilled");

console.log("\n[prepare:release] Running SPA typecheck…");
const tsc = spawnSync(
  process.execPath,
  [
    path.join(root, "node_modules", "typescript", "bin", "tsc"),
    "--noEmit",
    "-p",
    path.join(root, "desktop-ui", "tsconfig.json"),
  ],
  { cwd: root, stdio: "inherit" },
);
if ((tsc.status ?? 1) !== 0) fail("desktop-ui typecheck failed");
ok("desktop-ui typecheck passed");

console.log(`
[prepare:release] Ready for client build (not built yet).

  Ship command (when you ask to build):
    npm run build:desktop

  Installer output (after build):
    dist/Radefy Sarafi Offline_${tauri.version}_x64-setup.exe
    dist/Saraf_${tauri.version}_x64-setup.exe  (copy alias)
    src-tauri/target/release/bundle/nsis/

  First-run desk login (give privately to client):
    Username: Saraf@@
    Password: Saraf@@!!77
    → Tell them to change the password in Settings → Users after first login.

  See docs/CLIENT_DELIVERY.md for the full handoff checklist.
`);
process.exit(0);
