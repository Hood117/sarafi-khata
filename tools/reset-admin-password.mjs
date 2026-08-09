import { config } from "dotenv";
import bcrypt from "bcrypt";
import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

config();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const raw = process.env.DATABASE_URL || "file:./prisma/dev.db";
const file = raw.replace(/^file:/, "");
const dbPath = path.isAbsolute(file) ? file : path.resolve(root, file);

const password = process.argv[2] || "ChangeMe123!";
const hash = await bcrypt.hash(password, 12);

const db = new Database(dbPath);
const result = db
  .prepare(
    "UPDATE User SET passwordHash = ?, isActive = 1, updatedAt = CURRENT_TIMESTAMP WHERE username = 'admin'",
  )
  .run(hash);

console.log("dbPath", dbPath);
console.log("admin rows updated", result.changes);
console.log("password set to", password);

const row = db
  .prepare("SELECT passwordHash FROM User WHERE username = 'admin'")
  .get();
console.log("verify", await bcrypt.compare(password, row.passwordHash));
