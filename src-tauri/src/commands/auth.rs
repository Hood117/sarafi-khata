//! Auth commands — bcrypt verify + Session rows (SHA-256 token hash).

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use chrono::{Duration, Utc};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::Path;
use tauri::{AppHandle, State};

use super::license::require_active_license;
use crate::error::AppError;
use crate::fingerprint::{EnrolledFingerprint, FingerprintService};
use crate::state::AppState;
use crate::util::now_sqlite;

/// Desktop desk app — long-lived local session (was 12h web TTL).
const SESSION_TTL_HOURS: i64 = 24 * 30;

/// Written before restore restart; re-binds the same WebView token into the restored DB.
const RESTORE_SESSION_BRIDGE: &str = "saraf.restore-session.json";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginInput {
  pub username: String,
  pub password: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenInput {
  pub token: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthSession {
  pub user_id: String,
  pub username: String,
  pub full_name: String,
  pub role: String,
  pub token: String,
  pub allowed_screens: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RestoreSessionBridge {
  token: String,
  user_id: String,
  username: String,
}

fn hash_session_token(token: &str) -> String {
  let mut hasher = Sha256::new();
  hasher.update(token.as_bytes());
  hex::encode(hasher.finalize())
}

fn bridge_path(db_path: &Path) -> std::path::PathBuf {
  db_path
    .parent()
    .unwrap_or_else(|| Path::new("."))
    .join(RESTORE_SESSION_BRIDGE)
}

/// Save the current login so restore+restart can keep the user signed in.
pub fn write_restore_session_bridge(
  conn: &Connection,
  db_path: &Path,
  token: &str,
) -> Result<(), AppError> {
  let token = token.trim();
  if token.is_empty() {
    return Ok(());
  }
  let token_hash = hash_session_token(token);
  let row = conn.query_row(
    "SELECT u.id, u.username
     FROM Session s
     INNER JOIN User u ON u.id = s.userId
     WHERE s.tokenHash = ?1 AND s.revokedAt IS NULL
     LIMIT 1",
    [&token_hash],
    |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
  );
  let (user_id, username) = match row {
    Ok(v) => v,
    Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(()),
    Err(e) => return Err(e.into()),
  };
  let payload = RestoreSessionBridge {
    token: token.to_string(),
    user_id,
    username,
  };
  let json = serde_json::to_string_pretty(&payload)
    .map_err(|e| AppError::Internal(format!("restore session bridge: {e}")))?;
  fs::write(bridge_path(db_path), json)
    .map_err(|e| AppError::Io(format!("write restore session bridge: {e}")))?;
  Ok(())
}

/// After a pending DB restore, re-insert the previous session token for the same user.
pub fn apply_restore_session_bridge(conn: &Connection, db_path: &Path) -> Result<(), AppError> {
  let path = bridge_path(db_path);
  if !path.is_file() {
    return Ok(());
  }
  let raw = match fs::read_to_string(&path) {
    Ok(s) => s,
    Err(_) => {
      let _ = fs::remove_file(&path);
      return Ok(());
    }
  };
  let bridge: RestoreSessionBridge = match serde_json::from_str(&raw) {
    Ok(v) => v,
    Err(e) => {
      log::warn!("invalid restore session bridge: {e}");
      let _ = fs::remove_file(&path);
      return Ok(());
    }
  };
  let _ = fs::remove_file(&path);

  let token = bridge.token.trim();
  if token.is_empty() {
    return Ok(());
  }

  // Prefer same user id; fall back to username (ids can differ across old backups).
  let user = conn
    .query_row(
      "SELECT id, isActive FROM User WHERE id = ?1 LIMIT 1",
      [&bridge.user_id],
      |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)),
    )
    .or_else(|_| {
      conn.query_row(
        "SELECT id, isActive FROM User WHERE lower(username) = lower(?1) LIMIT 1",
        [&bridge.username],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)),
      )
    });

  let (user_id, is_active) = match user {
    Ok(v) => v,
    Err(rusqlite::Error::QueryReturnedNoRows) => {
      log::warn!(
        "restore session bridge: user {} / {} missing in restored DB",
        bridge.user_id,
        bridge.username
      );
      return Ok(());
    }
    Err(e) => return Err(e.into()),
  };
  if is_active == 0 {
    log::warn!("restore session bridge: user {user_id} is inactive");
    return Ok(());
  }

  let token_hash = hash_session_token(token);
  let expires_at = (Utc::now() + Duration::hours(SESSION_TTL_HOURS))
    .format("%Y-%m-%d %H:%M:%S%.3f")
    .to_string();
  let now = now_sqlite();
  let session_id = uuid::Uuid::new_v4().to_string();

  conn.execute_batch("BEGIN IMMEDIATE;")?;
  let persist = (|| -> Result<(), AppError> {
    conn.execute(
      "UPDATE Session SET revokedAt = ?1, updatedAt = ?1
       WHERE userId = ?2 AND revokedAt IS NULL",
      rusqlite::params![now, user_id],
    )?;
    // Drop any leftover row that already used this token hash.
    conn.execute("DELETE FROM Session WHERE tokenHash = ?1", [&token_hash])?;
    conn.execute(
      "INSERT INTO Session (id, userId, tokenHash, expiresAt, revokedAt, createdAt, updatedAt)
       VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?5)",
      rusqlite::params![session_id, user_id, token_hash, expires_at, now],
    )?;
    Ok(())
  })();
  match persist {
    Ok(()) => conn.execute_batch("COMMIT;")?,
    Err(e) => {
      let _ = conn.execute_batch("ROLLBACK;");
      return Err(e);
    }
  }
  log::info!("restored login session for user {user_id} after backup restore");
  Ok(())
}

fn issue_session(
  state: &AppState,
  user_id: &str,
  username: &str,
  full_name: &str,
  role: &str,
  allowed_screens: Option<String>,
) -> Result<AuthSession, AppError> {
  let token = hex::encode(uuid::Uuid::new_v4().as_bytes())
    + &hex::encode(uuid::Uuid::new_v4().as_bytes());
  let token_hash = hash_session_token(&token);
  let expires_at = (Utc::now() + Duration::hours(SESSION_TTL_HOURS))
    .format("%Y-%m-%d %H:%M:%S%.3f")
    .to_string();
  let now = now_sqlite();
  let session_id = uuid::Uuid::new_v4().to_string();

  let conn = state.db.lock();
  conn.execute_batch("BEGIN IMMEDIATE;")?;
  let persist = (|| -> Result<(), AppError> {
    conn.execute(
      "UPDATE Session SET revokedAt = ?1, updatedAt = ?1
       WHERE userId = ?2 AND revokedAt IS NULL",
      rusqlite::params![now, user_id],
    )?;
    conn.execute(
      "INSERT INTO Session (id, userId, tokenHash, expiresAt, revokedAt, createdAt, updatedAt)
       VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?5)",
      rusqlite::params![session_id, user_id, token_hash, expires_at, now],
    )?;
    Ok(())
  })();

  match persist {
    Ok(()) => conn.execute_batch("COMMIT;")?,
    Err(e) => {
      let _ = conn.execute_batch("ROLLBACK;");
      return Err(e);
    }
  }
  drop(conn);
  crate::commands::authorize::set_session_token(state, &token);

  Ok(AuthSession {
    user_id: user_id.to_string(),
    username: username.to_string(),
    full_name: full_name.to_string(),
    role: role.to_string(),
    token,
    allowed_screens,
  })
}

fn load_user_fingerprint_templates(
  conn: &Connection,
) -> Result<(String, Vec<EnrolledFingerprint>), AppError> {
  let mut stmt = conn.prepare(
    r#"SELECT id, fingerprintTemplate, updatedAt FROM User
       WHERE isActive = 1
         AND fingerprintTemplate IS NOT NULL
         AND TRIM(fingerprintTemplate) != ''"#,
  )?;
  let rows = stmt.query_map([], |row| {
    Ok((
      row.get::<_, String>(0)?,
      row.get::<_, String>(1)?,
      row.get::<_, Option<String>>(2)?,
    ))
  })?;

  let mut enrolled = Vec::new();
  let mut max_updated = String::new();
  for row in rows {
    let (user_id, template_b64, updated_at) = row?;
    let Ok(template) = B64.decode(template_b64.trim()) else {
      continue;
    };
    if template.is_empty() {
      continue;
    }
    if let Some(updated) = updated_at {
      if updated > max_updated {
        max_updated = updated;
      }
    }
    enrolled.push(EnrolledFingerprint {
      // Reuse match-key field; identify returns this as customer_id.
      customer_id: user_id,
      template,
    });
  }
  let version = format!("{}|{}", enrolled.len(), max_updated);
  Ok((version, enrolled))
}

#[tauri::command]
pub fn login(
  app: AppHandle,
  state: State<'_, AppState>,
  input: LoginInput,
) -> Result<AuthSession, AppError> {
  require_active_license(&app)?;
  let username = input.username.trim().to_lowercase();
  if username.is_empty() || input.password.is_empty() {
    return Err(AppError::Validation(
      "Username and password are required.".into(),
    ));
  }

  let conn = state.db.lock();
  let row = conn.query_row(
    "SELECT id, username, fullName, role, passwordHash, isActive, allowedScreens
     FROM User
     WHERE lower(username) = ?1
     LIMIT 1",
    [&username],
    |row| {
      Ok((
        row.get::<_, String>(0)?,
        row.get::<_, String>(1)?,
        row.get::<_, String>(2)?,
        row.get::<_, String>(3)?,
        row.get::<_, String>(4)?,
        row.get::<_, i64>(5)?,
        row.get::<_, Option<String>>(6)?,
      ))
    },
  );

  let (id, uname, full_name, role, password_hash, is_active, allowed_screens) = match row {
    Ok(v) => v,
    Err(rusqlite::Error::QueryReturnedNoRows) => {
      return Err(AppError::Auth("Invalid username or password.".into()));
    }
    Err(e) => return Err(e.into()),
  };

  if is_active == 0 {
    return Err(AppError::Auth("This account is inactive.".into()));
  }

  let valid = bcrypt::verify(input.password.as_bytes(), &password_hash)
    .map_err(|e| AppError::Internal(format!("password verify: {e}")))?;

  if !valid {
    return Err(AppError::Auth("Invalid username or password.".into()));
  }
  drop(conn);

  issue_session(
    &state,
    &id,
    &uname,
    &full_name,
    &role,
    allowed_screens,
  )
}

/// Capture one fingerprint and sign in the matching active desk user (1:N).
/// Unauthenticated — used on the login screen only. Never matches Customer templates.
#[tauri::command]
pub async fn login_with_fingerprint(
  app: AppHandle,
  fingerprint: State<'_, FingerprintService>,
  state: State<'_, AppState>,
) -> Result<AuthSession, AppError> {
  require_active_license(&app)?;
  let (version, enrolled) = {
    let conn = state.db.lock();
    load_user_fingerprint_templates(&conn)?
  };
  if enrolled.is_empty() {
    return Err(AppError::Auth(
      "No desk users have a fingerprint enrolled yet.".into(),
    ));
  }

  let fingerprint = fingerprint.inner().clone();
  let identified = tauri::async_runtime::spawn_blocking(move || {
    fingerprint.identify_one(Some((version, enrolled)))
  })
  .await
  .map_err(|e| AppError::Internal(format!("Fingerprint login task failed: {e}")))??;

  if !identified.ok {
    return Err(AppError::Auth(
      "Fingerprint not recognized. Try again or sign in with username and password.".into(),
    ));
  }
  let Some(user_id) = identified.customer_id.filter(|id| !id.trim().is_empty()) else {
    return Err(AppError::Auth(
      "Fingerprint not recognized. Try again or sign in with username and password.".into(),
    ));
  };

  let conn = state.db.lock();
  let row = conn.query_row(
    "SELECT id, username, fullName, role, isActive, allowedScreens
     FROM User
     WHERE id = ?1
     LIMIT 1",
    [&user_id],
    |row| {
      Ok((
        row.get::<_, String>(0)?,
        row.get::<_, String>(1)?,
        row.get::<_, String>(2)?,
        row.get::<_, String>(3)?,
        row.get::<_, i64>(4)?,
        row.get::<_, Option<String>>(5)?,
      ))
    },
  );
  let (id, uname, full_name, role, is_active, allowed_screens) = match row {
    Ok(v) => v,
    Err(rusqlite::Error::QueryReturnedNoRows) => {
      return Err(AppError::Auth(
        "Fingerprint not recognized. Try again or sign in with username and password.".into(),
      ));
    }
    Err(e) => return Err(e.into()),
  };
  if is_active == 0 {
    return Err(AppError::Auth("This account is inactive.".into()));
  }
  drop(conn);

  issue_session(
    &state,
    &id,
    &uname,
    &full_name,
    &role,
    allowed_screens,
  )
}

#[tauri::command]
pub fn logout(state: State<'_, AppState>, input: TokenInput) -> Result<(), AppError> {
  let token = input.token.trim();
  if token.is_empty() {
    crate::commands::authorize::clear_session_token(&state);
    return Ok(());
  }
  let token_hash = hash_session_token(token);
  let now = now_sqlite();
  let conn = state.db.lock();
  conn.execute(
    "UPDATE Session SET revokedAt = ?1, updatedAt = ?1
     WHERE tokenHash = ?2 AND revokedAt IS NULL",
    rusqlite::params![now, token_hash],
  )?;
  drop(conn);
  crate::commands::authorize::clear_session_token(&state);
  Ok(())
}

#[tauri::command]
pub fn current_user(
  state: State<'_, AppState>,
  input: TokenInput,
) -> Result<Option<AuthSession>, AppError> {
  let token = input.token.trim();
  if token.is_empty() {
    crate::commands::authorize::clear_session_token(&state);
    return Ok(None);
  }
  let token_hash = hash_session_token(token);
  let conn = state.db.lock();

  let row = conn.query_row(
    "SELECT s.id, s.expiresAt, s.revokedAt,
            u.id, u.username, u.fullName, u.role, u.isActive, u.allowedScreens
     FROM Session s
     INNER JOIN User u ON u.id = s.userId
     WHERE s.tokenHash = ?1
     LIMIT 1",
    [&token_hash],
    |row| {
      Ok((
        row.get::<_, String>(0)?,
        row.get::<_, String>(1)?,
        row.get::<_, Option<String>>(2)?,
        row.get::<_, String>(3)?,
        row.get::<_, String>(4)?,
        row.get::<_, String>(5)?,
        row.get::<_, String>(6)?,
        row.get::<_, i64>(7)?,
        row.get::<_, Option<String>>(8)?,
      ))
    },
  );

  let (session_id, expires_at, revoked_at, user_id, username, full_name, role, is_active, allowed) =
    match row {
      Ok(v) => v,
      Err(rusqlite::Error::QueryReturnedNoRows) => {
        drop(conn);
        crate::commands::authorize::clear_session_token(&state);
        return Ok(None);
      }
      Err(e) => return Err(e.into()),
    };

  if revoked_at.is_some() {
    drop(conn);
    crate::commands::authorize::clear_session_token(&state);
    return Ok(None);
  }

  let expired = chrono::NaiveDateTime::parse_from_str(&expires_at, "%Y-%m-%d %H:%M:%S%.3f")
    .or_else(|_| chrono::NaiveDateTime::parse_from_str(&expires_at, "%Y-%m-%d %H:%M:%S"))
    .map(|dt| dt < Utc::now().naive_utc())
    .unwrap_or(true);

  if expired || is_active == 0 {
    let now = now_sqlite();
    let _ = conn.execute(
      "UPDATE Session SET revokedAt = ?1, updatedAt = ?1
       WHERE id = ?2 AND revokedAt IS NULL",
      rusqlite::params![now, session_id],
    );
    drop(conn);
    crate::commands::authorize::clear_session_token(&state);
    return Ok(None);
  }

  drop(conn);
  crate::commands::authorize::set_session_token(&state, token);

  Ok(Some(AuthSession {
    user_id,
    username,
    full_name,
    role,
    token: token.to_string(),
    allowed_screens: allowed,
  }))
}
