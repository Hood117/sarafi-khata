//! System Administrator Transaction Authorization PIN.
//! Separate from login password. Hashed with bcrypt (same cost as passwords).
//! Verified only on the Rust side before sensitive financial writes.
//! Forgot-PIN recovery is offline: admin login password → new PIN (no SMS/OTP).

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::commands::authorize::{self, system_admin_username};
use crate::error::AppError;
use crate::state::AppState;
use crate::util::now_sqlite;

const BCRYPT_COST: u32 = 12;
const MAX_FAILS_BEFORE_LOCK: i64 = 5;
const LOCK_SECONDS: i64 = 60;

fn hash_secret(value: &str) -> Result<String, AppError> {
  bcrypt::hash(value, BCRYPT_COST)
    .map_err(|e| AppError::Internal(format!("auth pin hash: {e}")))
}

fn verify_secret(value: &str, hash: &str) -> Result<bool, AppError> {
  bcrypt::verify(value, hash).map_err(|e| AppError::Internal(format!("auth pin verify: {e}")))
}

fn normalize_pin_digits(raw: &str) -> String {
  raw.chars()
    .filter_map(|c| {
      if c.is_ascii_digit() {
        return Some(c);
      }
      let cp = c as u32;
      if (0x0660..=0x0669).contains(&cp) {
        return char::from_u32(cp - 0x0660 + 0x30);
      }
      if (0x06F0..=0x06F9).contains(&cp) {
        return char::from_u32(cp - 0x06F0 + 0x30);
      }
      None
    })
    .collect()
}

fn validate_pin_format(pin: &str) -> Result<(), AppError> {
  let pin = normalize_pin_digits(pin.trim());
  if pin.len() != 6 || !pin.chars().all(|c| c.is_ascii_digit()) {
    return Err(AppError::Validation(
      "Authorization PIN must be exactly 6 digits.".into(),
    ));
  }
  Ok(())
}

fn auth_pin_status_for(
  conn: &Connection,
  id: &str,
  hash: Option<String>,
) -> Result<AuthPinStatus, AppError> {
  let username: String = conn.query_row(
    r#"SELECT username FROM "User" WHERE id = ?1"#,
    [id],
    |row| row.get(0),
  )?;
  Ok(AuthPinStatus {
    configured: hash.as_ref().map(|h| !h.trim().is_empty()).unwrap_or(false),
    admin_user_id: Some(id.to_string()),
    admin_username: Some(username),
  })
}

fn write_security_audit(
  conn: &Connection,
  user_id: Option<&str>,
  action: &str,
  entity_id: &str,
  after: Option<&str>,
) -> Result<(), AppError> {
  let exists: bool = conn.query_row(
    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='AuditLog')",
    [],
    |row| row.get(0),
  )?;
  if !exists {
    return Ok(());
  }
  conn.execute(
    r#"INSERT INTO AuditLog (id, userId, action, module, entityType, entityId, beforeValues, afterValues, createdAt)
       VALUES (?1,?2,?3,'SECURITY','AuthPin',?4,NULL,?5,?6)"#,
    params![
      uuid::Uuid::new_v4().to_string(),
      user_id,
      action,
      entity_id,
      after,
      now_sqlite(),
    ],
  )?;
  Ok(())
}

fn load_auth_pin_holder_by_username(
  conn: &Connection,
  username: &str,
) -> Result<Option<(String, Option<String>)>, AppError> {
  conn
    .query_row(
      r#"SELECT id, authPinHash FROM "User"
         WHERE lower(username) = lower(?1) AND isActive = 1
         LIMIT 1"#,
      [username],
      |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .optional()
    .map_err(Into::into)
}

/// Prefer the system admin account that actually holds a configured PIN; else primary admin for setup.
fn find_auth_pin_holder(conn: &Connection) -> Result<Option<(String, Option<String>)>, AppError> {
  let mut candidates: Vec<(String, Option<String>)> = Vec::new();
  for username in [system_admin_username(), "admin"] {
    if let Some(row) = load_auth_pin_holder_by_username(conn, username)? {
      if !candidates.iter().any(|(id, _)| id == &row.0) {
        candidates.push(row);
      }
    }
  }

  for row in &candidates {
    if row
      .1
      .as_ref()
      .map(|h| !h.trim().is_empty())
      .unwrap_or(false)
    {
      return Ok(Some(row.clone()));
    }
  }

  if let Some(row) = load_auth_pin_holder_by_username(conn, system_admin_username())? {
    return Ok(Some(row));
  }
  if let Some(row) = load_auth_pin_holder_by_username(conn, "admin")? {
    return Ok(Some(row));
  }

  let any: Option<(String, Option<String>)> = conn
    .query_row(
      r#"SELECT id, authPinHash FROM "User"
         WHERE role = 'ADMIN' AND isActive = 1
         ORDER BY createdAt ASC
         LIMIT 1"#,
      [],
      |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .optional()?;
  Ok(any)
}

fn verify_user_login_password(
  conn: &Connection,
  user_id: &str,
  password: &str,
) -> Result<(), AppError> {
  let password = password.trim();
  if password.is_empty() {
    return Err(AppError::Validation("Password is required.".into()));
  }
  let hash: String = conn.query_row(
    r#"SELECT passwordHash FROM "User" WHERE id = ?1"#,
    [user_id],
    |row| row.get(0),
  )?;
  if !verify_secret(password, &hash)? {
    return Err(AppError::Auth("Incorrect password.".into()));
  }
  Ok(())
}

fn resolve_system_admin_target(
  conn: &Connection,
  target_user_id: Option<&str>,
) -> Result<String, AppError> {
  if let Some(id) = target_user_id.filter(|s| !s.trim().is_empty()) {
    let username: String = conn.query_row(
      r#"SELECT username FROM "User" WHERE id = ?1 AND isActive = 1"#,
      [id],
      |row| row.get(0),
    ).map_err(|_| AppError::NotFound("System Administrator account was not found.".into()))?;
    if !authorize::is_system_admin_username(&username) {
      return Err(AppError::Validation(
        "Authorization PIN can only be set on the System Administrator account.".into(),
      ));
    }
    return Ok(id.to_string());
  }
  let holder = find_auth_pin_holder(conn)?.ok_or_else(|| {
    AppError::NotFound("System Administrator account was not found.".into())
  })?;
  Ok(holder.0)
}

fn persist_auth_pin_hash(conn: &Connection, user_id: &str, pin_hash: &str) -> Result<(), AppError> {
  let now = now_sqlite();
  let updated = conn.execute(
    r#"UPDATE "User"
       SET authPinHash = ?1, authPinFailCount = 0, authPinLockedUntil = NULL, updatedAt = ?2
       WHERE id = ?3"#,
    params![pin_hash, now, user_id],
  )?;
  if updated == 0 {
    return Err(AppError::NotFound(
      "System Administrator account was not found.".into(),
    ));
  }
  let _ = conn.execute_batch("PRAGMA wal_checkpoint(PASSIVE);");
  Ok(())
}

fn is_locked(conn: &Connection, user_id: &str) -> Result<bool, AppError> {
  let locked: i64 = conn.query_row(
    r#"SELECT CASE
         WHEN authPinLockedUntil IS NOT NULL
          AND datetime(authPinLockedUntil) > datetime('now')
         THEN 1 ELSE 0 END
       FROM "User" WHERE id = ?1"#,
    [user_id],
    |row| row.get(0),
  )?;
  Ok(locked != 0)
}

fn clear_lockout(conn: &Connection, user_id: &str) -> Result<(), AppError> {
  conn.execute(
    r#"UPDATE "User" SET authPinFailCount = 0, authPinLockedUntil = NULL WHERE id = ?1"#,
    [user_id],
  )?;
  Ok(())
}

fn record_failure(conn: &Connection, user_id: &str) -> Result<i64, AppError> {
  let fails: i64 = conn.query_row(
    r#"SELECT COALESCE(authPinFailCount, 0) FROM "User" WHERE id = ?1"#,
    [user_id],
    |row| row.get(0),
  )?;
  let next = fails + 1;
  if next >= MAX_FAILS_BEFORE_LOCK {
    conn.execute(
      r#"UPDATE "User"
         SET authPinFailCount = ?1,
             authPinLockedUntil = datetime('now', ?2)
         WHERE id = ?3"#,
      params![next, format!("+{LOCK_SECONDS} seconds"), user_id],
    )?;
  } else {
    conn.execute(
      r#"UPDATE "User" SET authPinFailCount = ?1 WHERE id = ?2"#,
      params![next, user_id],
    )?;
  }
  Ok(next)
}

fn verify_admin_login_password(conn: &Connection, password: &str) -> Result<String, AppError> {
  let password = password.trim();
  if password.is_empty() {
    return Err(AppError::Validation("Password is required.".into()));
  }
  let holder = find_auth_pin_holder(conn)?.ok_or_else(|| {
    AppError::NotFound("System Administrator account was not found.".into())
  })?;
  let hash: String = conn.query_row(
    r#"SELECT passwordHash FROM "User" WHERE id = ?1"#,
    [&holder.0],
    |row| row.get(0),
  )?;
  if !verify_secret(password, &hash)? {
    return Err(AppError::Auth("Incorrect password.".into()));
  }
  Ok(holder.0)
}

/// Require a valid authorization PIN before Main Vault Cash In / Cash Out.
/// Never logs or returns the PIN/hash.
pub fn require_authorization_pin(
  conn: &Connection,
  pin: Option<&str>,
  actor_user_id: Option<&str>,
  action: &str,
  detail: &str,
) -> Result<(), AppError> {
  let holder = find_auth_pin_holder(conn)?.ok_or_else(|| {
    AppError::Validation(
      "AUTH_PIN_NOT_SET: Authorization PIN has not been configured. Ask the System Administrator to set it in Settings → Users.".into(),
    )
  })?;
  let (admin_id, hash_opt) = holder;
  let Some(hash) = hash_opt.filter(|h| !h.trim().is_empty()) else {
    return Err(AppError::Validation(
      "AUTH_PIN_NOT_SET: Authorization PIN has not been configured. Ask the System Administrator to set it in Settings → Users.".into(),
    ));
  };

  if is_locked(conn, &admin_id)? {
    let _ = write_security_audit(
      conn,
      actor_user_id,
      "AUTH_PIN_LOCKED",
      &admin_id,
      Some(&format!("{action} — {detail}")),
    );
    return Err(AppError::Auth(
      "AUTH_PIN_LOCKED: Too many incorrect PIN attempts. Try again in a minute.".into(),
    ));
  }

  let pin = normalize_pin_digits(pin.map(str::trim).unwrap_or(""));
  if pin.is_empty() {
    return Err(AppError::Validation(
      "AUTH_PIN_REQUIRED: Authorization PIN is required.".into(),
    ));
  }
  if validate_pin_format(&pin).is_err() {
    let _ = record_failure(conn, &admin_id);
    let _ = write_security_audit(
      conn,
      actor_user_id,
      "AUTH_PIN_FAIL",
      &admin_id,
      Some(&format!("Failed authorization PIN attempt for {action} — {detail}")),
    );
    return Err(AppError::Auth(
      "AUTH_PIN_INVALID: Incorrect authorization PIN.".into(),
    ));
  }

  if !verify_secret(&pin, &hash)? {
    let fails = record_failure(conn, &admin_id)?;
    let _ = write_security_audit(
      conn,
      actor_user_id,
      "AUTH_PIN_FAIL",
      &admin_id,
      Some(&format!("Failed authorization PIN attempt for {action} — {detail}")),
    );
    if fails >= MAX_FAILS_BEFORE_LOCK {
      return Err(AppError::Auth(
        "AUTH_PIN_LOCKED: Too many incorrect PIN attempts. Try again in a minute.".into(),
      ));
    }
    return Err(AppError::Auth(
      "AUTH_PIN_INVALID: Incorrect authorization PIN.".into(),
    ));
  }

  clear_lockout(conn, &admin_id)?;
  let _ = write_security_audit(
    conn,
    actor_user_id,
    "AUTH_PIN_OK",
    &admin_id,
    Some(&format!(
      "System Administrator authorized {action} — {detail}"
    )),
  );
  Ok(())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthPinStatus {
  pub configured: bool,
  pub admin_user_id: Option<String>,
  pub admin_username: Option<String>,
}

#[tauri::command]
pub fn get_admin_auth_pin_status(state: State<'_, AppState>) -> Result<AuthPinStatus, AppError> {
  let conn = state.db.lock();
  let _actor = authorize::require_admin(&state, &conn)?;
  let Some((id, hash)) = find_auth_pin_holder(&conn)? else {
    return Ok(AuthPinStatus {
      configured: false,
      admin_user_id: None,
      admin_username: None,
    });
  };
  auth_pin_status_for(&conn, &id, hash)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyAdminPasswordInput {
  pub password: String,
}

/// Verify System Administrator login password (for PIN setup step 1 / account edits).
#[tauri::command]
pub fn verify_admin_password(
  state: State<'_, AppState>,
  input: VerifyAdminPasswordInput,
) -> Result<(), AppError> {
  let conn = state.db.lock();
  let _actor = authorize::require_admin(&state, &conn)?;
  let _ = verify_admin_login_password(&conn, &input.password)?;
  Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyAuthorizationPinInput {
  pub pin: String,
}

/// Unlock Main Vault screen (view). Same PIN as Cash In / Cash Out; does not post anything.
#[tauri::command]
pub fn verify_authorization_pin(
  state: State<'_, AppState>,
  input: VerifyAuthorizationPinInput,
) -> Result<(), AppError> {
  let conn = state.db.lock();
  let actor = authorize::require_screen(&state, &conn, "vaults")?;
  require_authorization_pin(
    &conn,
    Some(input.pin.as_str()),
    Some(actor.id.as_str()),
    "VAULT_UNLOCK",
    "Open Main Vault screen",
  )
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetAdminAuthPinInput {
  /// System Administrator login password (not the PIN).
  pub password: String,
  pub pin: String,
  pub pin_confirm: String,
  pub actor_user_id: Option<String>,
  /// User id being edited in Settings → Users (System Administrator row).
  pub target_user_id: Option<String>,
}

#[tauri::command]
pub fn set_admin_auth_pin(
  state: State<'_, AppState>,
  input: SetAdminAuthPinInput,
) -> Result<AuthPinStatus, AppError> {
  validate_pin_format(&input.pin)?;
  let pin = normalize_pin_digits(input.pin.trim());
  let pin_confirm = normalize_pin_digits(input.pin_confirm.trim());
  if pin != pin_confirm {
    return Err(AppError::Validation(
      "Authorization PIN confirmation does not match.".into(),
    ));
  }

  let conn = state.db.lock();
  let session_actor = authorize::require_admin(&state, &conn)?;
  let admin_id = resolve_system_admin_target(&conn, input.target_user_id.as_deref())?;
  verify_user_login_password(&conn, &admin_id, &input.password)?;
  let existing: Option<String> = conn
    .query_row(
      r#"SELECT authPinHash FROM "User" WHERE id = ?1"#,
      [&admin_id],
      |row| row.get(0),
    )
    .optional()?
    .flatten();
  let changing = existing.as_ref().map(|h| !h.trim().is_empty()).unwrap_or(false);

  let pin_hash = hash_secret(&pin)?;
  persist_auth_pin_hash(&conn, &admin_id, &pin_hash)?;

  if !verify_secret(&pin, &pin_hash)? {
    return Err(AppError::Internal(
      "Authorization PIN could not be verified after save.".into(),
    ));
  }

  let _ = input.actor_user_id; // ignored — session actor is authoritative
  let action = if changing {
    "AUTH_PIN_CHANGED"
  } else {
    "AUTH_PIN_CREATED"
  };
  write_security_audit(
    &conn,
    Some(session_actor.id.as_str()),
    action,
    &admin_id,
    Some(if changing {
      "Authorization PIN changed"
    } else {
      "Authorization PIN created"
    }),
  )?;

  auth_pin_status_for(&conn, &admin_id, Some(pin_hash))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResetAuthPinWithAdminPasswordInput {
  /// System Administrator login password (not a cashier/user password).
  pub password: String,
  pub pin: String,
  pub pin_confirm: String,
  pub actor_user_id: Option<String>,
}

/// Offline Forgot-PIN recovery: verify System Administrator login password, then set a new PIN.
/// Does not authorize Cash In/Out. Never returns password, PIN, or hashes.
#[tauri::command]
pub fn reset_auth_pin_with_admin_password(
  state: State<'_, AppState>,
  input: ResetAuthPinWithAdminPasswordInput,
) -> Result<AuthPinStatus, AppError> {
  validate_pin_format(&input.pin)?;
  let pin = normalize_pin_digits(input.pin.trim());
  let pin_confirm = normalize_pin_digits(input.pin_confirm.trim());
  if pin != pin_confirm {
    return Err(AppError::Validation(
      "Authorization PIN confirmation does not match.".into(),
    ));
  }

  let conn = state.db.lock();
  let session_actor = authorize::require_admin(&state, &conn)?;
  let Some((admin_id, _)) = find_auth_pin_holder(&conn)? else {
    return Err(AppError::NotFound(
      "System Administrator account was not found.".into(),
    ));
  };

  let _ = input.actor_user_id; // ignored — session actor is authoritative
  let actor = Some(session_actor.id.as_str());

  write_security_audit(
    &conn,
    actor,
    "AUTH_PIN_RECOVERY_REQUESTED",
    &admin_id,
    Some("Forgot Authorization PIN recovery started"),
  )?;

  match verify_admin_login_password(&conn, &input.password) {
    Ok(id) => {
      if id != admin_id {
        return Err(AppError::Internal(
          "Authorization PIN holder mismatch during recovery.".into(),
        ));
      }
      let pin_hash = hash_secret(&pin)?;
      persist_auth_pin_hash(&conn, &id, &pin_hash)?;
      write_security_audit(
        &conn,
        actor,
        "AUTH_PIN_RECOVERY_SUCCESS",
        &id,
        Some("Authorization PIN reset via admin password recovery"),
      )?;
      auth_pin_status_for(&conn, &id, Some(pin_hash))
    }
    Err(err) => {
      let _ = write_security_audit(
        &conn,
        actor,
        "AUTH_PIN_RECOVERY_FAILED",
        &admin_id,
        Some("Incorrect System Administrator password during PIN recovery"),
      );
      Err(err)
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn pin_must_be_six_digits() {
    assert!(validate_pin_format("123456").is_ok());
    assert!(validate_pin_format("12345").is_err());
    assert!(validate_pin_format("1234567").is_err());
    assert!(validate_pin_format("12ab56").is_err());
    assert!(validate_pin_format("۱۲۳۴۵۶").is_ok());
  }

  #[test]
  fn holder_prefers_admin_with_configured_pin() {
    let conn = Connection::open_in_memory().unwrap();
    let hash = bcrypt::hash("123456", 4).unwrap();
    conn
      .execute_batch(
        r#"
        CREATE TABLE "User" (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          passwordHash TEXT NOT NULL,
          role TEXT NOT NULL,
          isActive INTEGER NOT NULL DEFAULT 1,
          authPinHash TEXT,
          authPinFailCount INTEGER NOT NULL DEFAULT 0,
          authPinLockedUntil TEXT,
          createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        "#,
      )
      .unwrap();
    conn
      .execute(
        r#"INSERT INTO "User" (id, username, passwordHash, role, isActive, authPinHash)
           VALUES ('s1', 'Saraf@@', 'x', 'ADMIN', 1, NULL)"#,
        [],
      )
      .unwrap();
    conn
      .execute(
        r#"INSERT INTO "User" (id, username, passwordHash, role, isActive, authPinHash)
           VALUES ('a1', 'admin', 'x', 'ADMIN', 1, ?1)"#,
        [&hash],
      )
      .unwrap();
    let holder = find_auth_pin_holder(&conn).unwrap().expect("holder");
    assert_eq!(holder.0, "a1");
    assert!(require_authorization_pin(&conn, Some("123456"), None, "CASH_OUT", "10 AFN").is_ok());
  }

  #[test]
  fn require_rejects_missing_pin() {
    let conn = Connection::open_in_memory().unwrap();
    conn
      .execute_batch(
        r#"
        CREATE TABLE "User" (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          passwordHash TEXT NOT NULL,
          role TEXT NOT NULL,
          isActive INTEGER NOT NULL DEFAULT 1,
          authPinHash TEXT,
          authPinFailCount INTEGER NOT NULL DEFAULT 0,
          authPinLockedUntil TEXT,
          createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO "User" (id, username, passwordHash, role, isActive, authPinHash)
        VALUES ('a1', 'admin', 'x', 'ADMIN', 1, NULL);
        "#,
      )
      .unwrap();
    let err = require_authorization_pin(&conn, Some("123456"), None, "CASH_OUT", "10 AFN")
      .unwrap_err();
    let msg = err.to_string();
    assert!(msg.contains("AUTH_PIN_NOT_SET"), "{msg}");
  }

  #[test]
  fn wrong_pin_does_not_authorize() {
    let conn = Connection::open_in_memory().unwrap();
    // Cost 4 keeps unit tests fast; production hashing still uses BCRYPT_COST (12).
    let hash = bcrypt::hash("654321", 4).unwrap();
    conn
      .execute_batch(
        r#"
        CREATE TABLE "User" (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          passwordHash TEXT NOT NULL,
          role TEXT NOT NULL,
          isActive INTEGER NOT NULL DEFAULT 1,
          authPinHash TEXT,
          authPinFailCount INTEGER NOT NULL DEFAULT 0,
          authPinLockedUntil TEXT,
          createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        "#,
      )
      .unwrap();
    conn
      .execute(
        r#"INSERT INTO "User" (id, username, passwordHash, role, isActive, authPinHash)
           VALUES ('a1', 'admin', 'x', 'ADMIN', 1, ?1)"#,
        [&hash],
      )
      .unwrap();
    let err = require_authorization_pin(&conn, Some("111111"), Some("u1"), "CASH_OUT", "10 AFN")
      .unwrap_err();
    assert!(err.to_string().contains("AUTH_PIN_INVALID"));
  }

  #[test]
  fn cashier_password_cannot_verify_as_admin() {
    let conn = Connection::open_in_memory().unwrap();
    let admin_pw = bcrypt::hash("AdminPass1!", 4).unwrap();
    let cashier_pw = bcrypt::hash("CashierPass1!", 4).unwrap();
    conn
      .execute_batch(
        r#"
        CREATE TABLE "User" (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          passwordHash TEXT NOT NULL,
          role TEXT NOT NULL,
          isActive INTEGER NOT NULL DEFAULT 1,
          authPinHash TEXT,
          authPinFailCount INTEGER NOT NULL DEFAULT 0,
          authPinLockedUntil TEXT,
          createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        "#,
      )
      .unwrap();
    conn
      .execute(
        r#"INSERT INTO "User" (id, username, passwordHash, role, isActive)
           VALUES ('a1', 'admin', ?1, 'ADMIN', 1)"#,
        [&admin_pw],
      )
      .unwrap();
    conn
      .execute(
        r#"INSERT INTO "User" (id, username, passwordHash, role, isActive)
           VALUES ('c1', 'cashier', ?1, 'CASHIER', 1)"#,
        [&cashier_pw],
      )
      .unwrap();
    assert!(verify_admin_login_password(&conn, "CashierPass1!").is_err());
    assert!(verify_admin_login_password(&conn, "AdminPass1!").is_ok());
  }
}
