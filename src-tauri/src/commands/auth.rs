//! Auth commands — bcrypt verify + Session rows (SHA-256 token hash).

use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::State;

use crate::error::AppError;
use crate::state::AppState;
use crate::util::{now_sqlite};

/// Desktop desk app — long-lived local session (was 12h web TTL).
const SESSION_TTL_HOURS: i64 = 24 * 30;

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

fn hash_session_token(token: &str) -> String {
  let mut hasher = Sha256::new();
  hasher.update(token.as_bytes());
  hex::encode(hasher.finalize())
}

#[tauri::command]
pub fn login(
  state: State<'_, AppState>,
  input: LoginInput,
) -> Result<AuthSession, AppError> {
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

  let token = hex::encode(uuid::Uuid::new_v4().as_bytes())
    + &hex::encode(uuid::Uuid::new_v4().as_bytes());
  let token_hash = hash_session_token(&token);
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
      rusqlite::params![now, id],
    )?;
    conn.execute(
      "INSERT INTO Session (id, userId, tokenHash, expiresAt, revokedAt, createdAt, updatedAt)
       VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?5)",
      rusqlite::params![session_id, id, token_hash, expires_at, now],
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

  Ok(AuthSession {
    user_id: id,
    username: uname,
    full_name,
    role,
    token,
    allowed_screens,
  })
}

#[tauri::command]
pub fn logout(state: State<'_, AppState>, input: TokenInput) -> Result<(), AppError> {
  let token = input.token.trim();
  if token.is_empty() {
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
  Ok(())
}

#[tauri::command]
pub fn current_user(
  state: State<'_, AppState>,
  input: TokenInput,
) -> Result<Option<AuthSession>, AppError> {
  let token = input.token.trim();
  if token.is_empty() {
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
      Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(None),
      Err(e) => return Err(e.into()),
    };

  if revoked_at.is_some() {
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
    return Ok(None);
  }

  Ok(Some(AuthSession {
    user_id,
    username,
    full_name,
    role,
    token: token.to_string(),
    allowed_screens: allowed,
  }))
}
