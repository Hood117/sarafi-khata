import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MSG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../src/lib/i18n/messages");

function extractKv(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const m = text.match(/export const \w+: Dictionary = \{/);
  const start = text.indexOf(m[0]) + m[0].length - 1;
  const body = text.slice(start);
  const result = {};
  const stack = [];
  let i = 0;
  while (i < body.length) {
    const ch = body[i];
    if (ch === "{") { stack.push(null); i++; continue; }
    if (ch === "}") { stack.pop(); i++; continue; }
    const km = body.slice(i).match(/^(\w+)\s*:\s*/);
    if (km) {
      const key = km[1];
      i += km[0].length;
      while (i < body.length && /\s/.test(body[i])) i++;
      if (body[i] === "{") { stack.push(key); i++; continue; }
      if (body[i] === '"' || body[i] === "'") {
        const quote = body[i++];
        let val = "";
        while (i < body.length) {
          if (body[i] === "\\") { val += body.slice(i, i + 2); i += 2; continue; }
          if (body[i] === quote) { i++; break; }
          val += body[i++];
        }
        result[[...stack.filter(Boolean), key].join(".")] = val;
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

const en = extractKv(path.join(MSG, "en.ts"));
const fa = extractKv(path.join(MSG, "fa.ts"));
const ps = extractKv(path.join(MSG, "ps.ts"));

const sections = [...new Set(Object.keys(en).map((k) => k.split(".")[0]))].sort();
console.log("section\ttotal\tfa_ok\tfa_en\tfa_pct\tps_ok\tps_en\tps_pct");
for (const sec of sections) {
  const keys = Object.keys(en).filter((k) => k.startsWith(sec + "."));
  const faEn = keys.filter((k) => looksEnglish(fa[k]));
  const psEn = keys.filter((k) => looksEnglish(ps[k]));
  const faOk = keys.length - faEn.length;
  const psOk = keys.length - psEn.length;
  const faPct = ((faOk / keys.length) * 100).toFixed(0);
  const psPct = ((psOk / keys.length) * 100).toFixed(0);
  console.log(`${sec}\t${keys.length}\t${faOk}\t${faEn.length}\t${faPct}%\t${psOk}\t${psEn.length}\t${psPct}%`);
}

// stub patterns that look auto-generated / wrong reuse
const stubPatterns = [
  /^Empty hint$/,
  /^No customers yet$/,
  /^No matching customers$/,
  /^Add customer$/,
  /^Archive customer$/,
  /^Archive this customer\?$/,
  /^Edit title$/,
  /^Send title$/,
  /^Receive title$/,
  /^Language hint$/,
  /^Settle title$/,
  /^Settle confirm$/,
  /^Hawala tab$/,
  /^Amount section$/,
  /^Notes section$/,
  /^Parties hint$/,
  /^Commission empty$/,
  /^Commission hint$/,
  /^Send dir$/,
  /^Receive dir$/,
  /^Cancel confirm$/,
  /^Fx pnl$/,
  /^Search customers…$/,
];

console.log("\n=== STUB / PLACEHOLDER PATTERN HITS (fa) ===");
let stubCount = 0;
for (const [k, v] of Object.entries(fa)) {
  if (stubPatterns.some((p) => p.test(v))) {
    stubCount++;
  }
}
console.log("stub-like values in fa:", stubCount);
console.log("stub-like values in ps:", Object.values(ps).filter((v) => stubPatterns.some((p) => p.test(v))).length);

// Compare fa vs en for keys that are translated in fa differently
const goodFa = Object.keys(en).filter((k) => !looksEnglish(fa[k]));
console.log("\nTranslated fa keys:", goodFa.length);
console.log("Untranslated fa keys:", Object.keys(en).length - goodFa.length);
