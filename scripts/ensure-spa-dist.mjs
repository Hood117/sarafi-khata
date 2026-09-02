/**
 * Tauri `beforeBuildCommand` helper.
 *
 * `npm run build:desktop` already runs `build:spa` once. Re-running Vite
 * immediately after often crashes Windows esbuild (EPIPE / "service is no
 * longer running") inside Rollup's commonjs resolver. Reuse a fresh dist
 * when present; otherwise build once.
 */
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const indexHtml = path.join(root, "desktop-ui", "dist", "index.html");
const maxAgeMs = 30 * 60 * 1000; // 30 minutes

function distIsFresh() {
  if (!existsSync(indexHtml)) return false;
  try {
    const st = statSync(indexHtml);
    if (st.size < 200) return false;
    return Date.now() - st.mtimeMs < maxAgeMs;
  } catch {
    return false;
  }
}

if (distIsFresh()) {
  console.log(
    `[ensure-spa-dist] Reusing desktop-ui/dist (built ${Math.round((Date.now() - statSync(indexHtml).mtimeMs) / 1000)}s ago).`,
  );
  process.exit(0);
}

console.log("[ensure-spa-dist] Building SPA…");
const result = spawnSync(process.execPath, [path.join(root, "scripts", "build-spa.mjs")], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});
process.exit(result.status ?? 1);
