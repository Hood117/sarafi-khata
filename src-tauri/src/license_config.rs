//! License API URL + app token — Rust-only secrets.
//!
//! `APP_TOKEN` must match the Cloudflare Worker secret `APP_TOKEN`
//! (`npx wrangler secret put APP_TOKEN` in license-server/).
//! Never return this value from Tauri commands or to the WebView.

/// Public Workers URL for this project.
pub const LICENSE_API_URL: &str = "https://saraf-license-server.rahmatthedev.workers.dev";

/// Shared secret sent as `X-Saraf-App-Token` from Rust only during activation.
/// Must match Cloudflare: `npx wrangler secret put APP_TOKEN`
pub(crate) const APP_TOKEN: &str = "my-secret-app-token-786";
