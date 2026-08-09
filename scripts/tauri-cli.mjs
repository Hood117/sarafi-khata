import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Wrapper around `@tauri-apps/cli`.
 * - Pins CARGO_TARGET_DIR (poisoned/sandbox values cause Windows exit 259)
 * - On Windows, runs through run-tauri-msvc.bat so MSVC `rc.exe` / `link.exe`
 *   are on PATH (without them, tauri-build icon embedding fails with exit 259)
 * - Recovers Windows NSIS builds when makensis hits file locks
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const isBuild = args[0] === "build";
const isDev = args[0] === "dev";
const localTargetDir = path.join(root, "src-tauri", "target");
const windowsRunner = path.join(root, "scripts", "run-tauri-msvc.bat");

function killMakensis() {
  if (process.platform !== "win32") return;
  spawnSync("taskkill", ["/F", "/IM", "makensis.exe"], { stdio: "ignore" });
}

function sanitizeCargoEnv(env) {
  const next = { ...env };

  // Always pin the target dir. A trailing space (`set VAR= &&`), Cursor sandbox
  // cache paths, or empty values make Tauri's build script exit 259 on Windows.
  next.CARGO_TARGET_DIR = localTargetDir;

  if (typeof next.PATH === "string") {
    next.PATH = next.PATH.replace(/;;+/g, ";");
  }

  return next;
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

function runTauri(tauriArgs) {
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
const setup = path.join(root, "dist", "Saraf_0.1.0_x64-setup.exe");
const portable = path.join(root, "dist", "saraf-portable", "saraf.exe");

// Native SPA installer is ~5 MiB; do not require the old ~250 MiB sidecar size.
const setupOk = existsSync(setup) && statSync(setup).size > 1_000_000;
const portableOk = existsSync(portable);

if (setupOk || portableOk) {
  if ((buildResult.status ?? 1) !== 0 || !packaged) {
    console.log(
      "\nTauri/makensis reported a failure, but the desktop package was recovered successfully.",
    );
  }
  console.log(`Installer: ${setupOk ? setup : "(see portable)"}`);
  console.log(`Portable:  ${path.join(root, "dist", "saraf-portable")}`);
  // Prefer success when we have a usable installer or portable app.
  process.exit(setupOk || portableOk ? 0 : buildResult.status ?? 1);
}

process.exit(buildResult.status ?? 1);
