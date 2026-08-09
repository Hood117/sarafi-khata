import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Free disk space used by desktop build artifacts (safe to regenerate).
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function removeLinkOrDir(dirPath) {
  if (!existsSync(dirPath)) {
    return;
  }

  const stat = lstatSync(dirPath);
  if (stat.isSymbolicLink()) {
    rmSync(dirPath, { force: true });
    return;
  }

  if (process.platform === "win32") {
    try {
      execFileSync("cmd.exe", ["/c", "rmdir", dirPath], { stdio: "ignore" });
      return;
    } catch {
      // real directory
    }
  }

  rmSync(dirPath, { recursive: true, force: true });
}

const targets = [
  path.join(root, "src-tauri", "target"),
  path.join(root, ".next", "dev"),
  path.join(root, ".next", "cache"),
  path.join(root, "src-tauri", "resources", "next-server"),
  path.join(root, "src-tauri", "resources", "next-server.tar.gz"),
  path.join(root, "src-tauri", "resources", "next-server.tar.gz.meta.json"),
];

for (const target of targets) {
  console.log(`Removing ${path.relative(root, target) || target}…`);
  removeLinkOrDir(target);
}

console.log("Desktop build artifacts cleaned.");
