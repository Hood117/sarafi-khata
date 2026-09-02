#!/usr/bin/env node
/**
 * Issue a Saraf license key via the admin API.
 *
 * Usage:
 *   node scripts/issue-license.mjs --name "Ahmad Sarafi" --phone "0700000000"
 *
 * Env (or flags):
 *   LICENSE_API_URL   e.g. https://saraf-license-server.<you>.workers.dev
 *   LICENSE_ADMIN_TOKEN
 */

const args = process.argv.slice(2);

/** Collect `--flag value` (value may be multiple words until next `--flag`). */
function flag(name, fallback = "") {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const parts = [];
  for (let j = i + 1; j < args.length; j++) {
    const a = args[j];
    if (a.startsWith("--")) break;
    parts.push(a);
  }
  return parts.join(" ").trim() || fallback;
}

/**
 * workers.dev host must be `name.subdomain.workers.dev` with hyphens in the
 * worker name — not nested dots like `saraf.license-server....`.
 */
function normalizeApiUrl(raw) {
  let url = raw.trim().replace(/\/+$/, "");
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    // Fix common typo: saraf.license-server.X.workers.dev → saraf-license-server.X.workers.dev
    const nested = host.match(
      /^saraf\.license-server\.([a-z0-9-]+)\.workers\.dev$/,
    );
    if (nested) {
      const fixed = `https://saraf-license-server.${nested[1]}.workers.dev`;
      console.warn(
        `Note: fixed workers.dev URL\n  was: ${url}\n  now: ${fixed}`,
      );
      return fixed;
    }
  } catch {
    /* keep as-is; fetch will error clearly */
  }
  return url;
}

function errorDetail(err) {
  const cause = err instanceof Error ? err.cause : null;
  if (cause instanceof Error) return cause.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const apiUrl = normalizeApiUrl(
  flag("url") || process.env.LICENSE_API_URL || "",
);
const adminToken = (
  flag("token") ||
  process.env.LICENSE_ADMIN_TOKEN ||
  ""
).trim();
const customerName = flag("name").trim();
const customerPhone = flag("phone").trim();
const notes = flag("notes").trim();

if (!apiUrl) {
  console.error(
    "Missing API URL. Set LICENSE_API_URL or pass --url https://saraf-license-server.<you>.workers.dev",
  );
  process.exit(1);
}
if (!adminToken) {
  console.error(
    "Missing admin token. Set LICENSE_ADMIN_TOKEN or pass --token ...",
  );
  process.exit(1);
}
if (!customerName) {
  console.error('Missing customer name. Pass --name "Shop Name"');
  process.exit(1);
}

const CONNECT_MS = Number(process.env.LICENSE_ISSUE_TIMEOUT_MS || 45000);
const MAX_ATTEMPTS = Number(process.env.LICENSE_ISSUE_RETRIES || 4);

let res;
let lastDetail = "";
for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  try {
    if (attempt > 1) {
      console.error(`Retry ${attempt}/${MAX_ATTEMPTS}…`);
      await sleep(1500 * (attempt - 1));
    }
    res = await fetch(`${apiUrl}/v1/admin/licenses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        customerName,
        customerPhone: customerPhone || undefined,
        notes: notes || undefined,
      }),
      signal: AbortSignal.timeout(CONNECT_MS),
    });
    break;
  } catch (err) {
    lastDetail = errorDetail(err);
    const retryable = /timeout|ECONNRESET|ECONNREFUSED|ENOTFOUND|fetch failed|network|UND_ERR/i.test(
      lastDetail,
    );
    if (!retryable || attempt === MAX_ATTEMPTS) {
      console.error("Failed to reach license server.");
      console.error(`  URL   : ${apiUrl}`);
      console.error(`  Error : ${lastDetail}`);
      if (/handshake|SSL|TLS|ECONNREFUSED|ENOTFOUND/i.test(lastDetail)) {
        console.error("");
        console.error("Check LICENSE_API_URL. It must look like:");
        console.error(
          "  https://saraf-license-server.<your-subdomain>.workers.dev",
        );
        console.error(
          "(hyphens in the worker name — not saraf.license-server....)",
        );
      }
      if (/timeout|UND_ERR_CONNECT/i.test(lastDetail)) {
        console.error("");
        console.error(
          "Network to Cloudflare timed out. Try again, use a stable connection/VPN,",
        );
        console.error(
          "or raise LICENSE_ISSUE_TIMEOUT_MS (ms) / LICENSE_ISSUE_RETRIES.",
        );
      }
      process.exit(1);
    }
  }
}

const data = await res.json().catch(() => ({}));
if (!res.ok || !data.ok) {
  console.error(
    "Failed to issue license:",
    data.error || `${res.status} ${res.statusText}`,
  );
  if (res.status === 401 || res.status === 403) {
    console.error(
      "Admin token mismatch. Use the same value you set with:\n  npx wrangler secret put ADMIN_TOKEN",
    );
  }
  process.exit(1);
}

console.log("License issued");
console.log(`  Customer : ${data.license.customerName}`);
console.log(`  Key      : ${data.license.licenseKey}`);
console.log(`  Status   : ${data.license.status}`);
