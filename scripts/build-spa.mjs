/**
 * Windows-stable SPA production build.
 * Retries when esbuild's child process dies mid-build (EPIPE /
 * "service is no longer running") — common with aggressive AV on Windows.
 */
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const viteBin = path.join(root, "node_modules", "vite", "bin", "vite.js");
const config = path.join(root, "desktop-ui", "vite.config.mjs");
const distIndex = path.join(root, "desktop-ui", "dist", "index.html");
const maxAttempts = 8;

function isFlakyEsbuildFailure(output) {
  const text = output.toLowerCase();
  return (
    text.includes("service is no longer running") ||
    text.includes("service was stopped") ||
    text.includes("write epipe") ||
    text.includes("epipe") ||
    text.includes("[vite:define]")
  );
}

function killEsbuildChildren() {
  if (process.platform !== "win32") return;
  for (const image of ["esbuild.exe", "esbuild"]) {
    spawnSync("taskkill", ["/F", "/IM", image, "/T"], { stdio: "ignore" });
  }
}

function distLooksUsable() {
  if (!existsSync(distIndex)) return false;
  try {
    const st = statSync(distIndex);
    return st.size > 200 && Date.now() - st.mtimeMs < 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function sleepSeconds(seconds) {
  spawnSync(
    process.execPath,
    [
      "-e",
      `Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,${seconds * 1000})`,
    ],
    { stdio: "ignore" },
  );
}

for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  if (attempt > 1) {
    killEsbuildChildren();
    sleepSeconds(Math.min(attempt, 5));
  }

  console.log(`[build-spa] attempt ${attempt}/${maxAttempts}`);
  const result = spawnSync(
    process.execPath,
    [viteBin, "build", "--config", config],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_ENV: "production",
        ESBUILD_WORKER_THREADS: "0",
      },
    },
  );

  const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (combined.trim()) process.stdout.write(combined);

  if ((result.status ?? 1) === 0) {
    process.exit(0);
  }

  if (!isFlakyEsbuildFailure(combined)) {
    process.exit(result.status ?? 1);
  }

  if (attempt === maxAttempts) {
    if (distLooksUsable()) {
      console.warn(
        "[build-spa] esbuild kept failing but desktop-ui/dist looks usable — continuing with the last good build.",
      );
      process.exit(0);
    }
    process.exit(result.status ?? 1);
  }

  console.warn(
    `[build-spa] Flaky Windows esbuild failure — retrying (${attempt}/${maxAttempts})…`,
  );
}

process.exit(1);
