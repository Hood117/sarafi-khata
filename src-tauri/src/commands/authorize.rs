//! Centralized session → user → role/screen authorization for Tauri commands.
//! Frontend-supplied `createdById` / `actorUserId` must never decide authorization.

use std::collections::HashMap;

use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::state::AppState;
use crate::util::now_sqlite;

const SYSTEM_ADMIN_USERNAME: &str = "Saraf@@";
const LEGACY_SYSTEM_ADMIN_USERNAME: &str = "admin";
const SYSTEM_ADMIN_PASSWORD: &str = "Saraf@@!!77";

/// Screens that can be granted in the desktop app (nav rights).
pub const DESK_SCREENS: &[(&str, &str)] = &[
  ("dashboard", "Dashboard"),
  ("cash", "Cash"),
  ("vaults", "Vaults"),
  ("customers", "Customers"),
  ("debtorsCreditors", "Debtors & Creditors"),
  ("hawala", "Hawala"),
  ("accountOrders", "Account Orders"),
  ("partners", "Partner Sarafis"),
  ("trading", "Trading"),
  ("capital", "Owner capital"),
  ("expenses", "Expenses"),
  ("employees", "Employees"),
  ("daybook", "Daybook"),
  ("reports", "Reports"),
  ("transactions", "Transactions"),
  ("rates", "Exchange rates"),
  ("calculator", "Calculator"),
  ("settings", "Settings"),
];

/// Per-screen capability. Write always includes read.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScreenAccess {
  Read,
  Write,
}

impl ScreenAccess {
  pub fn as_str(self) -> &'static str {
    match self {
      ScreenAccess::Read => "read",
      ScreenAccess::Write => "write",
    }
  }

  pub fn parse(raw: &str) -> Option<Self> {
    match raw.trim().to_ascii_lowercase().as_str() {
      "read" | "r" => Some(ScreenAccess::Read),
      "write" | "w" | "full" | "rw" => Some(ScreenAccess::Write),
      _ => None,
    }
  }

  pub fn allows_write(self) -> bool {
    matches!(self, ScreenAccess::Write)
  }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthUser {
  pub id: String,
  pub username: String,
  pub full_name: String,
  pub role: String,
  /// `None` = unrestricted (legacy NULL, or built-in system admin).
  #[serde(skip)]
  pub allowed_screens: Option<HashMap<String, ScreenAccess>>,
}

impl AuthUser {
  pub fn is_system_admin(&self) -> bool {
    is_system_admin_username(&self.username)
  }

  pub fn is_admin_role(&self) -> bool {
    self.is_system_admin() || self.role.eq_ignore_ascii_case("ADMIN")
  }

  /// Can open / view the screen (read or write grant).
  pub fn has_screen(&self, screen_id: &str) -> bool {
    if self.is_system_admin() {
      return true;
    }
    let Some(screens) = self.allowed_screens.as_ref() else {
      // NULL in DB → legacy full access (do not break existing users).
      return true;
    };
    screens.contains_key(screen_id)
  }

  /// Can create / edit / post on the screen.
  pub fn has_screen_write(&self, screen_id: &str) -> bool {
    if self.is_system_admin() {
      return true;
    }
    let Some(screens) = self.allowed_screens.as_ref() else {
      return true;
    };
    screens
      .get(screen_id)
      .map(|a| a.allows_write())
      .unwrap_or(false)
  }
}

pub fn is_system_admin_username(username: &str) -> bool {
  let u = username.trim();
  u.eq_ignore_ascii_case(SYSTEM_ADMIN_USERNAME)
    || u.eq_ignore_ascii_case(LEGACY_SYSTEM_ADMIN_USERNAME)
}

/// Public for migrate seeding / credential sync.
pub fn system_admin_username() -> &'static str {
  SYSTEM_ADMIN_USERNAME
}

pub fn system_admin_password() -> &'static str {
  SYSTEM_ADMIN_PASSWORD
}

fn hash_session_token(token: &str) -> String {
  use sha2::{Digest, Sha256};
  let mut hasher = Sha256::new();
  hasher.update(token.as_bytes());
  hex::encode(hasher.finalize())
}

/// Parse `User.allowedScreens` JSON.
/// Supports legacy `["cash","customers"]` (all write) and map `{"cash":"read","customers":"write"}`.
pub fn parse_screen_rights(raw: Option<String>) -> Option<HashMap<String, ScreenAccess>> {
  let Some(s) = raw.filter(|v| !v.trim().is_empty()) else {
    return None;
  };
  let allowed: Vec<&str> = DESK_SCREENS.iter().map(|(id, _)| *id).collect();

  if let Ok(map) = serde_json::from_str::<HashMap<String, String>>(&s) {
    let mut out = HashMap::new();
    for (key, value) in map {
      let id = key.trim();
      if id.is_empty() {
        continue;
      }
      let Some(canon) = allowed
        .iter()
        .find(|c| c.eq_ignore_ascii_case(id))
        .copied()
      else {
        continue;
      };
      let Some(access) = ScreenAccess::parse(&value) else {
        continue;
      };
      out.insert(canon.to_string(), access);
    }
    return Some(out);
  }

  if let Ok(list) = serde_json::from_str::<Vec<String>>(&s) {
    let mut out = HashMap::new();
    for id in list {
      let id = id.trim();
      if id.is_empty() {
        continue;
      }
      if let Some(canon) = allowed
        .iter()
        .find(|c| c.eq_ignore_ascii_case(id))
        .copied()
      {
        out.insert(canon.to_string(), ScreenAccess::Write);
      }
    }
    return Some(out);
  }

  None
}

fn resolve_token(conn: &Connection, token: &str) -> Result<AuthUser, AppError> {
  let token = token.trim();
  if token.is_empty() {
    return Err(AppError::Auth(
      "ACCESS_DENIED: Sign in required.".into(),
    ));
  }
  let token_hash = hash_session_token(token);
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

  let (session_id, expires_at, revoked_at, user_id, username, full_name, role, is_active, screens_raw) =
    match row {
      Ok(v) => v,
      Err(rusqlite::Error::QueryReturnedNoRows) => {
        return Err(AppError::Auth(
          "ACCESS_DENIED: Session expired. Please sign in again.".into(),
        ));
      }
      Err(e) => return Err(e.into()),
    };

  if revoked_at.is_some() {
    return Err(AppError::Auth(
      "ACCESS_DENIED: Session expired. Please sign in again.".into(),
    ));
  }

  let expired = chrono::NaiveDateTime::parse_from_str(&expires_at, "%Y-%m-%d %H:%M:%S%.3f")
    .or_else(|_| chrono::NaiveDateTime::parse_from_str(&expires_at, "%Y-%m-%d %H:%M:%S"))
    .map(|dt| dt < chrono::Utc::now().naive_utc())
    .unwrap_or(true);

  if expired || is_active == 0 {
    let now = now_sqlite();
    let _ = conn.execute(
      "UPDATE Session SET revokedAt = ?1, updatedAt = ?1
       WHERE id = ?2 AND revokedAt IS NULL",
      rusqlite::params![now, session_id],
    );
    return Err(AppError::Auth(
      "ACCESS_DENIED: Session expired. Please sign in again.".into(),
    ));
  }

  let mut user = AuthUser {
    id: user_id,
    username,
    full_name,
    role,
    allowed_screens: parse_screen_rights(screens_raw),
  };

  // Built-in System Administrator is always fully privileged.
  if is_system_admin_username(&user.username) {
    user.role = "ADMIN".into();
    user.allowed_screens = None;
  }

  Ok(user)
}

/// Bind the WebView session token into process state (called before privileged invokes).
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BindSessionInput {
  pub token: Option<String>,
}

#[tauri::command]
pub fn bind_session(
  state: tauri::State<'_, AppState>,
  input: BindSessionInput,
) -> Result<(), AppError> {
  set_session_token_opt(&state, input.token);
  Ok(())
}

pub fn set_session_token(state: &AppState, token: &str) {
  set_session_token_opt(state, Some(token.to_string()));
}

fn set_session_token_opt(state: &AppState, token: Option<String>) {
  let mut slot = state.session_token.lock();
  *slot = token
    .map(|t| t.trim().to_string())
    .filter(|t| !t.is_empty());
}

pub fn clear_session_token(state: &AppState) {
  *state.session_token.lock() = None;
}

/// Resolve the authenticated user from the bound session token.
pub fn require_auth(state: &AppState, conn: &Connection) -> Result<AuthUser, AppError> {
  let token = state.session_token.lock().clone();
  let Some(token) = token else {
    return Err(AppError::Auth(
      "ACCESS_DENIED: Sign in required.".into(),
    ));
  };
  resolve_token(conn, &token)
}

/// Can open / view the screen (read or write).
pub fn require_screen(
  state: &AppState,
  conn: &Connection,
  screen_id: &str,
) -> Result<AuthUser, AppError> {
  let user = require_auth(state, conn)?;
  if !user.has_screen(screen_id) {
    return Err(AppError::Auth(format!(
      "ACCESS_DENIED: You do not have permission for this area ({screen_id})."
    )));
  }
  Ok(user)
}

/// Can create / edit / post on the screen.
pub fn require_screen_write(
  state: &AppState,
  conn: &Connection,
  screen_id: &str,
) -> Result<AuthUser, AppError> {
  let user = require_auth(state, conn)?;
  if !user.has_screen_write(screen_id) {
    return Err(AppError::Auth(format!(
      "ACCESS_DENIED: You have read-only access to this area ({screen_id})."
    )));
  }
  Ok(user)
}

pub fn require_any_screen(
  state: &AppState,
  conn: &Connection,
  screen_ids: &[&str],
) -> Result<AuthUser, AppError> {
  let user = require_auth(state, conn)?;
  if screen_ids.iter().any(|id| user.has_screen(id)) {
    return Ok(user);
  }
  Err(AppError::Auth(
    "ACCESS_DENIED: You do not have permission for this operation.".into(),
  ))
}

pub fn require_any_screen_write(
  state: &AppState,
  conn: &Connection,
  screen_ids: &[&str],
) -> Result<AuthUser, AppError> {
  let user = require_auth(state, conn)?;
  if screen_ids.iter().any(|id| user.has_screen_write(id)) {
    return Ok(user);
  }
  Err(AppError::Auth(
    "ACCESS_DENIED: You have read-only access for this operation.".into(),
  ))
}

/// ADMIN role or built-in System Administrator (`admin`).
pub fn require_admin(state: &AppState, conn: &Connection) -> Result<AuthUser, AppError> {
  let user = require_auth(state, conn)?;
  if !user.is_admin_role() {
    return Err(AppError::Auth(
      "ACCESS_DENIED: Administrator permission required.".into(),
    ));
  }
  Ok(user)
}

/// Settings screen (or admin). Used for locale/business prefs that are not user-admin.
pub fn require_settings(state: &AppState, conn: &Connection) -> Result<AuthUser, AppError> {
  require_screen(state, conn, "settings")
}

/// User management / backup: ADMIN role **and** Settings screen (unless built-in system admin).
pub fn require_user_admin(state: &AppState, conn: &Connection) -> Result<AuthUser, AppError> {
  let user = require_auth(state, conn)?;
  if user.is_system_admin() {
    return Ok(user);
  }
  if user.is_admin_role() && user.has_screen("settings") {
    return Ok(user);
  }
  Err(AppError::Auth(
    "ACCESS_DENIED: Administrator permission required.".into(),
  ))
}

/// Keep the built-in System Administrator row permanently privileged.
pub fn ensure_system_admin_protected(conn: &Connection) -> Result<(), AppError> {
  let _ = conn.execute(
    r#"UPDATE "User"
       SET role = 'ADMIN',
           isActive = 1,
           allowedScreens = NULL,
           updatedAt = COALESCE(updatedAt, CURRENT_TIMESTAMP)
       WHERE lower(username) = lower(?1)
          OR lower(username) = lower(?2)"#,
    rusqlite::params![SYSTEM_ADMIN_USERNAME, LEGACY_SYSTEM_ADMIN_USERNAME],
  )?;
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn system_admin_has_every_screen() {
    let user = AuthUser {
      id: "1".into(),
      username: "Saraf@@".into(),
      full_name: "Admin".into(),
      role: "ADMIN".into(),
      allowed_screens: Some(HashMap::from([(
        "dashboard".into(),
        ScreenAccess::Read,
      )])),
    };
    assert!(user.is_system_admin());
    assert!(user.has_screen("settings"));
    assert!(user.has_screen_write("reports"));
  }

  #[test]
  fn admin_role_honors_assigned_screens() {
    let user = AuthUser {
      id: "4".into(),
      username: "shopadmin".into(),
      full_name: "Shop Admin".into(),
      role: "ADMIN".into(),
      allowed_screens: Some(HashMap::from([
        ("dashboard".into(), ScreenAccess::Write),
        ("customers".into(), ScreenAccess::Write),
        ("settings".into(), ScreenAccess::Write),
      ])),
    };
    assert!(user.is_admin_role());
    assert!(!user.is_system_admin());
    assert!(user.has_screen("customers"));
    assert!(user.has_screen_write("settings"));
    assert!(!user.has_screen("hawala"));
    assert!(!user.has_screen("partners"));
  }

  #[test]
  fn restricted_user_honors_screen_list() {
    let user = AuthUser {
      id: "2".into(),
      username: "cashier1".into(),
      full_name: "Cashier".into(),
      role: "CASHIER".into(),
      allowed_screens: Some(HashMap::from([
        ("dashboard".into(), ScreenAccess::Write),
        ("cash".into(), ScreenAccess::Read),
        ("vaults".into(), ScreenAccess::Write),
      ])),
    };
    assert!(user.has_screen("dashboard"));
    assert!(user.has_screen("cash"));
    assert!(!user.has_screen_write("cash"));
    assert!(user.has_screen_write("vaults"));
    assert!(!user.has_screen("customers"));
    assert!(!user.has_screen("settings"));
  }

  #[test]
  fn null_screens_means_legacy_full_access() {
    let user = AuthUser {
      id: "3".into(),
      username: "old".into(),
      full_name: "Old".into(),
      role: "MANAGER".into(),
      allowed_screens: None,
    };
    assert!(user.has_screen("reports"));
    assert!(user.has_screen_write("reports"));
  }

  #[test]
  fn parses_legacy_array_as_write() {
    let rights = parse_screen_rights(Some(r#"["cash","customers"]"#.into())).unwrap();
    assert_eq!(rights.get("cash"), Some(&ScreenAccess::Write));
    assert_eq!(rights.get("customers"), Some(&ScreenAccess::Write));
  }

  #[test]
  fn parses_rights_map() {
    let rights =
      parse_screen_rights(Some(r#"{"cash":"read","customers":"write"}"#.into())).unwrap();
    assert_eq!(rights.get("cash"), Some(&ScreenAccess::Read));
    assert_eq!(rights.get("customers"), Some(&ScreenAccess::Write));
  }
}
