/**
 * Windows-safe SPA "dev" server that never uses Vite's esbuild transform pipeline.
 *
 * Why: antivirus often kills esbuild.exe, which makes `vite` (dev) return errors for
 * react-dom and leaves the Tauri WebView on a blank white page.
 *
 * Approach: SWC production-style `vite build` → serve `desktop-ui/dist` on :1421,
 * rebuild on real source edits only (filtered + cooldown), then live-reload.
 */
import { spawnSync } from "node:child_process";
import {
  createReadStream,
  existsSync,
  readFileSync,
  statSync,
  watch,
} from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const viteBin = path.join(root, "node_modules", "vite", "bin", "vite.js");
const config = path.join(root, "desktop-ui", "vite.config.mjs");
const distDir = path.join(root, "desktop-ui", "dist");
const distIndex = path.join(distDir, "index.html");
const host = "127.0.0.1";
const port = 1421;

/** Only these extensions can trigger a rebuild. */
const WATCH_EXTS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".css",
  ".scss",
  ".html",
  ".json",
  ".svg",
]);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

let buildId = String(Date.now());
let building = false;
let lastBuildOk = false;
/** Ignore watch events until this timestamp (ms). Prevents rebuild loops on Windows. */
let ignoreWatchUntil = 0;
let debounceTimer = null;

function killEsbuild() {
  if (process.platform !== "win32") return;
  spawnSync("taskkill", ["/F", "/IM", "esbuild.exe", "/T"], { stdio: "ignore" });
}

function runViteBuild() {
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    killEsbuild();
    if (attempt > 1) {
      console.warn(`[dev-spa] Retrying SPA build (${attempt}/${maxAttempts})…`);
      spawnSync(
        process.execPath,
        [
          "-e",
          `Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,${Math.min(attempt, 4) * 1000})`,
        ],
        { stdio: "ignore" },
      );
    }
    const result = spawnSync(
      process.execPath,
      [viteBin, "build", "--config", config],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          ESBUILD_WORKER_THREADS: "0",
        },
      },
    );
    const combined = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    if (combined.trim()) process.stdout.write(combined);
    const ok = (result.status ?? 1) === 0 && existsSync(distIndex);
    if (ok) return true;
    const flaky =
      /service is no longer running|service was stopped|epipe|vite:define/i.test(
        combined,
      );
    if (!flaky) return false;
  }
  return false;
}

function injectLiveReload(html) {
  const snippet = `
<script>
(() => {
  let current = ${JSON.stringify(buildId)};
  async function tick() {
    try {
      const res = await fetch("/__asms_build_id", { cache: "no-store" });
      if (!res.ok) return;
      const next = (await res.text()).trim();
      if (next && current && next !== current) {
        location.reload();
        return;
      }
      current = next || current;
    } catch (_) { /* server restarting */ }
  }
  setInterval(tick, 1500);
})();
</script>`;
  if (html.includes("</body>")) {
    return html.replace("</body>", `${snippet}</body>`);
  }
  return `${html}${snippet}`;
}

function safeResolve(urlPath) {
  const decoded = decodeURIComponent((urlPath || "/").split("?")[0]);
  const rel = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const full = path.normalize(path.join(distDir, rel));
  if (!full.startsWith(distDir)) return null;
  return full;
}

function killPortOccupants(listenPort) {
  if (process.platform !== "win32") return;
  const out = spawnSync(
    "cmd.exe",
    ["/d", "/c", `netstat -ano | findstr :${listenPort}`],
    { encoding: "utf8" },
  );
  const text = `${out.stdout ?? ""}\n${out.stderr ?? ""}`;
  const pids = new Set();
  for (const line of text.split(/\r?\n/)) {
    if (!line.includes("LISTENING")) continue;
    const parts = line.trim().split(/\s+/);
    const pid = parts[parts.length - 1];
    if (/^\d+$/.test(pid) && pid !== "0" && pid !== String(process.pid)) {
      pids.add(pid);
    }
  }
  for (const pid of pids) {
    spawnSync("taskkill", ["/F", "/PID", pid, "/T"], { stdio: "ignore" });
  }
}

function startServer() {
  killPortOccupants(port);
  const server = http.createServer((req, res) => {
    const url = req.url || "/";
    if (url.startsWith("/__asms_build_id")) {
      res.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(buildId);
      return;
    }

    let filePath = safeResolve(url);
    if (!filePath) {
      res.writeHead(403).end("Forbidden");
      return;
    }

    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
      filePath = distIndex;
    }

    if (!existsSync(filePath)) {
      res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("SPA dist not ready yet. Waiting for build…");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || "application/octet-stream";

    if (ext === ".html") {
      try {
        const html = injectLiveReload(readFileSync(filePath, "utf8"));
        res.writeHead(200, {
          "Content-Type": type,
          "Cache-Control": "no-store",
        });
        res.end(html);
        return;
      } catch (err) {
        res.writeHead(500).end(String(err));
        return;
      }
    }

    res.writeHead(200, {
      "Content-Type": type,
      "Cache-Control": "no-cache",
    });
    createReadStream(filePath).pipe(res);
  });

  server.on("error", (err) => {
    console.error(`[dev-spa] Failed to bind http://${host}:${port}/ — ${err.message}`);
    process.exit(1);
  });

  server.listen(port, host, () => {
    console.log(`[dev-spa] Serving desktop-ui/dist at http://${host}:${port}/`);
    console.log(
      "[dev-spa] esbuild-free mode — edits under desktop-ui/src rebuild once (no loop).",
    );
  });

  return server;
}

function buildOnce(reason) {
  if (building) return lastBuildOk;
  building = true;
  // Drop all watch noise for the whole build + cooldown window.
  ignoreWatchUntil = Date.now() + 60_000;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  console.log(`[dev-spa] Building SPA (${reason})…`);
  const ok = runViteBuild();
  lastBuildOk = ok;
  if (ok) {
    buildId = String(Date.now());
    console.log(`[dev-spa] Build OK (id=${buildId}) — watching paused 4s`);
  } else {
    console.error(
      "[dev-spa] Build failed — WebView may stay blank until the next successful build.",
    );
  }

  // Windows often emits a storm of watch events right after vite writes dist /
  // while antivirus scans. Ignore them so we don't rebuild forever.
  ignoreWatchUntil = Date.now() + 4000;
  building = false;
  return ok;
}

function isWatchedSourceFile(filename) {
  if (!filename) return false;
  const base = path.basename(filename);
  if (base.startsWith(".") || base.endsWith("~") || base.endsWith(".tmp")) {
    return false;
  }
  // Never rebuild because of build output or caches.
  const normalized = filename.replace(/\\/g, "/").toLowerCase();
  if (
    normalized.includes("/dist/") ||
    normalized.includes("node_modules") ||
    normalized.includes(".vite") ||
    normalized.includes(".asms-")
  ) {
    return false;
  }
  const ext = path.extname(filename).toLowerCase();
  return WATCH_EXTS.has(ext);
}

function watchSources() {
  const watchRoots = [
    path.join(root, "desktop-ui", "src"),
    path.join(root, "desktop-ui", "index.html"),
    path.join(root, "src", "lib", "i18n"),
  ];

  // Ignore the initial flood Windows sends when watch() is attached.
  ignoreWatchUntil = Date.now() + 2500;

  const schedule = (label) => {
    if (building || Date.now() < ignoreWatchUntil) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      if (building || Date.now() < ignoreWatchUntil) return;
      buildOnce(label);
    }, 900);
  };

  for (const target of watchRoots) {
    if (!existsSync(target)) continue;
    try {
      const recursive = statSync(target).isDirectory();
      watch(target, { recursive }, (_event, filename) => {
        if (building || Date.now() < ignoreWatchUntil) return;
        if (filename && !isWatchedSourceFile(String(filename))) return;
        schedule(filename ? `change:${filename}` : "change");
      });
      console.log(`[dev-spa] Watching ${path.relative(root, target)}`);
    } catch (err) {
      console.warn(`[dev-spa] Could not watch ${target}:`, err);
    }
  }
}

if (!existsSync(viteBin)) {
  console.error("[dev-spa] vite is not installed. Run npm install.");
  process.exit(1);
}

killEsbuild();

const initialOk =
  existsSync(distIndex) &&
  (() => {
    try {
      return Date.now() - statSync(distIndex).mtimeMs < 30 * 60 * 1000;
    } catch {
      return false;
    }
  })();

if (initialOk) {
  console.log("[dev-spa] Reusing recent desktop-ui/dist for faster startup.");
  lastBuildOk = true;
  buildId = String(statSync(distIndex).mtimeMs);
} else {
  const ok = buildOnce("startup");
  if (!ok) {
    console.error("[dev-spa] Initial SPA build failed.");
    process.exit(1);
  }
}

const server = startServer();
watchSources();

function shutdown() {
  try {
    server.close();
  } catch {
    /* ignore */
  }
  killEsbuild();
  process.exit(0);
}

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, shutdown);
}
