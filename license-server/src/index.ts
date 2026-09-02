/**
 * Saraf license API — Cloudflare Worker + D1.
 *
 * Public (desktop app):
 *   POST /v1/activate
 *   GET  /v1/status?key=&machine=
 *
 * Admin (you only — Authorization: Bearer <ADMIN_TOKEN>):
 *   POST /v1/admin/licenses
 *   GET  /v1/admin/licenses
 *   POST /v1/admin/licenses/:key/revoke
 */

export interface Env {
  DB: D1Database;
  ADMIN_TOKEN: string;
  /** Optional shared secret the desktop app sends as X-Saraf-App-Token */
  APP_TOKEN?: string;
}

type LicenseStatus = "issued" | "active" | "revoked";

type LicenseRow = {
  id: string;
  license_key: string;
  customer_name: string;
  customer_phone: string | null;
  notes: string | null;
  status: LicenseStatus;
  machine_fingerprint: string | null;
  machine_label: string | null;
  activated_at: string | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
};

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Saraf-App-Token",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS_HEADERS,
    },
  });
}

function error(message: string, status = 400): Response {
  return json({ ok: false, error: message }, status);
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeKey(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

function normalizeFingerprint(raw: string): string {
  return raw.trim().slice(0, 256);
}

/** SARAF-XXXX-XXXX-XXXX */
function generateLicenseKey(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const chunk = (n: number) => {
    let out = "";
    const bytes = new Uint8Array(n);
    crypto.getRandomValues(bytes);
    for (const b of bytes) out += alphabet[b % alphabet.length];
    return out;
  };
  return `SARAF-${chunk(4)}-${chunk(4)}-${chunk(4)}`;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function requireAdmin(request: Request, env: Env): Response | null {
  const header = request.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ")
    ? header.slice("Bearer ".length).trim()
    : "";
  if (!env.ADMIN_TOKEN || !token || !timingSafeEqual(token, env.ADMIN_TOKEN)) {
    return error("Unauthorized.", 401);
  }
  return null;
}

function requireAppToken(request: Request, env: Env): Response | null {
  if (!env.APP_TOKEN) return null;
  const token = (request.headers.get("X-Saraf-App-Token") || "").trim();
  if (!token || !timingSafeEqual(token, env.APP_TOKEN)) {
    return error("Unauthorized app token.", 401);
  }
  return null;
}

async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

function publicLicense(row: LicenseRow) {
  return {
    licenseKey: row.license_key,
    customerName: row.customer_name,
    status: row.status,
    machineFingerprint: row.machine_fingerprint,
    activatedAt: row.activated_at,
    lastSeenAt: row.last_seen_at,
  };
}

async function getByKey(
  db: D1Database,
  key: string,
): Promise<LicenseRow | null> {
  return db
    .prepare(`SELECT * FROM licenses WHERE license_key = ?1 LIMIT 1`)
    .bind(key)
    .first<LicenseRow>();
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    try {
      if (request.method === "GET" && path === "/health") {
        return json({ ok: true, service: "saraf-license-server" });
      }

      // --- Admin: issue license ---
      if (request.method === "POST" && path === "/v1/admin/licenses") {
        const denied = requireAdmin(request, env);
        if (denied) return denied;

        const body = await readJson<{
          customerName?: string;
          customerPhone?: string;
          notes?: string;
          licenseKey?: string;
        }>(request);
        if (!body) return error("Invalid JSON body.");

        const customerName = (body.customerName || "").trim();
        if (!customerName) return error("customerName is required.");

        let licenseKey = body.licenseKey
          ? normalizeKey(body.licenseKey)
          : generateLicenseKey();

        // Rare collision retry
        for (let i = 0; i < 5; i++) {
          const existing = await getByKey(env.DB, licenseKey);
          if (!existing) break;
          if (body.licenseKey) {
            return error("licenseKey already exists.", 409);
          }
          licenseKey = generateLicenseKey();
        }

        const id = crypto.randomUUID();
        const stamp = nowIso();
        await env.DB.prepare(
          `INSERT INTO licenses (
             id, license_key, customer_name, customer_phone, notes, status,
             machine_fingerprint, machine_label, activated_at, last_seen_at,
             created_at, updated_at
           ) VALUES (?1, ?2, ?3, ?4, ?5, 'issued', NULL, NULL, NULL, NULL, ?6, ?6)`,
        )
          .bind(
            id,
            licenseKey,
            customerName,
            (body.customerPhone || "").trim() || null,
            (body.notes || "").trim() || null,
            stamp,
          )
          .run();

        const row = await getByKey(env.DB, licenseKey);
        return json({ ok: true, license: row ? publicLicense(row) : null }, 201);
      }

      // --- Admin: list licenses ---
      if (request.method === "GET" && path === "/v1/admin/licenses") {
        const denied = requireAdmin(request, env);
        if (denied) return denied;

        const status = (url.searchParams.get("status") || "").trim().toLowerCase();
        const q = (url.searchParams.get("q") || "").trim();

        let sql = `SELECT * FROM licenses WHERE 1=1`;
        const binds: string[] = [];
        if (status === "issued" || status === "active" || status === "revoked") {
          sql += ` AND status = ?`;
          binds.push(status);
        }
        if (q) {
          sql += ` AND (customer_name LIKE ? OR license_key LIKE ? OR IFNULL(customer_phone,'') LIKE ?)`;
          const like = `%${q}%`;
          binds.push(like, like, like);
        }
        sql += ` ORDER BY created_at DESC LIMIT 200`;

        const stmt = env.DB.prepare(sql);
        const result = binds.length
          ? await stmt.bind(...binds).all<LicenseRow>()
          : await stmt.all<LicenseRow>();

        return json({
          ok: true,
          items: (result.results || []).map(publicLicense),
        });
      }

      // --- Admin: revoke ---
      {
        const match = path.match(/^\/v1\/admin\/licenses\/([^/]+)\/revoke$/);
        if (request.method === "POST" && match) {
          const denied = requireAdmin(request, env);
          if (denied) return denied;

          const licenseKey = normalizeKey(decodeURIComponent(match[1]));
          const row = await getByKey(env.DB, licenseKey);
          if (!row) return error("License not found.", 404);

          const stamp = nowIso();
          await env.DB.prepare(
            `UPDATE licenses
             SET status = 'revoked', updated_at = ?1
             WHERE license_key = ?2`,
          )
            .bind(stamp, licenseKey)
            .run();

          const updated = await getByKey(env.DB, licenseKey);
          return json({
            ok: true,
            license: updated ? publicLicense(updated) : null,
          });
        }
      }

      // --- App: activate ---
      if (request.method === "POST" && path === "/v1/activate") {
        const denied = requireAppToken(request, env);
        if (denied) return denied;

        const body = await readJson<{
          licenseKey?: string;
          machineFingerprint?: string;
          machineLabel?: string;
        }>(request);
        if (!body) return error("Invalid JSON body.");

        const licenseKey = normalizeKey(body.licenseKey || "");
        const machineFingerprint = normalizeFingerprint(
          body.machineFingerprint || "",
        );
        if (!licenseKey) return error("licenseKey is required.");
        if (!machineFingerprint) {
          return error("machineFingerprint is required.");
        }

        const row = await getByKey(env.DB, licenseKey);
        if (!row) return error("Invalid license key.", 404);
        if (row.status === "revoked") {
          return error("This license has been revoked.", 403);
        }

        const stamp = nowIso();

        // Already active on this same machine → refresh last_seen
        if (
          row.status === "active" &&
          row.machine_fingerprint &&
          timingSafeEqual(row.machine_fingerprint, machineFingerprint)
        ) {
          await env.DB.prepare(
            `UPDATE licenses
             SET last_seen_at = ?1, updated_at = ?1,
                 machine_label = COALESCE(?2, machine_label)
             WHERE license_key = ?3`,
          )
            .bind(
              stamp,
              (body.machineLabel || "").trim() || null,
              licenseKey,
            )
            .run();

          const updated = await getByKey(env.DB, licenseKey);
          return json({
            ok: true,
            activated: true,
            alreadyBound: true,
            license: updated ? publicLicense(updated) : null,
          });
        }

        // Active on a different machine → reject (this is the anti-share rule)
        if (
          row.status === "active" &&
          row.machine_fingerprint &&
          !timingSafeEqual(row.machine_fingerprint, machineFingerprint)
        ) {
          return error(
            "This license is already activated on another computer. Contact the developer for a new key.",
            409,
          );
        }

        // First activation (status issued, or active with no fingerprint)
        await env.DB.prepare(
          `UPDATE licenses
           SET status = 'active',
               machine_fingerprint = ?1,
               machine_label = ?2,
               activated_at = COALESCE(activated_at, ?3),
               last_seen_at = ?3,
               updated_at = ?3
           WHERE license_key = ?4`,
        )
          .bind(
            machineFingerprint,
            (body.machineLabel || "").trim() || null,
            stamp,
            licenseKey,
          )
          .run();

        const updated = await getByKey(env.DB, licenseKey);
        return json({
          ok: true,
          activated: true,
          alreadyBound: false,
          license: updated ? publicLicense(updated) : null,
        });
      }

      // --- App: status ---
      if (request.method === "GET" && path === "/v1/status") {
        const denied = requireAppToken(request, env);
        if (denied) return denied;

        const licenseKey = normalizeKey(url.searchParams.get("key") || "");
        const machineFingerprint = normalizeFingerprint(
          url.searchParams.get("machine") || "",
        );
        if (!licenseKey) return error("key is required.");
        if (!machineFingerprint) return error("machine is required.");

        const row = await getByKey(env.DB, licenseKey);
        if (!row) return error("Invalid license key.", 404);
        if (row.status === "revoked") {
          return json({
            ok: true,
            valid: false,
            reason: "revoked",
            license: publicLicense(row),
          });
        }
        if (row.status !== "active" || !row.machine_fingerprint) {
          return json({
            ok: true,
            valid: false,
            reason: "not_activated",
            license: publicLicense(row),
          });
        }
        if (!timingSafeEqual(row.machine_fingerprint, machineFingerprint)) {
          return json({
            ok: true,
            valid: false,
            reason: "other_machine",
            license: publicLicense(row),
          });
        }

        const stamp = nowIso();
        await env.DB.prepare(
          `UPDATE licenses SET last_seen_at = ?1, updated_at = ?1 WHERE license_key = ?2`,
        )
          .bind(stamp, licenseKey)
          .run();

        return json({
          ok: true,
          valid: true,
          reason: "ok",
          license: publicLicense(row),
        });
      }

      return error("Not found.", 404);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return error(`Server error: ${message}`, 500);
    }
  },
};
