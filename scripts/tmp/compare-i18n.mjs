import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MSG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../src/lib/i18n/messages");

function extractKv(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const m = text.match(/export const \w+: Dictionary = \{/);
  if (!m) throw new Error(`no dict in ${filePath}`);
  const start = text.indexOf(m[0]) + m[0].length - 1;
  const body = text.slice(start);
  const result = {};
  const stack = [];
  let i = 0;
  while (i < body.length) {
    const ch = body[i];
    if (ch === "{") {
      stack.push(null);
      i++;
      continue;
    }
    if (ch === "}") {
      stack.pop();
      i++;
      continue;
    }
    const km = body.slice(i).match(/^(\w+)\s*:\s*/);
    if (km) {
      const key = km[1];
      i += km[0].length;
      while (i < body.length && /\s/.test(body[i])) i++;
      if (body[i] === "{") {
        stack.push(key);
        i++;
        continue;
      }
      if (body[i] === '"' || body[i] === "'") {
        const quote = body[i++];
        let val = "";
        while (i < body.length) {
          if (body[i] === "\\") {
            val += body.slice(i, i + 2);
            i += 2;
            continue;
          }
          if (body[i] === quote) {
            i++;
            break;
          }
          val += body[i++];
        }
        const pathKeys = stack.filter(Boolean);
        result[[...pathKeys, key].join(".")] = val;
        continue;
      }
      continue;
    }
    i++;
  }
  return result;
}

function looksEnglish(s) {
  if (!s) return true;
  if (/[\u0600-\u06FF]/.test(s)) return false;
  return /[A-Za-z]/.test(s);
}

function group(keys) {
  const g = {};
  for (const k of keys) {
    const sec = k.split(".")[0];
    (g[sec] ??= []).push(k);
  }
  return g;
}

const en = extractKv(path.join(MSG, "en.ts"));
const fa = extractKv(path.join(MSG, "fa.ts"));
const ps = extractKv(path.join(MSG, "ps.ts"));

console.log("KEY COUNTS");
console.log("en", Object.keys(en).length);
console.log("fa", Object.keys(fa).length);
console.log("ps", Object.keys(ps).length);

const missingFa = Object.keys(en).filter((k) => !(k in fa)).sort();
const missingPs = Object.keys(en).filter((k) => !(k in ps)).sort();
const extraFa = Object.keys(fa).filter((k) => !(k in en)).sort();
const extraPs = Object.keys(ps).filter((k) => !(k in en)).sort();
console.log("MISSING FA", missingFa.length);
missingFa.forEach((k) => console.log(" ", k));
console.log("MISSING PS", missingPs.length);
missingPs.forEach((k) => console.log(" ", k));
console.log("EXTRA FA", extraFa.length);
extraFa.forEach((k) => console.log(" ", k));
console.log("EXTRA PS", extraPs.length);
extraPs.forEach((k) => console.log(" ", k));

const emptyFa = Object.entries(fa).filter(([, v]) => !v.trim()).map(([k]) => k);
const emptyPs = Object.entries(ps).filter(([, v]) => !v.trim()).map(([k]) => k);
console.log("EMPTY FA", emptyFa);
console.log("EMPTY PS", emptyPs);

const sameFa = Object.keys(en).filter((k) => fa[k] === en[k] && looksEnglish(en[k])).sort();
const samePs = Object.keys(en).filter((k) => ps[k] === en[k] && looksEnglish(en[k])).sort();
const engFa = Object.keys(fa).filter((k) => looksEnglish(fa[k]) && k in en).sort();
const engPs = Object.keys(ps).filter((k) => looksEnglish(ps[k]) && k in en).sort();
console.log("SAME AS EN fa", sameFa.length);
console.log("SAME AS EN ps", samePs.length);
console.log("ASCII/ENGLISH-LOOKING FA", engFa.length);
console.log("ASCII/ENGLISH-LOOKING PS", engPs.length);

console.log("=== FA ENGLISH-LOOKING BY SECTION ===");
for (const [sec, keys] of Object.entries(group(engFa)).sort()) {
  console.log(`[${sec}] ${keys.length}`);
  for (const k of keys) console.log(`  ${k}: ${JSON.stringify(fa[k])}  (en: ${JSON.stringify(en[k])})`);
}

console.log("=== PS ENGLISH-LOOKING BY SECTION ===");
for (const [sec, keys] of Object.entries(group(engPs)).sort()) {
  console.log(`[${sec}] ${keys.length}`);
  for (const k of keys) console.log(`  ${k}: ${JSON.stringify(ps[k])}  (en: ${JSON.stringify(en[k])})`);
}

console.log("=== SECTION KEY COUNTS ===");
const sections = [...new Set(Object.keys(en).map((k) => k.split(".")[0]))].sort();
for (const sec of sections) {
  const e = Object.keys(en).filter((k) => k.startsWith(sec + ".")).length;
  const f = Object.keys(fa).filter((k) => k.startsWith(sec + ".")).length;
  const p = Object.keys(ps).filter((k) => k.startsWith(sec + ".")).length;
  console.log(`${sec}: en=${e} fa=${f} ps=${p}`);
}

console.log("=== GOOD FA BUSINESS TERMS ===");
for (const k of [
  "nav.hawala",
  "nav.exchange",
  "nav.cash",
  "nav.partnerSarafi",
  "nav.dailyBook",
  "common.balance",
  "common.reference",
  "hawala.send",
  "hawala.receive",
  "hawala.commissionFee",
  "partner.payHim",
  "partner.collectFromHim",
  "partner.youOwe",
  "partner.theyOwe",
  "exchange.youGive",
  "exchange.youReceive",
  "cash.shopCash",
  "wallets.vault",
  "wallets.till",
  "transactions.deposit",
  "transactions.withdrawal",
  "customers.fatherName",
  "common.nationalId",
]) {
  console.log(`  fa ${k}: ${fa[k]}`);
  console.log(`  ps ${k}: ${ps[k]}`);
}
