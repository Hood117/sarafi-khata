const fs = require("fs");
const path = require("path");

function walk(d, a = []) {
  for (const n of fs.readdirSync(d)) {
    const p = path.join(d, n);
    if (fs.statSync(p).isDirectory()) walk(p, a);
    else if (p.endsWith(".tsx")) a.push(p);
  }
  return a;
}

const files = walk("desktop-ui/src/pages");
files.push("desktop-ui/src/layout.tsx");

const skip =
  /^(DEBIT|CREDIT|ALL|SEND|RECEIVE|BUY|SELL|USD|AFN|PENDING|SENT|POSTED|ADMIN|MANAGER|CASHIER|TILL|VAULT|CUSTOMER|SYSTEM|FIXED|PERCENT|NORMAL|URGENT|IMMEDIATE|OK|SHORTAGE|OVERAGE|OPEN|CLOSED|MIXED|NONE|IN|OUT)$/;

for (const f of files) {
  const t = fs.readFileSync(f, "utf8");
  const hasUseT = /useT\(/.test(t);
  const matches = [...t.matchAll(/(["'`])([A-Z][^"'`]{1,55})\1/g)]
    .map((m) => m[2])
    .filter(
      (s) =>
        !skip.test(s) &&
        !/^[A-Z0-9_]+$/.test(s) &&
        !s.includes("://") &&
        !s.includes("\\") &&
        !s.startsWith("http") &&
        !s.includes("SELECT") &&
        !s.includes("FROM ") &&
        !/^[A-Za-z]+\.[A-Za-z]/.test(s),
    );
  const uniq = [...new Set(matches)].slice(0, 15);
  if (uniq.length) {
    console.log(
      `${hasUseT ? "HAS_T" : "NO_T"} | ${f} | ${uniq.join(" || ")}`,
    );
  } else {
    console.log(`${hasUseT ? "HAS_T" : "NO_T"} | ${f} | (clean)`);
  }
}
