const Database = require("better-sqlite3");
const db = new Database("./prisma/dev.db");
const tables = db
  .prepare("select name from sqlite_master where type = 'table' limit 5")
  .all();
console.log("native-sqlite-ok", tables);
db.close();
