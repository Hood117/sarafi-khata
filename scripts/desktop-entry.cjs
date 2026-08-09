const { copyFileSync, existsSync, mkdirSync, unlinkSync, statSync } = require(
  "node:fs",
);
const path = require("node:path");
const { spawn } = require("node:child_process");

/**
 * Optional desktop bootstrap (no better-sqlite3 dependency).
 * Prefer Rust-side template copy + server.js; this remains as a fallback.
 */
const root = __dirname;
const templatePath = path.join(root, "saraf-template.db");

function resolveDbPath(rawUrl) {
  if (!rawUrl || !rawUrl.startsWith("file:")) {
    throw new Error("DATABASE_URL must be a file: SQLite URL");
  }
  let filePath = rawUrl.slice("file:".length);
  if (filePath.startsWith("///")) {
    filePath = filePath.slice(3);
  } else if (filePath.startsWith("//")) {
    filePath = filePath.slice(2);
  }
  if (!path.isAbsolute(filePath)) {
    filePath = path.resolve(process.cwd(), filePath);
  }
  return filePath;
}

function needsInit(dbFile) {
  if (!existsSync(dbFile)) {
    return true;
  }
  try {
    return statSync(dbFile).size < 50_000;
  } catch {
    return true;
  }
}

function ensureDatabase() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  const dbPath = resolveDbPath(dbUrl);
  mkdirSync(path.dirname(dbPath), { recursive: true });

  if (!needsInit(dbPath)) {
    return;
  }

  if (!existsSync(templatePath)) {
    throw new Error(`Missing seeded template DB at ${templatePath}`);
  }

  for (const suffix of ["-wal", "-shm", "-journal"]) {
    const extra = `${dbPath}${suffix}`;
    if (existsSync(extra)) {
      try {
        unlinkSync(extra);
      } catch {
        // ignore
      }
    }
  }

  copyFileSync(templatePath, dbPath);
}

ensureDatabase();

// Best-effort migrate on launch when prisma CLI is available (dev / unpacked builds).
try {
  const { execFileSync } = require("node:child_process");
  const prismaCli = path.join(root, "node_modules", "prisma", "build", "index.js");
  const schema = path.join(root, "prisma", "schema.prisma");
  if (existsSync(prismaCli) && existsSync(schema)) {
    execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
      cwd: root,
      env: process.env,
      stdio: "inherit",
    });
  }
} catch (error) {
  console.warn("prisma migrate deploy skipped:", error?.message || error);
}

const child = spawn(process.execPath, [path.join(root, "server.js")], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
