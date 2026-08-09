//! Desk user accounts — create / update / list with screen rights.

use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::AppError;
use crate::state::AppState;
use crate::util::{now_sqlite};

const ROLES: &[&str] = &["ADMIN", "MANAGER", "CASHIER"];
const BCRYPT_COST: u32 = 12;

/// Screens that can be granted in the desktop app (nav rights).
pub const DESK_SCREENS: &[(&str, &str)] = &[
  ("dashboard", "Dashboard"),
  ("cash", "Cash"),
  ("vaults", "Vaults"),
  ("customers", "Customers"),
  ("exchange", "Exchange"),
  ("hawala", "Hawala"),
  ("partners", "Partner Sarafis"),
  ("trading", "Trading"),
      ("capital", "Owner capital"),
  ("expenses", "Expenses"),
  ("daybook", "Daybook"),
  ("reports", "Reports"),
  ("transactions", "Transactions"),
  ("rates", "Exchange rates"),
  ("settings", "Settings"),
];

fn valid_role(role: &str) -> Result<String, AppError> {
  let role = role.trim().to_ascii_uppercase();
  if !ROLES.contains(&role.as_str()) {
    return Err(AppError::Validation(
      "Role must be ADMIN, MANAGER, or CASHIER.".into(),
    ));
  }
  Ok(role)
}

fn normalize_username(raw: &str) -> Result<String, AppError> {
  let username = raw.trim().to_lowercase();
  if username.len() < 3 || username.len() > 40 {
    return Err(AppError::Validation(
      "Username must be 3–40 characters.".into(),
    ));
  }
  if !username
    .chars()
    .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '.' || c == '-')
  {
    return Err(AppError::Validation(
      "Username may only contain letters, numbers, ., _, or -.".into(),
    ));
  }
  Ok(username)
}

fn normalize_full_name(raw: &str) -> Result<String, AppError> {
  let name = raw.trim().to_string();
  if name.is_empty() {
    return Err(AppError::Validation("Full name is required.".into()));
  }
  if name.len() > 120 {
    return Err(AppError::Validation(
      "Full name must be at most 120 characters.".into(),
    ));
  }
  Ok(name)
}

fn validate_password(password: &str) -> Result<(), AppError> {
  if password.len() < 8 {
    return Err(AppError::Validation(
      "Password must be at least 8 characters.".into(),
    ));
  }
  if password.len() > 128 {
    return Err(AppError::Validation(
      "Password must be at most 128 characters.".into(),
    ));
  }
  Ok(())
}

fn hash_password(password: &str) -> Result<String, AppError> {
  bcrypt::hash(password, BCRYPT_COST)
    .map_err(|e| AppError::Internal(format!("password hash: {e}")))
}

fn normalize_screens(screens: Option<Vec<String>>) -> Result<Option<String>, AppError> {
  let Some(list) = screens else {
    return Ok(None);
  };
  let allowed: Vec<&str> = DESK_SCREENS.iter().map(|(id, _)| *id).collect();
  let mut cleaned = Vec::new();
  for raw in list {
    let id = raw.trim().to_ascii_lowercase();
    if id.is_empty() {
      continue;
    }
    if !allowed.contains(&id.as_str()) {
      return Err(AppError::Validation(format!("Unknown screen right: {id}")));
    }
    if !cleaned.contains(&id) {
      cleaned.push(id);
    }
  }
  let json = serde_json::to_string(&cleaned)
    .map_err(|e| AppError::Internal(format!("screens json: {e}")))?;
  Ok(Some(json))
}

fn parse_screens_json(raw: Option<String>) -> Vec<String> {
  let Some(s) = raw else {
    return Vec::new();
  };
  serde_json::from_str::<Vec<String>>(&s).unwrap_or_default()
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeskScreenOption {
  pub id: String,
  pub label: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserAccount {
  pub id: String,
  pub full_name: String,
  pub username: String,
  pub role: String,
  pub is_active: bool,
  pub allowed_screens: Vec<String>,
  pub created_at: String,
  pub updated_at: String,
}

fn map_user(row: &rusqlite::Row<'_>) -> rusqlite::Result<UserAccount> {
  let screens_raw: Option<String> = row.get(5)?;
  Ok(UserAccount {
    id: row.get(0)?,
    full_name: row.get(1)?,
    username: row.get(2)?,
    role: row.get(3)?,
    is_active: row.get::<_, i64>(4)? != 0,
    allowed_screens: parse_screens_json(screens_raw),
    created_at: row.get(6)?,
    updated_at: row.get(7)?,
  })
}

fn load_user(conn: &rusqlite::Connection, id: &str) -> Result<UserAccount, AppError> {
  conn
    .query_row(
      r#"SELECT id, fullName, username, role, isActive, allowedScreens, createdAt, updatedAt
         FROM User WHERE id = ?1"#,
      [id],
      map_user,
    )
    .map_err(|_| AppError::NotFound("User not found.".into()))
}

#[tauri::command]
pub fn list_desk_screens() -> Result<Vec<DeskScreenOption>, AppError> {
  Ok(
    DESK_SCREENS
      .iter()
      .map(|(id, label)| DeskScreenOption {
        id: (*id).to_string(),
        label: (*label).to_string(),
      })
      .collect(),
  )
}

#[tauri::command]
pub fn list_users(state: State<'_, AppState>) -> Result<Vec<UserAccount>, AppError> {
  let conn = state.db.lock();
  let mut stmt = conn.prepare(
    r#"SELECT id, fullName, username, role, isActive, allowedScreens, createdAt, updatedAt
       FROM User
       ORDER BY fullName COLLATE NOCASE, username COLLATE NOCASE"#,
  )?;
  let items = stmt
    .query_map([], map_user)?
    .collect::<Result<Vec<_>, _>>()?;
  Ok(items)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateUserInput {
  pub full_name: String,
  pub username: String,
  pub password: String,
  pub role: String,
  pub is_active: Option<bool>,
  pub allowed_screens: Option<Vec<String>>,
}

#[tauri::command]
pub fn create_user(
  state: State<'_, AppState>,
  input: CreateUserInput,
) -> Result<UserAccount, AppError> {
  let full_name = normalize_full_name(&input.full_name)?;
  let username = normalize_username(&input.username)?;
  validate_password(&input.password)?;
  let role = valid_role(&input.role)?;
  let is_active = input.is_active.unwrap_or(true);
  let screens_json = normalize_screens(input.allowed_screens)?;
  let password_hash = hash_password(&input.password)?;
  let now = now_sqlite();
  let id = uuid::Uuid::new_v4().to_string();

  let conn = state.db.lock();
  let exists: Option<String> = conn
    .query_row(
      "SELECT id FROM User WHERE lower(username) = ?1 LIMIT 1",
      [&username],
      |row| row.get(0),
    )
    .optional()?;
  if exists.is_some() {
    return Err(AppError::Validation(
      "A user with this username already exists.".into(),
    ));
  }

  conn.execute(
    r#"INSERT INTO User
       (id, fullName, username, passwordHash, role, isActive, allowedScreens, createdAt, updatedAt)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)"#,
    params![
      id,
      full_name,
      username,
      password_hash,
      role,
      if is_active { 1 } else { 0 },
      screens_json,
      now
    ],
  )?;

  load_user(&conn, &id)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateUserInput {
  pub id: String,
  pub full_name: String,
  pub role: String,
  pub is_active: bool,
  pub allowed_screens: Option<Vec<String>>,
  /// Optional actor to prevent locking yourself out of admin.
  pub actor_user_id: Option<String>,
}

#[tauri::command]
pub fn update_user(
  state: State<'_, AppState>,
  input: UpdateUserInput,
) -> Result<UserAccount, AppError> {
  let id = input.id.trim().to_string();
  if id.is_empty() {
    return Err(AppError::Validation("User id is required.".into()));
  }
  let full_name = normalize_full_name(&input.full_name)?;
  let role = valid_role(&input.role)?;
  let screens_json = normalize_screens(input.allowed_screens)?;
  let now = now_sqlite();

  let conn = state.db.lock();
  let existing = load_user(&conn, &id)?;

  if let Some(actor) = input.actor_user_id.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
    if actor == id && !input.is_active {
      return Err(AppError::Validation(
        "You cannot deactivate your own account.".into(),
      ));
    }
    if actor == id && role != "ADMIN" && existing.role == "ADMIN" {
      return Err(AppError::Validation(
        "You cannot remove your own ADMIN role.".into(),
      ));
    }
  }

  let updated = conn.execute(
    r#"UPDATE User
       SET fullName = ?1, role = ?2, isActive = ?3, allowedScreens = ?4, updatedAt = ?5
       WHERE id = ?6"#,
    params![
      full_name,
      role,
      if input.is_active { 1 } else { 0 },
      screens_json,
      now,
      id
    ],
  )?;
  if updated == 0 {
    return Err(AppError::NotFound("User not found.".into()));
  }

  // Revoke sessions when deactivated.
  if !input.is_active {
    let _ = conn.execute(
      "UPDATE Session SET revokedAt = ?1, updatedAt = ?1
       WHERE userId = ?2 AND revokedAt IS NULL",
      params![now, id],
    );
  }

  load_user(&conn, &id)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResetUserPasswordInput {
  pub id: String,
  pub password: String,
}

#[tauri::command]
pub fn reset_user_password(
  state: State<'_, AppState>,
  input: ResetUserPasswordInput,
) -> Result<UserAccount, AppError> {
  let id = input.id.trim().to_string();
  if id.is_empty() {
    return Err(AppError::Validation("User id is required.".into()));
  }
  validate_password(&input.password)?;
  let password_hash = hash_password(&input.password)?;
  let now = now_sqlite();

  let conn = state.db.lock();
  let _ = load_user(&conn, &id)?;
  let updated = conn.execute(
    "UPDATE User SET passwordHash = ?1, updatedAt = ?2 WHERE id = ?3",
    params![password_hash, now, id],
  )?;
  if updated == 0 {
    return Err(AppError::NotFound("User not found.".into()));
  }
  // Force re-login after password change.
  let _ = conn.execute(
    "UPDATE Session SET revokedAt = ?1, updatedAt = ?1
     WHERE userId = ?2 AND revokedAt IS NULL",
    params![now, id],
  );
  load_user(&conn, &id)
}
