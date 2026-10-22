//! Desk user accounts — create / update / list with screen rights.

use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::commands::authorize::{self, DESK_SCREENS};
use crate::error::AppError;
use crate::state::AppState;
use crate::util::now_sqlite;

const ROLES: &[&str] = &["ADMIN", "MANAGER", "CASHIER"];
const BCRYPT_COST: u32 = 12;

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

fn normalize_screen_rights(
  screens: Option<std::collections::HashMap<String, String>>,
) -> Result<Option<String>, AppError> {
  let Some(map) = screens else {
    return Ok(None);
  };
  let mut cleaned = std::collections::BTreeMap::<String, String>::new();
  for (raw_id, raw_access) in map {
    let id = raw_id.trim();
    if id.is_empty() {
      continue;
    }
    let Some(canon) = DESK_SCREENS
      .iter()
      .find(|(allowed, _)| allowed.eq_ignore_ascii_case(id))
      .map(|(allowed, _)| (*allowed).to_string())
    else {
      return Err(AppError::Validation(format!("Unknown screen right: {id}")));
    };
    let Some(access) = authorize::ScreenAccess::parse(&raw_access) else {
      return Err(AppError::Validation(format!(
        "Screen access must be read or write ({canon})."
      )));
    };
    cleaned.insert(canon, access.as_str().to_string());
  }
  let json = serde_json::to_string(&cleaned)
    .map_err(|e| AppError::Internal(format!("screens json: {e}")))?;
  Ok(Some(json))
}

fn rights_to_api_map(
  rights: Option<std::collections::HashMap<String, authorize::ScreenAccess>>,
) -> std::collections::HashMap<String, String> {
  let Some(map) = rights else {
    return std::collections::HashMap::new();
  };
  map
    .into_iter()
    .map(|(k, v)| (k, v.as_str().to_string()))
    .collect()
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
  /// Screens the user can open (read or write).
  pub allowed_screens: Vec<String>,
  /// Per-screen access: `"read"` or `"write"`.
  pub screen_rights: std::collections::HashMap<String, String>,
  /// True when this user holds a configured authorization PIN (hash never exposed).
  pub auth_pin_configured: bool,
  /// True when a fingerprint template is enrolled for desk sign-in.
  pub fingerprint_enrolled: bool,
  pub created_at: String,
  pub updated_at: String,
}

fn map_user(row: &rusqlite::Row<'_>) -> rusqlite::Result<UserAccount> {
  let screens_raw: Option<String> = row.get(5)?;
  let pin_hash: Option<String> = row.get(8)?;
  let fingerprint_flag: i64 = row.get(9).unwrap_or(0);
  let rights = authorize::parse_screen_rights(screens_raw);
  let allowed_screens = rights
    .as_ref()
    .map(|m| {
      let mut keys: Vec<String> = m.keys().cloned().collect();
      keys.sort();
      keys
    })
    .unwrap_or_default();
  Ok(UserAccount {
    id: row.get(0)?,
    full_name: row.get(1)?,
    username: row.get(2)?,
    role: row.get(3)?,
    is_active: row.get::<_, i64>(4)? != 0,
    allowed_screens,
    screen_rights: rights_to_api_map(rights),
    auth_pin_configured: pin_hash
      .as_ref()
      .map(|h| !h.trim().is_empty())
      .unwrap_or(false),
    fingerprint_enrolled: fingerprint_flag != 0,
    created_at: row.get(6)?,
    updated_at: row.get(7)?,
  })
}

const USER_SELECT: &str = r#"SELECT id, fullName, username, role, isActive, allowedScreens,
       createdAt, updatedAt, authPinHash,
       CASE
         WHEN fingerprintTemplate IS NOT NULL AND TRIM(fingerprintTemplate) != '' THEN 1
         ELSE 0
       END AS fingerprintEnrolled
       FROM User"#;

fn load_user(conn: &rusqlite::Connection, id: &str) -> Result<UserAccount, AppError> {
  conn
    .query_row(
      &format!("{USER_SELECT} WHERE id = ?1"),
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
  let _actor = authorize::require_user_admin(&state, &conn)?;
  let mut stmt = conn.prepare(&format!(
    "{USER_SELECT}
     ORDER BY fullName COLLATE NOCASE, username COLLATE NOCASE"
  ))?;
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
  /// Prefer `screen_rights`. Legacy `allowed_screens` list is treated as write access.
  pub allowed_screens: Option<Vec<String>>,
  pub screen_rights: Option<std::collections::HashMap<String, String>>,
}

#[tauri::command]
pub fn create_user(
  state: State<'_, AppState>,
  input: CreateUserInput,
) -> Result<UserAccount, AppError> {
  let full_name = normalize_full_name(&input.full_name)?;
  let username = normalize_username(&input.username)?;
  if authorize::is_system_admin_username(&username) {
    return Err(AppError::Validation(
      "Username 'Saraf@@' is reserved for the System Administrator.".into(),
    ));
  }
  validate_password(&input.password)?;
  let role = valid_role(&input.role)?;
  let is_active = input.is_active.unwrap_or(true);
  let screens_json = if input.screen_rights.is_some() {
    normalize_screen_rights(input.screen_rights)?
  } else if let Some(list) = input.allowed_screens {
    let mut map = std::collections::HashMap::new();
    for id in list {
      map.insert(id, "write".to_string());
    }
    normalize_screen_rights(Some(map))?
  } else {
    None
  };
  let password_hash = hash_password(&input.password)?;
  let now = now_sqlite();
  let id = uuid::Uuid::new_v4().to_string();

  let conn = state.db.lock();
  let _actor = authorize::require_user_admin(&state, &conn)?;
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
  pub screen_rights: Option<std::collections::HashMap<String, String>>,
  /// Optional actor to prevent locking yourself out of admin.
  pub actor_user_id: Option<String>,
  /// Required when editing a System Administrator / ADMIN account.
  pub confirm_password: Option<String>,
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
  let now = now_sqlite();

  let conn = state.db.lock();
  let actor = authorize::require_user_admin(&state, &conn)?;
  let existing = load_user(&conn, &id)?;

  let is_system_admin = authorize::is_system_admin_username(&existing.username);
  if is_system_admin {
    // Built-in admin: only fullName may change. Role/status/screens are forced.
    let password = input
      .confirm_password
      .as_deref()
      .map(str::trim)
      .filter(|s| !s.is_empty())
      .ok_or_else(|| {
        AppError::Validation(
          "System Administrator password is required to change this account.".into(),
        )
      })?;
    let hash: String = conn.query_row(
      r#"SELECT passwordHash FROM "User" WHERE id = ?1"#,
      [&id],
      |row| row.get(0),
    )?;
    let ok = bcrypt::verify(password, &hash)
      .map_err(|e| AppError::Internal(format!("password verify: {e}")))?;
    if !ok {
      return Err(AppError::Auth("Incorrect password.".into()));
    }

    let updated = conn.execute(
      r#"UPDATE User
         SET fullName = ?1, role = 'ADMIN', isActive = 1, allowedScreens = NULL, updatedAt = ?2
         WHERE id = ?3"#,
      params![full_name, now, id],
    )?;
    if updated == 0 {
      return Err(AppError::NotFound("User not found.".into()));
    }
    let _ = authorize::ensure_system_admin_protected(&conn);
    return load_user(&conn, &id);
  }

  let role = valid_role(&input.role)?;
  let screens_json = if input.screen_rights.is_some() {
    normalize_screen_rights(input.screen_rights)?
  } else if let Some(list) = input.allowed_screens {
    let mut map = std::collections::HashMap::new();
    for id in list {
      map.insert(id, "write".to_string());
    }
    normalize_screen_rights(Some(map))?
  } else {
    None
  };

  if actor.id == id && !input.is_active {
    return Err(AppError::Validation(
      "You cannot deactivate your own account.".into(),
    ));
  }
  if actor.id == id && role != "ADMIN" && existing.role == "ADMIN" {
    return Err(AppError::Validation(
      "You cannot remove your own ADMIN role.".into(),
    ));
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
pub struct DeleteUserInput {
  pub id: String,
}

#[tauri::command]
pub fn delete_user(
  state: State<'_, AppState>,
  input: DeleteUserInput,
) -> Result<(), AppError> {
  let id = input.id.trim().to_string();
  if id.is_empty() {
    return Err(AppError::Validation("User id is required.".into()));
  }
  let now = now_sqlite();
  let conn = state.db.lock();
  let actor = authorize::require_user_admin(&state, &conn)?;
  let existing = load_user(&conn, &id)?;

  if authorize::is_system_admin_username(&existing.username) {
    return Err(AppError::Validation(
      "The System Administrator account cannot be deleted.".into(),
    ));
  }
  if actor.id == id {
    return Err(AppError::Validation(
      "You cannot delete your own account.".into(),
    ));
  }

  // End active sessions first.
  let _ = conn.execute(
    "UPDATE Session SET revokedAt = ?1, updatedAt = ?1
     WHERE userId = ?2 AND revokedAt IS NULL",
    params![now, id],
  );
  // Remove session rows for this user to avoid orphans.
  let _ = conn.execute("DELETE FROM Session WHERE userId = ?1", params![id]);

  match conn.execute(r#"DELETE FROM "User" WHERE id = ?1"#, params![id]) {
    Ok(0) => Err(AppError::NotFound("User not found.".into())),
    Ok(_) => Ok(()),
    Err(e) => {
      let msg = e.to_string();
      if msg.contains("FOREIGN KEY") || msg.to_ascii_lowercase().contains("constraint") {
        Err(AppError::Validation(
          "This user cannot be deleted because they are linked to existing records. Deactivate the account instead.".into(),
        ))
      } else {
        Err(e.into())
      }
    }
  }
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
  let _actor = authorize::require_user_admin(&state, &conn)?;
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
