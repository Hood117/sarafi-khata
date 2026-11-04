import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * After `tauri build` (native SPA by default):
 * 1) Build portable folder under dist/
 * 2) Re-run makensis when Tauri's bundler fails with exit 259 / file locks
 *
 * Legacy Next sidecar (`next-server.tar.gz`) is optional — only attached when
 * present (SARAF_LEGACY / build:desktop:prepare). Native SPA installers are ~5MB.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appVersion = JSON.parse(
  readFileSync(path.join(root, "src-tauri", "tauri.conf.json"), "utf8"),
).version;
const archive = path.join(root, "src-tauri", "resources", "next-server.tar.gz");
const splash = path.join(root, "src-tauri", "resources", "splash");
const exe = path.join(root, "src-tauri", "target", "release", "saraf.exe");
const distPortable = path.join(root, "dist", "saraf-portable");
const releaseResources = path.join(
  root,
  "src-tauri",
  "target",
  "release",
  "resources",
);
const nsiPath = path.join(
  root,
  "src-tauri",
  "target",
  "release",
  "nsis",
  "x64",
  "installer.nsi",
);
const nsisOutput = path.join(
  root,
  "src-tauri",
  "target",
  "release",
  "nsis",
  "x64",
  "nsis-output.exe",
);
const bundleSetup = path.join(
  root,
  "src-tauri",
  "target",
  "release",
  "bundle",
  "nsis",
  `Radefy Sarafi Offline_${appVersion}_x64-setup.exe`,
);
const distSetup = path.join(root, "dist", `Saraf_${appVersion}_x64-setup.exe`);
const distSetupAsms = path.join(
  root,
  "dist",
  `Radefy Sarafi Offline_${appVersion}_x64-setup.exe`,
);
// Prefer Tauri's NSIS — tools/nsis often returns exit 259 on this host.
const makensisCandidates = [
  path.join(process.env.LOCALAPPDATA || "", "tauri", "NSIS", "makensis.exe"),
  path.join(root, "tools", "nsis", "makensis.exe"),
];
const makensis =
  makensisCandidates.find((candidate) => existsSync(candidate)) ||
  makensisCandidates[0];
const nsisSupportDir = path.join(root, "scripts", "nsis");

/** Native SPA setup is ~5 MiB; legacy+sidecar is hundreds of MiB. */
const MIN_INSTALLER_BYTES = 1_000_000;

function mustExist(filePath, label) {
  if (!existsSync(filePath)) {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
}

function killMakensis() {
  if (process.platform !== "win32") return;
  spawnSync("taskkill", ["/F", "/IM", "makensis.exe"], { stdio: "ignore" });
}

function writeAppDir(appDir, includeSidecar) {
  mkdirSync(path.join(appDir, "resources"), { recursive: true });
  copyFileSync(exe, path.join(appDir, "saraf.exe"));
  if (includeSidecar) {
    copyFileSync(archive, path.join(appDir, "resources", "next-server.tar.gz"));
    copyFileSync(archive, path.join(appDir, "next-server.tar.gz"));
  }
  if (existsSync(splash)) {
    rmSync(path.join(appDir, "resources", "splash"), {
      recursive: true,
      force: true,
    });
    cpSync(splash, path.join(appDir, "resources", "splash"), {
      recursive: true,
    });
  }
  // Copy any other release resources Tauri already staged (e.g. migrations).
  if (existsSync(releaseResources)) {
    cpSync(releaseResources, path.join(appDir, "resources"), {
      recursive: true,
      force: true,
    });
  }
}

function sleepMs(ms) {
  if (process.platform !== "win32") {
    spawnSync("sleep", [String(Math.ceil(ms / 1000))], { stdio: "ignore" });
    return;
  }
  spawnSync(
    "cmd.exe",
    ["/c", `ping 127.0.0.1 -n ${Math.max(2, Math.ceil(ms / 1000) + 1)} >nul`],
    {
      stdio: "ignore",
      windowsHide: true,
    },
  );
}

function injectSidecarIntoNsi(nsi) {
  if (!existsSync(archive) || nsi.includes("next-server.tar.gz")) {
    return nsi;
  }

  const archiveEscaped = archive.replace(/\\/g, "\\\\");
  let next = nsi.replace(
    /File \/a "\/oname=resources\\splash\\index\.html" "[^"]+"/g,
    (match) =>
      `${match}\n    File /a "/oname=resources\\next-server.tar.gz" "${archiveEscaped}"`,
  );

  if (!next.includes("next-server.tar.gz")) {
    next = next.replace(
      'CreateDirectory "$INSTDIR\\resources\\splash"',
      `CreateDirectory "$INSTDIR\\resources\\splash"\n    File /a "/oname=resources\\next-server.tar.gz" "${archiveEscaped}"`,
    );
  }

  if (!next.includes('Delete "$INSTDIR\\resources\\next-server.tar.gz"')) {
    next = next.replace(
      'Delete "$INSTDIR\\resources\\splash\\index.html"',
      `Delete "$INSTDIR\\resources\\splash\\index.html"\n    Delete "$INSTDIR\\resources\\next-server.tar.gz"`,
    );
  }

  if (next !== nsi) {
    console.log("Injected next-server.tar.gz into installer.nsi");
  }
  return next;
}

function stageNsisSupportFiles() {
  if (!existsSync(nsiPath)) return;
  const destDir = path.dirname(nsiPath);
  for (const name of ["English.nsh", "FileAssociation.nsh"]) {
    const src = path.join(nsisSupportDir, name);
    const dest = path.join(destDir, name);
    if (existsSync(src)) {
      copyFileSync(src, dest);
    }
  }
}

function rebuildNsisInstaller() {
  if (!existsSync(nsiPath)) {
    console.warn("No installer.nsi yet; skip NSIS rebuild.");
    return false;
  }

  stageNsisSupportFiles();

  let nsi = readFileSync(nsiPath, "utf8");
  nsi = injectSidecarIntoNsi(nsi);

  if (/SetCompressor\s+lzma/i.test(nsi)) {
    nsi = nsi.replace(
      /SetCompressor\s+\/SOLID\s+lzma/gi,
      "SetCompressor /SOLID zlib",
    );
    nsi = nsi.replace(/SetCompressor\s+lzma/gi, "SetCompressor /SOLID zlib");
    console.log("Switched NSIS compressor to zlib");
  }

  writeFileSync(nsiPath, nsi, "utf8");

  if (!existsSync(makensis)) {
    console.warn(`makensis not found at ${makensis}`);
    return false;
  }

  killMakensis();
  sleepMs(1000);
  if (existsSync(nsisOutput)) {
    try {
      rmSync(nsisOutput, { force: true });
    } catch {
      // ignore lock
    }
  }

  console.log(`Running makensis (${makensis})…`);
  const result = spawnSync(
    makensis,
    ["-INPUTCHARSET", "UTF8", "-OUTPUTCHARSET", "UTF8", "-V2", nsiPath],
    {
      cwd: path.dirname(nsiPath),
      stdio: "inherit",
      windowsHide: true,
      env: process.env,
    },
  );

  // makensis on this host can exit oddly (259) while still flushing the output.
  const deadline = Date.now() + 180_000;
  let lastSize = -1;
  let stableHits = 0;
  while (Date.now() < deadline) {
    if (existsSync(nsisOutput)) {
      const size = statSync(nsisOutput).size;
      if (size > MIN_INSTALLER_BYTES && size === lastSize) {
        stableHits += 1;
        if (stableHits >= 3) break;
      } else {
        stableHits = 0;
      }
      lastSize = size;
    }
    sleepMs(1000);
  }

  if (
    !existsSync(nsisOutput) ||
    statSync(nsisOutput).size < MIN_INSTALLER_BYTES
  ) {
    console.warn(
      `NSIS output missing/incomplete (exit=${result.status}, size=${existsSync(nsisOutput) ? statSync(nsisOutput).size : 0})`,
    );
    return false;
  }

  mkdirSync(path.dirname(bundleSetup), { recursive: true });
  copyFileSync(nsisOutput, bundleSetup);
  mkdirSync(path.dirname(distSetup), { recursive: true });
  copyFileSync(nsisOutput, distSetup);
  copyFileSync(nsisOutput, distSetupAsms);
  console.log(
    `Installer ready: ${distSetup} (${(statSync(distSetup).size / 1024 / 1024).toFixed(1)} MiB)`,
  );
  console.log(`Also: ${distSetupAsms}`);
  return true;
}

mustExist(exe, "saraf.exe (run tauri build first)");

const includeSidecar = existsSync(archive);
if (!includeSidecar) {
  console.log(
    "No next-server.tar.gz — packaging native SPA (no Node sidecar).",
  );
}

mkdirSync(releaseResources, { recursive: true });
if (includeSidecar) {
  copyFileSync(archive, path.join(releaseResources, "next-server.tar.gz"));
}
if (existsSync(splash)) {
  rmSync(path.join(releaseResources, "splash"), {
    recursive: true,
    force: true,
  });
  cpSync(splash, path.join(releaseResources, "splash"), {
    recursive: true,
  });
}

rmSync(distPortable, { recursive: true, force: true });
writeAppDir(distPortable, includeSidecar);

const localInstall = path.join(process.env.LOCALAPPDATA || "", "Saraf");
if (localInstall && existsSync(path.join(localInstall, "saraf.exe"))) {
  try {
    writeAppDir(localInstall, includeSidecar);
    console.log(`Updated installed app: ${localInstall}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `Could not update installed app at ${localInstall} (close Saraf if it is running): ${msg}`,
    );
  }
}

const nsisOk = rebuildNsisInstaller();

const zipPath = path.join(root, "dist", "Saraf-portable.zip");
if (existsSync(zipPath)) {
  rmSync(zipPath, { force: true });
}
// Avoid `tar` here: Git Bash GNU tar treats "E:..." as a remote host, and
// Windows bsdtar rejects --force-local. Compress-Archive is reliable on win32.
if (process.platform === "win32") {
  execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      `Compress-Archive -Path ${JSON.stringify(distPortable)} -DestinationPath ${JSON.stringify(zipPath)} -Force`,
    ],
    { stdio: "inherit" },
  );
} else {
  execFileSync(
    "tar",
    [
      "-a",
      "-c",
      "-f",
      zipPath,
      "-C",
      path.join(root, "dist"),
      "saraf-portable",
    ],
    { stdio: "inherit" },
  );
}

console.log(`Portable app: ${distPortable}`);
console.log(`Portable zip: ${zipPath}`);
if (!nsisOk && !existsSync(distSetup)) {
  console.warn(
    "Installer was not produced. Portable package is still available.",
  );
  process.exit(1);
}
