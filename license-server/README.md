# Saraf license server (Cloudflare Workers + D1)

One EXE for all customers. You issue a **unique license key** per shop.  
Activation requires internet; after that the desktop app can work offline (once we wire the app).

## What this API does

| Who | Endpoint | Purpose |
|-----|----------|---------|
| You (admin) | `POST /v1/admin/licenses` | Create a new key for a customer |
| You (admin) | `GET /v1/admin/licenses` | List keys |
| You (admin) | `POST /v1/admin/licenses/:key/revoke` | Revoke a key |
| Desktop app | `POST /v1/activate` | Bind key → this PC (rejects if already used on another PC) |
| Desktop app | `GET /v1/status` | Check key still valid for this PC |

## One-time setup

### 1. Cloudflare account
1. Create a free account at [dash.cloudflare.com](https://dash.cloudflare.com).
2. Install deps in this folder:

```bash
cd license-server
npm install
copy .dev.vars.example .dev.vars
```

Edit `.dev.vars` and set strong random tokens (local only).

### 2. Login Wrangler

```bash
npx wrangler login
```

### 3. Create D1 database

```bash
npm run db:create
```

Copy the printed `database_id` into `wrangler.toml`:

```toml
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

### 4. Apply schema (local + remote)

```bash
npm run db:migrate:local
npm run db:migrate:remote
```

### 5. Set production secrets

```bash
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put APP_TOKEN
```

Use long random strings. Keep `ADMIN_TOKEN` private (only you).  

**Important for the desktop app:** `APP_TOKEN` must match the constant in  
`src-tauri/src/commands/license.rs` (currently `my-secret-app-token-786`).  
If you change either side, change both.

### 6. Deploy

```bash
npm run deploy
```

You get a URL like:

`https://saraf-license-server.<your-subdomain>.workers.dev`

## Issue a key for a customer

**URL shape matters.** Use hyphens in the worker name:

```text
✓ https://saraf-license-server.<your-subdomain>.workers.dev
✗ https://saraf.license-server.<your-subdomain>.workers.dev   ← SSL handshake fails
```

```bash
export LICENSE_API_URL=https://saraf-license-server.<your-subdomain>.workers.dev
export LICENSE_ADMIN_TOKEN=your-admin-token

npm run issue -- --name "Ahmad Sarafi" --phone "0700000000"
```

Or with curl:

```bash
curl -X POST "%LICENSE_API_URL%/v1/admin/licenses" ^
  -H "Authorization: Bearer %LICENSE_ADMIN_TOKEN%" ^
  -H "Content-Type: application/json" ^
  -d "{\"customerName\":\"Ahmad Sarafi\",\"customerPhone\":\"0700000000\"}"
```

You get a key like: `SARAF-A9F3-K2M7-P7QX`  
Send that key to the customer (with the same EXE).

## Activate (what the desktop app will call)

```bash
curl -X POST "%LICENSE_API_URL%/v1/activate" ^
  -H "Content-Type: application/json" ^
  -H "X-Saraf-App-Token: your-app-token" ^
  -d "{\"licenseKey\":\"SARAF-A9F3-K2M7-P7QX\",\"machineFingerprint\":\"pc-unique-id\",\"machineLabel\":\"Front desk\"}"
```

- First PC → success, key becomes `active`  
- Same key on another PC → **409** “already activated on another computer”

## Local test

```bash
npm run db:migrate:local
npm run dev
```

Worker runs at `http://127.0.0.1:8787` using `.dev.vars`.

## Security notes

- Never commit `.dev.vars` or real secrets.
- Free Cloudflare Workers + D1 does **not** pause after 7 days like Supabase Free.
- This stops casual key sharing. It is not unbreakable DRM.
- Next step in Saraf desktop: first-run license screen that calls `/v1/activate` and stores the result locally.

## Cost / space

License rows are tiny. Thousands of customers fit in a few MB. Free D1 limits are more than enough for keys.
