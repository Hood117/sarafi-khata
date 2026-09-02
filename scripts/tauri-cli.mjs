import { spawnSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Wrapper around `@tauri-apps/cli`.
 * - Pins CARGO_TARGET_DIR (poisoned/sandbox values cause Windows exit 259)
 * - On Windows, runs through run-tauri-msvc.bat so MSVC `rc.exe` / `link.exe`
 *   are on PATH (without them, tauri-build icon embedding fails with exit 259)
 * - Kills leftover saraf.exe and retries once after cleaning build-script dirs
 *   when Windows returns STILL_ACTIVE (259)
 * - Recovers Windows NSIS builds when makensis hits file locks
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appVersion = JSON.parse(
  readFileSync(path.join(root, "src-tauri", "tauri.conf.json"), "utf8"),
).version;
const args = process.argv.slice(2);
const isBuild = args[0] === "build";
const isDev = args[0] === "dev";
const localTargetDir = path.join(root, "src-tauri", "target");
const windowsRunner = path.join(root, "scripts", "run-tauri-msvc.bat");

function killMakensis() {
  if (process.platform !== "win32") return;
  spawnSync("taskkill", ["/F", "/IM", "makensis.exe"], { stdio: "ignore" });
}

function killSarafApp() {
  if (process.platform !== "win32") return;
  spawnSync("taskkill", ["/F", "/IM", "saraf.exe", "/T"], { stdio: "ignore" });
}

/** Stuck cargo build-script children often leave Windows STILL_ACTIVE (259). */
function killStuckBuildScripts() {
  if (process.platform !== "win32") return;
  for (const image of [
    "build-script-build.exe",
    "build-script-main.exe",
    "rc.exe",
  ]) {
    spawnSync("taskkill", ["/F", "/IM", image, "/T"], { stdio: "ignore" });
  }
}

function sanitizeCargoEnv(env) {
  const next = { ...env };

  // Always pin the target dir. A trailing space (`set VAR=value &&`), Cursor
  // sandbox cache paths, or empty values make Tauri's build script exit 259.
  next.CARGO_TARGET_DIR = localTargetDir;

  // Cap parallel MSVC build-scripts on Windows — high job counts race and
  // surface as exit 259 (STILL_ACTIVE) from crates like `ring` / `tauri`.
  // Use 1 job for maximum stability on AV-heavy machines.
  if (process.platform === "win32") {
    next.CARGO_BUILD_JOBS = next.CARGO_BUILD_JOBS || "1";
  }

  // Drop sandbox / temp cargo homes that confuse MSVC resource embedding.
  const poisoned = ["cursor-sandbox-cache", "cargo-target"];
  for (const key of ["CARGO_HOME", "RUSTC_BOOTSTRAP"]) {
    const val = next[key];
    if (typeof val === "string" && poisoned.some((p) => val.includes(p))) {
      delete next[key];
    }
  }

  // Trim accidental whitespace on cargo-related paths (Windows set VAR=x && bug).
  for (const key of Object.keys(next)) {
    if (
      (key.startsWith("CARGO_") || key === "RUSTUP_HOME") &&
      typeof next[key] === "string"
    ) {
      next[key] = next[key].trim();
    }
  }
  next.CARGO_TARGET_DIR = localTargetDir;

  if (typeof next.PATH === "string") {
    next.PATH = next.PATH.replace(/;;+/g, ";");
  }

  return next;
}

function cleanSarafBuildArtifacts() {
  const buildRoots = [
    path.join(localTargetDir, "debug", "build"),
    path.join(localTargetDir, "release", "build"),
  ];
  // Windows 259 / STILL_ACTIVE commonly hits these crates' build scripts.
  const prefixes = [
    "saraf-",
    "tauri-",
    "tauri-build-",
    "tauri-winres-",
    "tauri-plugin-",
    "tauri-runtime-",
    "embed-resource-",
    "vswhom-",
    "vswhom-sys-",
    // rustls → ring MSVC build-script often returns STILL_ACTIVE (259) when raced.
    "ring-",
    "rustls-",
  ];
  for (const buildRoot of buildRoots) {
    if (!existsSync(buildRoot)) continue;
    for (const name of readdirSync(buildRoot)) {
      if (!prefixes.some((p) => name.startsWith(p))) continue;
      try {
        rmSync(path.join(buildRoot, name), { recursive: true, force: true });
      } catch {
        /* locked — retry will still help next time */
      }
    }
  }
  for (const rel of [
    path.join("debug", "saraf.exe"),
    path.join("debug", "saraf.pdb"),
    path.join("debug", "saraf_lib.dll"),
    path.join("debug", "saraf_lib.dll.lib"),
    path.join("debug", "saraf_lib.pdb"),
  ]) {
    try {
      rmSync(path.join(localTargetDir, rel), { force: true });
    } catch {
      /* ignore */
    }
  }
}

function resolveWindowsCmd() {
  // Git Bash / MINGW often cannot resolve bare `cmd.exe` (ENOENT). Prefer
  // ComSpec, then the System32 path that always exists on Windows.
  const candidates = [
    process.env.ComSpec,
    path.join(
      process.env.SystemRoot || "C:\\Windows",
      "System32",
      "cmd.exe",
    ),
    "cmd.exe",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0] ?? "cmd.exe";
}

function runTauriOnce(tauriArgs) {
  const env = sanitizeCargoEnv(process.env);

  if (process.platform === "win32") {
    // cmd /c bat args… — shell:true quoting is unreliable with paths that
    // contain spaces (Program Files / vcvars).
    const cmd = resolveWindowsCmd();
    const result = spawnSync(cmd, ["/d", "/c", windowsRunner, ...tauriArgs], {
      cwd: root,
      stdio: "inherit",
      env,
    });

    if (result.error) {
      console.error(
        `Failed to start Tauri via ${cmd}: ${result.error.message}`,
      );
      console.error(
        "Tip: from Git Bash use `npm run dev` (or `npm run tauri -- dev`).",
      );
    }

    return result;
  }

  return spawnSync("npx", ["--no-install", "tauri", ...tauriArgs], {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env,
  });
}

/** Windows STILL_ACTIVE (259) = build-script child still locked / not waited.
 *  Cargo often surfaces that as exit 101 ("failed to run custom build command"). */
function shouldRetryWindowsBuild(result) {
  if (process.platform !== "win32") return false;
  const status = result.status ?? 1;
  // Only retry cargo/build-script STILL_ACTIVE failures — not makensis-only exits.
  return status === 259 || status === -259 || status === 101;
}

function runTauri(tauriArgs) {
  killSarafApp();
  killStuckBuildScripts();
  let result = runTauriOnce(tauriArgs);
  if (!shouldRetryWindowsBuild(result)) return result;

  // Exit 259 / STILL_ACTIVE often needs several clean retries under antivirus.
  const maxRetries = isDev ? 4 : 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.warn(
      `\n[tauri-cli] Windows build failed (often exit 259 / STILL_ACTIVE inside a crate build script). Cleaning artifacts and retrying (${attempt}/${maxRetries})…\n`,
    );
    killSarafApp();
    killMakensis();
    killStuckBuildScripts();
    cleanSarafBuildArtifacts();
    // Brief pause so Defender / Smadav / file locks release.
    spawnSync(
      process.execPath,
      ["-e", "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,2500)"],
      { stdio: "ignore" },
    );
    result = runTauriOnce(tauriArgs);
    if (!shouldRetryWindowsBuild(result)) return result;
  }
  return result;
}

function salvageAndPackage() {
  const packageScript = path.join(root, "scripts", "package-desktop.mjs");
  const result = spawnSync(process.execPath, [packageScript], {
    cwd: root,
    stdio: "inherit",
    env: sanitizeCargoEnv(process.env),
  });
  return result.status === 0;
}

if (isDev) {
  const result = runTauri(args);
  process.exit(result.status ?? 1);
}

if (!isBuild) {
  if (args.length === 0) {
    console.error(
      "Usage: npm run dev   OR   npm run tauri -- dev   OR   npm run tauri -- build",
    );
    console.error(
      "Note: `npm run tauri --dev` does not pass `dev` to Tauri (npm eats --dev).",
    );
    process.exit(1);
  }
  const result = runTauri(args);
  process.exit(result.status ?? 1);
}

killMakensis();
const buildResult = runTauri(args);
killMakensis();

const packaged = salvageAndPackage();
const setup = path.join(root, "dist", `Saraf_${appVersion}_x64-setup.exe`);
const asmsSetup = path.join(root, "dist", `ASMS_${appVersion}_x64-setup.exe`);
const portable = path.join(root, "dist", "saraf-portable", "saraf.exe");
const releaseExe = path.join(localTargetDir, "release", "saraf.exe");

const setupPath = existsSync(setup)
  ? setup
  : existsSync(asmsSetup)
    ? asmsSetup
    : null;
const setupOk =
  !!setupPath && existsSync(setupPath) && statSync(setupPath).size > 1_000_000;
const portableOk = existsSync(portable) && existsSync(releaseExe);
const releaseOk = existsSync(releaseExe);

// Tauri's embedded makensis often fails with locks while cargo already built
// saraf.exe; package-desktop.mjs recovers the NSIS installer in that case.
if (releaseOk && packaged && (setupOk || portableOk)) {
  if ((buildResult.status ?? 1) !== 0) {
    console.log(
      "\nTauri makensis reported a failure; package-desktop recovered the installer from the freshly built saraf.exe.",
    );
  }
  console.log(`Installer: ${setupOk ? setupPath : "(see portable)"}`);
  console.log(`Portable:  ${path.join(root, "dist", "saraf-portable")}`);
  process.exit(0);
}

if (!releaseOk) {
  console.error(
    "\n[tauri-cli] Release saraf.exe was not produced — build failed.",
  );
}

process.exit(buildResult.status ?? 1);
