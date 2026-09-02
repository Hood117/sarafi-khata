//! Tauri `post_transaction` command — authorization gate around ledger::post_transaction.
//!
//! Domain modules call `ledger::post_transaction` directly (already gated by their own
//! commands). This wrapper is the invoke surface and must enforce screen ACL + Main Vault PIN.

use rusqlite::Connection;
use serde::Deserialize;
use tauri::State;

use crate::commands::auth_pin;
use crate::commands::authorize::{self, AuthUser};
use crate::error::AppError;
use crate::ledger::{post_transaction as post_txn, PostTransactionInput, PostedTransaction};
use crate::state::AppState;

/// Invoke payload: ledger post body + optional Authorization PIN for Main Vault cash.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PostTransactionCommandInput {
  #[serde(flatten)]
  pub body: PostTransactionInput,
  /// Required only for `VAULT_CASH_IN` / `VAULT_CASH_OUT` on this Tauri path.
  #[serde(default)]
  pub authorization_pin: Option<String>,
}

/// Screen / admin / PIN requirements for a transaction type on the public Tauri path.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum PostTypeAuthz {
  /// Caller must have at least one of these screens.
  AnyScreen(&'static [&'static str]),
  /// Single screen.
  Screen(&'static str),
  /// ADMIN (or built-in system admin) only.
  Admin,
  /// Vaults/daybook screens + Authorization PIN (Main Vault Cash In/Out only).
  VaultCash {
    screens: &'static [&'static str],
    pin_action: &'static str,
  },
}

/// Map ledger type → authorization requirement for the Tauri command.
/// Unknown types are rejected before any financial write.
pub(crate) fn post_type_authz(tx_type: &str) -> Result<PostTypeAuthz, AppError> {
  match tx_type.trim().to_ascii_uppercase().as_str() {
    "DEPOSIT" | "WITHDRAWAL" | "EXCHANGE" => Ok(PostTypeAuthz::AnyScreen(&["cash", "customers"])),
    "TRANSFER" => Ok(PostTypeAuthz::AnyScreen(&["cash", "customers", "vaults"])),
    "HAWALA" => Ok(PostTypeAuthz::Screen("hawala")),
    "EXPENSE" => Ok(PostTypeAuthz::AnyScreen(&["expenses", "employees"])),
    "TRADE_BUY" | "TRADE_SELL" => Ok(PostTypeAuthz::Screen("trading")),
    // Raw ADJUSTMENT (opening equity, etc.) must not be inventable by cashiers via invoke.
    // Legitimate domain commands call `ledger::post_transaction` with their own gates.
    "ADJUSTMENT" => Ok(PostTypeAuthz::Admin),
    "VAULT_CASH_IN" => Ok(PostTypeAuthz::VaultCash {
      screens: &["vaults", "daybook"],
      pin_action: "CASH_IN",
    }),
    "VAULT_CASH_OUT" => Ok(PostTypeAuthz::VaultCash {
      screens: &["vaults", "daybook"],
      pin_action: "CASH_OUT",
    }),
    other => Err(AppError::Validation(format!(
      "Unsupported transaction type '{other}'."
    ))),
  }
}

#[cfg(test)]
pub(crate) fn vault_cash_type_requires_pin(tx_type: &str) -> bool {
  matches!(
    post_type_authz(tx_type),
    Ok(PostTypeAuthz::VaultCash { .. })
  )
}

/// Enforce session + screen/admin + Main Vault PIN (when applicable).
/// Actor identity always comes from the bound session — never from client fields.
pub(crate) fn authorize_tauri_post_transaction(
  state: &AppState,
  conn: &Connection,
  tx_type: &str,
  authorization_pin: Option<&str>,
  pin_detail: &str,
) -> Result<AuthUser, AppError> {
  match post_type_authz(tx_type)? {
    PostTypeAuthz::AnyScreen(screens) => authorize::require_any_screen(state, conn, screens),
    PostTypeAuthz::Screen(screen) => authorize::require_screen(state, conn, screen),
    PostTypeAuthz::Admin => authorize::require_admin(state, conn),
    PostTypeAuthz::VaultCash {
      screens,
      pin_action,
    } => {
      let actor = authorize::require_any_screen(state, conn, screens)?;
      auth_pin::require_authorization_pin(
        conn,
        authorization_pin,
        Some(actor.id.as_str()),
        pin_action,
        pin_detail,
      )?;
      Ok(actor)
    }
  }
}

#[tauri::command]
pub fn post_transaction(
  state: State<'_, AppState>,
  mut input: PostTransactionCommandInput,
) -> Result<PostedTransaction, AppError> {
  let conn = state.db.lock();
  let pin_detail = {
    let reference = input.body.reference.trim();
    let ty = input.body.r#type.trim();
    if reference.is_empty() {
      ty.to_string()
    } else {
      format!("{ty} {reference}")
    }
  };
  let actor = authorize_tauri_post_transaction(
    &state,
    &conn,
    &input.body.r#type,
    input.authorization_pin.as_deref(),
    &pin_detail,
  )?;
  // Session actor is authoritative — ignore any client-supplied createdById.
  input.body.created_by_id = Some(actor.id.clone());
  post_txn(&conn, input.body)
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::commands::authorize::set_session_token;
  use sha2::{Digest, Sha256};
  use std::path::PathBuf;

  fn hash_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
  }

  fn fresh_state() -> AppState {
    let conn = Connection::open_in_memory().unwrap();
    conn
      .execute_batch(
        r#"
        CREATE TABLE "User" (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          fullName TEXT NOT NULL DEFAULT '',
          passwordHash TEXT NOT NULL DEFAULT 'x',
          role TEXT NOT NULL,
          isActive INTEGER NOT NULL DEFAULT 1,
          allowedScreens TEXT,
          authPinHash TEXT,
          authPinFailCount INTEGER NOT NULL DEFAULT 0,
          authPinLockedUntil TEXT,
          createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE Session (
          id TEXT PRIMARY KEY,
          userId TEXT NOT NULL,
          tokenHash TEXT NOT NULL,
          expiresAt TEXT NOT NULL,
          revokedAt TEXT,
          createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        "#,
      )
      .unwrap();
    AppState::with_connection(conn, PathBuf::from(":memory:"))
  }

  fn insert_user(
    conn: &Connection,
    id: &str,
    username: &str,
    role: &str,
    screens_json: Option<&str>,
    pin_hash: Option<&str>,
  ) {
    conn
      .execute(
        r#"INSERT INTO "User" (id, username, fullName, role, isActive, allowedScreens, authPinHash)
           VALUES (?1, ?2, ?2, ?3, 1, ?4, ?5)"#,
        rusqlite::params![id, username, role, screens_json, pin_hash],
      )
      .unwrap();
  }

  fn bind_user_session(state: &AppState, user_id: &str, token: &str) {
    let expires = (chrono::Utc::now() + chrono::Duration::hours(1))
      .format("%Y-%m-%d %H:%M:%S.000")
      .to_string();
    let conn = state.db.lock();
    conn
      .execute(
        r#"INSERT INTO Session (id, userId, tokenHash, expiresAt)
           VALUES (?1, ?2, ?3, ?4)"#,
        rusqlite::params![
          format!("s-{user_id}"),
          user_id,
          hash_token(token),
          expires
        ],
      )
      .unwrap();
    drop(conn);
    set_session_token(state, token);
  }

  #[test]
  fn deposit_does_not_require_pin_mapping() {
    assert!(!vault_cash_type_requires_pin("DEPOSIT"));
    assert!(!vault_cash_type_requires_pin("WITHDRAWAL"));
    assert!(!vault_cash_type_requires_pin("TRANSFER"));
    assert!(!vault_cash_type_requires_pin("EXCHANGE"));
    assert!(!vault_cash_type_requires_pin("HAWALA"));
    assert!(!vault_cash_type_requires_pin("EXPENSE"));
    assert!(!vault_cash_type_requires_pin("ADJUSTMENT"));
    assert!(!vault_cash_type_requires_pin("TRADE_BUY"));
  }

  #[test]
  fn vault_cash_types_require_pin_mapping() {
    assert!(vault_cash_type_requires_pin("VAULT_CASH_IN"));
    assert!(vault_cash_type_requires_pin("VAULT_CASH_OUT"));
    assert!(vault_cash_type_requires_pin("vault_cash_in"));
  }

  #[test]
  fn adjustment_maps_to_admin_only() {
    assert_eq!(post_type_authz("ADJUSTMENT").unwrap(), PostTypeAuthz::Admin);
  }

  #[test]
  fn unauthenticated_post_is_rejected() {
    let state = fresh_state();
    let conn = state.db.lock();
    let err = authorize_tauri_post_transaction(&state, &conn, "DEPOSIT", None, "x")
      .unwrap_err();
    assert!(
      err.to_string().contains("ACCESS_DENIED"),
      "{}",
      err
    );
  }

  #[test]
  fn unauthorized_screen_is_rejected() {
    let state = fresh_state();
    {
      let conn = state.db.lock();
      insert_user(
        &conn,
        "u1",
        "cashier",
        "CASHIER",
        Some(r#"["dashboard"]"#),
        None,
      );
    }
    bind_user_session(&state, "u1", "tok-cashier");
    let conn = state.db.lock();
    let err = authorize_tauri_post_transaction(&state, &conn, "DEPOSIT", None, "x")
      .unwrap_err();
    assert!(
      err.to_string().contains("ACCESS_DENIED"),
      "{}",
      err
    );
  }

  #[test]
  fn authorized_cashier_can_authorize_deposit_without_pin() {
    let state = fresh_state();
    {
      let conn = state.db.lock();
      insert_user(
        &conn,
        "u1",
        "cashier",
        "CASHIER",
        Some(r#"["cash"]"#),
        None,
      );
    }
    bind_user_session(&state, "u1", "tok-ok");
    let conn = state.db.lock();
    let actor =
      authorize_tauri_post_transaction(&state, &conn, "DEPOSIT", None, "dep").unwrap();
    assert_eq!(actor.id, "u1");
  }

  #[test]
  fn vault_cash_in_without_pin_is_rejected() {
    let state = fresh_state();
    let pin_hash = bcrypt::hash("654321", 4).unwrap();
    {
      let conn = state.db.lock();
      insert_user(&conn, "admin", "admin", "ADMIN", None, Some(&pin_hash));
      insert_user(
        &conn,
        "u1",
        "cashier",
        "CASHIER",
        Some(r#"["vaults"]"#),
        None,
      );
    }
    bind_user_session(&state, "u1", "tok-vault");
    let conn = state.db.lock();
    let err =
      authorize_tauri_post_transaction(&state, &conn, "VAULT_CASH_IN", None, "10 AFN")
        .unwrap_err();
    assert!(
      err.to_string().contains("AUTH_PIN_REQUIRED"),
      "{}",
      err
    );
  }

  #[test]
  fn vault_cash_out_without_pin_is_rejected() {
    let state = fresh_state();
    let pin_hash = bcrypt::hash("654321", 4).unwrap();
    {
      let conn = state.db.lock();
      insert_user(&conn, "admin", "admin", "ADMIN", None, Some(&pin_hash));
      insert_user(
        &conn,
        "u1",
        "cashier",
        "CASHIER",
        Some(r#"["daybook"]"#),
        None,
      );
    }
    bind_user_session(&state, "u1", "tok-out");
    let conn = state.db.lock();
    let err = authorize_tauri_post_transaction(
      &state,
      &conn,
      "VAULT_CASH_OUT",
      Some(""),
      "10 AFN",
    )
    .unwrap_err();
    assert!(
      err.to_string().contains("AUTH_PIN_REQUIRED"),
      "{}",
      err
    );
  }

  #[test]
  fn valid_pin_allows_vault_cash_in_and_out() {
    let state = fresh_state();
    let pin_hash = bcrypt::hash("654321", 4).unwrap();
    {
      let conn = state.db.lock();
      insert_user(&conn, "admin", "admin", "ADMIN", None, Some(&pin_hash));
      insert_user(
        &conn,
        "u1",
        "cashier",
        "CASHIER",
        Some(r#"["vaults"]"#),
        None,
      );
    }
    bind_user_session(&state, "u1", "tok-pin");
    let conn = state.db.lock();
    authorize_tauri_post_transaction(
      &state,
      &conn,
      "VAULT_CASH_IN",
      Some("654321"),
      "10 AFN",
    )
    .unwrap();
    authorize_tauri_post_transaction(
      &state,
      &conn,
      "VAULT_CASH_OUT",
      Some("654321"),
      "5 AFN",
    )
    .unwrap();
  }

  #[test]
  fn wrong_pin_rejects_vault_cash() {
    let state = fresh_state();
    let pin_hash = bcrypt::hash("654321", 4).unwrap();
    {
      let conn = state.db.lock();
      insert_user(&conn, "admin", "admin", "ADMIN", None, Some(&pin_hash));
      insert_user(
        &conn,
        "u1",
        "cashier",
        "CASHIER",
        Some(r#"["vaults"]"#),
        None,
      );
    }
    bind_user_session(&state, "u1", "tok-bad");
    let conn = state.db.lock();
    let err = authorize_tauri_post_transaction(
      &state,
      &conn,
      "VAULT_CASH_IN",
      Some("111111"),
      "10 AFN",
    )
    .unwrap_err();
    assert!(
      err.to_string().contains("AUTH_PIN_INVALID"),
      "{}",
      err
    );
  }

  #[test]
  fn session_actor_id_is_used_not_client_hint() {
    let state = fresh_state();
    {
      let conn = state.db.lock();
      insert_user(
        &conn,
        "real-actor",
        "cashier",
        "CASHIER",
        Some(r#"["cash"]"#),
        None,
      );
    }
    bind_user_session(&state, "real-actor", "tok-actor");
    let conn = state.db.lock();
    let actor =
      authorize_tauri_post_transaction(&state, &conn, "DEPOSIT", None, "x").unwrap();
    assert_eq!(actor.id, "real-actor");
    assert_ne!(actor.id, "forged-client-id");
  }

  #[test]
  fn cashier_cannot_post_adjustment_via_tauri_authz() {
    let state = fresh_state();
    {
      let conn = state.db.lock();
      insert_user(
        &conn,
        "u1",
        "cashier",
        "CASHIER",
        Some(r#"["cash","vaults","capital"]"#),
        None,
      );
    }
    bind_user_session(&state, "u1", "tok-adj");
    let conn = state.db.lock();
    let err =
      authorize_tauri_post_transaction(&state, &conn, "ADJUSTMENT", None, "x").unwrap_err();
    assert!(
      err.to_string().contains("ACCESS_DENIED"),
      "{}",
      err
    );
  }
}
