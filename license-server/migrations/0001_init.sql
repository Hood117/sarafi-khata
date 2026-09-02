-- Saraf license registry (Cloudflare D1)
CREATE TABLE IF NOT EXISTS licenses (
  id TEXT PRIMARY KEY NOT NULL,
  license_key TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'issued', -- issued | active | revoked
  machine_fingerprint TEXT,
  machine_label TEXT,
  activated_at TEXT,
  last_seen_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS licenses_status_idx ON licenses(status);
CREATE INDEX IF NOT EXISTS licenses_customer_name_idx ON licenses(customer_name);
