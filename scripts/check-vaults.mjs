import Database from "better-sqlite3";

const db = new Database(
  "C:/Users/Acc/AppData/Roaming/com.saraf.desktop/saraf.db",
);
const rows = db
  .prepare(
    `SELECT id, name, type, isActive, deletedAt
     FROM Wallet
     WHERE type IN ('VAULT','TILL') OR lower(name) LIKE '%samsoor%'
     ORDER BY type, name`,
  )
  .all();
console.log(JSON.stringify(rows, null, 2));
db.close();
