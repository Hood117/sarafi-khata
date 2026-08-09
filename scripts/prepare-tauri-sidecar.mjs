import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * DEPRECATED (ADR-042 Phase 5): Next.js Node sidecar packaging.
 *
 * Default desktop builds use Vite SPA + rusqlite and do NOT call this script.
 * Only used by `npm run build:desktop:legacy` / `dev:legacy`.
 * Remove this file (and next-server.tar.gz) once legacy is retired.
 *
 * Prepare a single archive for Tauri resources.
 * Includes a seeded SQLite template so desktop login works on first launch.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standaloneDir = path.join(root, ".next", "standalone");
const staticDir = path.join(root, ".next", "static");
const publicDir = path.join(root, "public");
const resourcesDir = path.join(root, "src-tauri", "resources");
const archivePath = path.join(resourcesDir, "next-server.tar.gz");
const junctionPath = path.join(resourcesDir, "next-server");
const templateDb = path.join(root, "prisma", "saraf-template.db");
const desktopEntrySrc = path.join(root, "scripts", "desktop-entry.cjs");

function removeJunctionOrDir(dirPath) {
  if (!existsSync(dirPath)) {
    return;
  }
  if (process.platform === "win32") {
    try {
      execFileSync("cmd.exe", ["/c", "rmdir", dirPath], { stdio: "ignore" });
      return;
    } catch {
      // fall through
    }
  }
  rmSync(dirPath, { recursive: true, force: true });
}

function buildSeededTemplate() {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    const p = `${templateDb}${suffix}`;
    if (existsSync(p)) {
      rmSync(p, { force: true });
    }
  }

  const url = `file:${templateDb.replace(/\\/g, "/")}`;
  console.log("Building seeded SQLite template for desktop first-run…");
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
    shell: true,
  });
  execFileSync("npx", ["prisma", "db", "seed"], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
    shell: true,
  });

  if (!existsSync(templateDb)) {
    throw new Error("Failed to create prisma/saraf-template.db");
  }
}

if (!existsSync(standaloneDir) || !existsSync(path.join(standaloneDir, "server.js"))) {
  console.error(
    "Missing .next/standalone/server.js. Run `npm run build` first.",
  );
  process.exit(1);
}

for (const junk of ["src-tauri", "docs", "scripts"]) {
  const junkPath = path.join(standaloneDir, junk);
  if (existsSync(junkPath)) {
    console.warn(`Removing accidentally traced ${junk} from standalone…`);
    rmSync(junkPath, { recursive: true, force: true });
  }
}

const targetStatic = path.join(standaloneDir, ".next", "static");
mkdirSync(path.dirname(targetStatic), { recursive: true });
if (existsSync(staticDir)) {
  rmSync(targetStatic, { recursive: true, force: true });
  cpSync(staticDir, targetStatic, { recursive: true });
}

const targetPublic = path.join(standaloneDir, "public");
if (existsSync(publicDir)) {
  rmSync(targetPublic, { recursive: true, force: true });
  cpSync(publicDir, targetPublic, { recursive: true });
}

buildSeededTemplate();
copyFileSync(templateDb, path.join(standaloneDir, "saraf-template.db"));
copyFileSync(desktopEntrySrc, path.join(standaloneDir, "desktop-entry.cjs"));

removeJunctionOrDir(junctionPath);

mkdirSync(resourcesDir, { recursive: true });
if (existsSync(archivePath)) {
  rmSync(archivePath, { force: true });
}

console.log("Creating next-server.tar.gz (this may take a minute)…");
execFileSync(
  "tar",
  ["-czf", archivePath, "-C", standaloneDir, "."],
  { stdio: "inherit" },
);

const sizeMb = statSync(archivePath).size / (1024 * 1024);
writeFileSync(
  path.join(resourcesDir, "next-server.tar.gz.meta.json"),
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      sizeBytes: statSync(archivePath).size,
    },
    null,
    2,
  ),
);

console.log(
  `Prepared ${archivePath} (${sizeMb.toFixed(1)} MiB) for Tauri resources.`,
);
