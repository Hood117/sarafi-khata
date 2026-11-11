//! Customer create / update / archive.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::AppError;
use crate::ledger::{
  allocate_next_account_number, find_currency_by_code, money_from_major_units, post_transaction,
  PostTransactionInput, PostingLineDto,
};
use crate::state::AppState;
use crate::util::now_sqlite;
use crate::commands::authorize::{require_screen_write};

use super::customers::{load_customer_opening_kata, CustomerDetail, OpeningKataLineDetail};
use super::trading::util::soft_delete_transaction;

const OPENING_EQUITY_WALLET_NAME: &str = "Opening Equity";

const PHOTO_MAX_CHARS: usize = 400_000;

/// Empty clears. A data URL is stored as-is after a size and type check.
fn normalize_photo(value: Option<String>) -> Result<Option<String>, AppError> {
  let Some(raw) = value else {
    return Ok(None);
  };
  let trimmed = raw.trim();
  if trimmed.is_empty() {
    return Ok(None);
  }
  if trimmed.len() > PHOTO_MAX_CHARS {
    return Err(AppError::Validation("Photo is too large.".into()));
  }
  let head = trimmed.get(..40).unwrap_or(trimmed).to_ascii_lowercase();
  let image = head.starts_with("data:image/jpeg")
    || head.starts_with("data:image/jpg")
    || head.starts_with("data:image/png")
    || head.starts_with("data:image/webp");
  if !image || !trimmed.contains(";base64,") {
    return Err(AppError::Validation(
      "Photo must be a JPEG, PNG, or WebP image.".into(),
    ));
  }
  Ok(Some(trimmed.to_string()))
}

fn trim_opt(value: Option<String>, max: usize) -> Result<Option<String>, AppError> {
  let Some(raw) = value else {
    return Ok(None);
  };
  let trimmed = raw.trim().to_string();
  if trimmed.is_empty() {
    return Ok(None);
  }
  if trimmed.len() > max {
    return Err(AppError::Validation(format!(
      "Field exceeds maximum length of {max}."
    )));
  }
  Ok(Some(trimmed))
}

fn load_customer_detail(conn: &Connection, id: &str) -> Result<CustomerDetail, AppError> {
  let detail = conn
    .query_row(
      "SELECT id, code, fullName, fatherName, phone, address, nationalId, notes,
              IFNULL(customerType, 'PERMANENT'), isActive, deletedAt, createdAt, updatedAt, photo
       FROM Customer WHERE id = ?1 LIMIT 1",
      [id],
      |row| {
        let deleted_at: Option<String> = row.get(10)?;
        Ok((
          row.get::<_, String>(0)?,
          row.get(1)?,
          row.get(2)?,
          row.get(3)?,
          row.get(4)?,
          row.get(5)?,
          row.get(6)?,
          row.get(7)?,
          row.get::<_, String>(8)?,
          row.get::<_, i64>(9)? != 0,
          deleted_at.is_some(),
          row.get(11)?,
          row.get(12)?,
          row.get(13)?,
        ))
      },
    )
    .map_err(|e| match e {
      rusqlite::Error::QueryReturnedNoRows => AppError::NotFound("Customer not found.".into()),
      other => other.into(),
    })?;

  let (
    id,
    code,
    full_name,
    father_name,
    phone,
    address,
    national_id,
    notes,
    customer_type,
    is_active,
    is_archived,
    created_at,
    updated_at,
    photo,
  ) = detail;
  let opening_kata = load_customer_opening_kata(conn, &id)?;
  let linked_partner: Option<(String, String)> = conn
    .query_row(
      "SELECT id, name FROM PartnerSarafi
       WHERE customerId = ?1 AND deletedAt IS NULL
       LIMIT 1",
      [&id],
      |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .optional()?;
  Ok(CustomerDetail {
    id,
    code,
    full_name,
    father_name,
    phone,
    address,
    national_id,
    notes,
    customer_type,
    is_active,
    is_archived,
    created_at,
    updated_at,
    opening_kata,
    linked_partner_sarafi_id: linked_partner.as_ref().map(|(pid, _)| pid.clone()),
    linked_partner_name: linked_partner.map(|(_, name)| name),
    photo,
  })
}

fn ensure_opening_equity(conn: &Connection) -> Result<String, AppError> {
  let existing: Option<String> = conn
    .query_row(
      "SELECT id FROM Wallet
       WHERE name = ?1 AND type = 'SYSTEM' AND deletedAt IS NULL AND isActive = 1
       LIMIT 1",
      [OPENING_EQUITY_WALLET_NAME],
      |row| row.get(0),
    )
    .optional()?;
  if let Some(id) = existing {
    return Ok(id);
  }
  let id = uuid::Uuid::new_v4().to_string();
  let now = now_sqlite();
  conn.execute(
    "INSERT INTO Wallet (id, name, type, customerId, userId, isActive, deletedAt, createdAt, updatedAt)
     VALUES (?1, ?2, 'SYSTEM', NULL, NULL, 1, NULL, ?3, ?3)",
    params![id, OPENING_EQUITY_WALLET_NAME, now],
  )?;
  Ok(id)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpeningKataLineInput {
  /// Existing Opening Kata transaction id when editing an unchanged/changed line.
  pub transaction_id: Option<String>,
  pub currency_code: String,
  pub amount: String,
  /// `GIVE` = customer gives money (default) | `TAKE` = customer takes money
  pub direction: Option<String>,
  pub description: Option<String>,
  pub notes: Option<String>,
  pub value_date: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCustomerInput {
  pub full_name: String,
  pub father_name: Option<String>,
  pub phone: String,
  pub address: Option<String>,
  pub national_id: Option<String>,
  pub notes: Option<String>,
  /// `PERMANENT` (default) | `TEMPORARY`
  pub customer_type: Option<String>,
  /// Preferred: one or more Opening Kata lines.
  pub opening_kata: Option<Vec<OpeningKataLineInput>>,
  /// Legacy single-field opening (maps to one GIVE Opening Kata).
  pub opening_balance_amount: Option<String>,
  pub opening_balance_currency_code: Option<String>,
  pub actor_user_id: String,
  /// Data URL. Omit or leave empty for no photo.
  #[serde(default)]
  pub photo: Option<String>,
}

/// Opening Kata = starting customer claim against cash already in Main Vault.
///
/// Does NOT touch Main Vault. Physical startup cash is entered separately via
/// Cash In (Main Vault DEBIT + Opening Equity CREDIT). Live deposits/withdrawals
/// still move both customer wallet and Main Vault in `movements.rs`.
///
/// GIVE (shop holds for customer): Customer DEBIT + Opening Equity CREDIT.
/// TAKE (customer owes / already took): Customer CREDIT + Opening Equity DEBIT.
fn post_opening_kata_line(
  conn: &Connection,
  customer_id: &str,
  wallet_id: &str,
  full_name: &str,
  line: &OpeningKataLineInput,
  actor: &str,
) -> Result<(), AppError> {
  let direction = line
    .direction
    .as_deref()
    .unwrap_or("GIVE")
    .trim()
    .to_ascii_uppercase();
  let give = direction == "GIVE" || direction == "IN" || direction == "CUSTOMER_GIVES";
  let take = direction == "TAKE" || direction == "OUT" || direction == "CUSTOMER_TAKES";
  if !give && !take {
    return Err(AppError::Validation(
      "Opening Kata direction must be Customer Gives Money or Customer Takes Money.".into(),
    ));
  }

  let (_cid, currency_code, places) = find_currency_by_code(conn, &line.currency_code)?;
  let minor = money_from_major_units(line.amount.trim(), places)?;
  if minor <= 0 {
    return Err(AppError::Validation(
      "Opening Kata amount must be positive.".into(),
    ));
  }

  let equity_id = ensure_opening_equity(conn)?;

  let value_date = line
    .value_date
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(|s| s.to_string())
    .unwrap_or_else(now_sqlite);

  let desc = line
    .description
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(|s| s.to_string())
    .or_else(|| {
      line
        .notes
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
    })
    .unwrap_or_else(|| {
      if give {
        format!("Opening Kata — {full_name} opening credit")
      } else {
        format!("Opening Kata — {full_name} opening debit")
      }
    });

  let reference = format!(
    "OB-{}-{}",
    chrono::Utc::now().timestamp_millis(),
    uuid::Uuid::new_v4().simple()
  );

  // Keep customer-leg memos stable so get_customer can reload Opening Kata lines.
  let (customer_dir, equity_dir, customer_memo) = if take {
    ("CREDIT", "DEBIT", "Opening Kata — money out")
  } else {
    ("DEBIT", "CREDIT", "Opening Kata — money in")
  };

  post_transaction(
    conn,
    PostTransactionInput {
      reference,
      r#type: "ADJUSTMENT".into(),
      value_date,
      customer_id: Some(customer_id.to_string()),
      walk_in_name: None,
      walk_in_phone: None,
      description: Some(desc),
      created_by_id: Some(actor.to_string()),
      entries: vec![
        PostingLineDto {
          wallet_id: wallet_id.to_string(),
          currency: currency_code.clone(),
          direction: customer_dir.into(),
          amount_minor: minor.to_string(),
          exchange_rate_id: None,
          memo: Some(customer_memo.into()),
        },
        PostingLineDto {
          wallet_id: equity_id,
          currency: currency_code,
          direction: equity_dir.into(),
          amount_minor: minor.to_string(),
          exchange_rate_id: None,
          memo: Some("Opening equity — customer claim".into()),
        },
      ],
    },
  )?;
  Ok(())
}

fn normalize_opening_direction(raw: Option<&str>) -> String {
  let direction = raw.unwrap_or("GIVE").trim().to_ascii_uppercase();
  if direction == "TAKE" || direction == "OUT" || direction == "CUSTOMER_TAKES" {
    "TAKE".into()
  } else {
    "GIVE".into()
  }
}

fn opening_line_matches(
  existing: &OpeningKataLineDetail,
  line: &OpeningKataLineInput,
  conn: &Connection,
) -> Result<bool, AppError> {
  let (_cid, _, places) = find_currency_by_code(conn, &line.currency_code)?;
  let new_minor = money_from_major_units(line.amount.trim(), places)?;
  let old_minor = money_from_major_units(existing.amount.trim(), places)?;
  let new_dir = normalize_opening_direction(line.direction.as_deref());
  let old_dir = normalize_opening_direction(Some(&existing.direction));
  let new_date = line
    .value_date
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(|s| if s.len() >= 10 { &s[..10] } else { s })
    .unwrap_or("");
  let old_date = if existing.value_date.len() >= 10 {
    &existing.value_date[..10]
  } else {
    existing.value_date.as_str()
  };
  let new_desc = line
    .description
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .unwrap_or("");
  let old_desc = existing.description.trim();

  Ok(new_minor == old_minor
    && new_dir == old_dir
    && existing.currency_code.eq_ignore_ascii_case(line.currency_code.trim())
    && new_date == old_date
    && new_desc == old_desc)
}

fn sync_customer_opening_kata(
  conn: &Connection,
  customer_id: &str,
  wallet_id: &str,
  full_name: &str,
  actor: &str,
  submitted: Vec<OpeningKataLineInput>,
) -> Result<(), AppError> {
  let existing = load_customer_opening_kata(conn, customer_id)?;
  let existing_by_id: std::collections::HashMap<String, OpeningKataLineDetail> = existing
    .into_iter()
    .map(|line| (line.transaction_id.clone(), line))
    .collect();
  let mut kept_ids = std::collections::HashSet::new();

  for line in &submitted {
    if let Some(tx_id) = line
      .transaction_id
      .as_deref()
      .map(str::trim)
      .filter(|s| !s.is_empty())
    {
      if let Some(ex) = existing_by_id.get(tx_id) {
        if opening_line_matches(ex, line, conn)? {
          kept_ids.insert(tx_id.to_string());
          continue;
        }
        soft_delete_transaction(conn, tx_id)?;
      }
    }
    post_opening_kata_line(conn, customer_id, wallet_id, full_name, line, actor)?;
  }

  for tx_id in existing_by_id.keys() {
    if !kept_ids.contains(tx_id) {
      soft_delete_transaction(conn, tx_id)?;
    }
  }

  Ok(())
}

#[tauri::command]
pub fn create_customer(
  state: State<'_, AppState>,
  input: CreateCustomerInput,
) -> Result<CustomerDetail, AppError> {
  let full_name = input.full_name.trim().to_string();
  if full_name.is_empty() || full_name.len() > 200 {
    return Err(AppError::Validation("fullName is required (1–200).".into()));
  }
  let phone = crate::validation::validate_phone_optional_str(&input.phone)?;
  let father_name = trim_opt(input.father_name, 200)?;
  let address = trim_opt(input.address, 500)?;
  let national_id = trim_opt(input.national_id, 100)?;
  let notes = trim_opt(input.notes, 2000)?;
  let customer_type = crate::ledger::parse_customer_type(input.customer_type.as_deref());
  let photo = normalize_photo(input.photo)?;
  let _ = input.actor_user_id.trim();

  let opening_amount = input
    .opening_balance_amount
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty());
  let opening_ccy = input
    .opening_balance_currency_code
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(|s| s.to_ascii_uppercase());
  if opening_amount.is_some() != opening_ccy.is_some() {
    return Err(AppError::Validation(
      "Opening Kata amount and currency must both be provided.".into(),
    ));
  }

  let mut opening_lines: Vec<OpeningKataLineInput> = input.opening_kata.unwrap_or_default();
  if opening_lines.is_empty() {
    if let (Some(amount), Some(ccy)) = (opening_amount, opening_ccy) {
      opening_lines.push(OpeningKataLineInput {
        transaction_id: None,
        currency_code: ccy.to_string(),
        amount: amount.to_string(),
        direction: Some("GIVE".into()),
        description: Some("Opening Kata".into()),
        notes: None,
        value_date: None,
      });
    }
  }
  // Drop empty amount rows
  opening_lines.retain(|l| !l.amount.trim().is_empty() && !l.currency_code.trim().is_empty());

  let conn = state.db.lock();
  let actor = require_screen_write(&state, &conn, "customers")?;
  let actor = actor.id.clone();

  if let Some(ref phone_val) = phone {
    let phone_taken: bool = conn.query_row(
      "SELECT EXISTS(
         SELECT 1 FROM Customer
         WHERE phone = ?1 AND deletedAt IS NULL
       )",
      [phone_val],
      |row| row.get(0),
    )?;
    if phone_taken {
      return Err(AppError::Validation(
        "A customer with this phone number already exists.".into(),
      ));
    }
  }

  let mut customer_id = String::new();
  let mut account_number = String::new();
  let mut last_err: Option<AppError> = None;
  for _ in 0..5 {
    let code = allocate_next_account_number(&conn)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_sqlite();
    match conn.execute(
      "INSERT INTO Customer (
         id, code, fullName, fatherName, phone, address, nationalId, notes, customerType,
         isActive, deletedAt, createdAt, updatedAt, photo
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 1, NULL, ?10, ?10, ?11)",
      params![
        id,
        code,
        full_name,
        father_name,
        phone,
        address,
        national_id,
        notes,
        customer_type,
        now,
        photo
      ],
    ) {
      Ok(_) => {
        customer_id = id;
        account_number = code;
        last_err = None;
        break;
      }
      Err(e) => {
        let msg = e.to_string();
        if msg.contains("Customer_code_key")
          || msg.contains("Customer_code_active_key")
          || msg.to_lowercase().contains("unique")
        {
          last_err = Some(AppError::Validation(
            "Unable to allocate a unique account number. Please try again.".into(),
          ));
          continue;
        }
        return Err(e.into());
      }
    }
  }
  if customer_id.is_empty() {
    return Err(last_err.unwrap_or_else(|| {
      AppError::Internal("Failed to create customer.".into())
    }));
  }

  let wallet_id = uuid::Uuid::new_v4().to_string();
  let now = now_sqlite();
  let wallet_name = format!("{full_name} Wallet");
  conn.execute(
    "INSERT INTO Wallet (id, name, type, customerId, userId, isActive, deletedAt, createdAt, updatedAt, code)
     VALUES (?1, ?2, 'CUSTOMER', ?3, NULL, 1, NULL, ?4, ?4, ?5)",
    params![wallet_id, wallet_name, customer_id, now, account_number],
  )?;

  for line in &opening_lines {
    post_opening_kata_line(&conn, &customer_id, &wallet_id, &full_name, line, &actor)?;
  }

  load_customer_detail(&conn, &customer_id)
}

fn resolve_customer_wallet_id(conn: &Connection, customer_id: &str) -> Result<String, AppError> {
  let mut stmt = conn.prepare(
    "SELECT id FROM Wallet
     WHERE customerId = ?1 AND type = 'CUSTOMER' AND deletedAt IS NULL AND isActive = 1",
  )?;
  let ids = stmt
    .query_map([customer_id], |row| row.get::<_, String>(0))?
    .collect::<Result<Vec<_>, _>>()?;
  match ids.len() {
    0 => Err(AppError::Validation(
      "Customer has no account wallet.".into(),
    )),
    1 => Ok(ids[0].clone()),
    _ => Err(AppError::Validation(
      "Customer has more than one wallet.".into(),
    )),
  }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCustomerInput {
  pub id: String,
  pub full_name: String,
  pub father_name: Option<String>,
  pub phone: String,
  pub address: Option<String>,
  pub national_id: Option<String>,
  pub notes: Option<String>,
  /// `PERMANENT` | `TEMPORARY`
  pub customer_type: Option<String>,
  pub actor_user_id: Option<String>,
  /// Opening Kata lines to sync on save (replaces removed/changed rows via ledger).
  pub opening_kata: Option<Vec<OpeningKataLineInput>>,
  /// Omit to keep the current photo. Empty string clears it.
  #[serde(default)]
  pub photo: Option<String>,
}

fn write_customer_audit(
  conn: &Connection,
  user_id: Option<&str>,
  action: &str,
  entity_id: &str,
  before: Option<&str>,
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
       VALUES (?1,?2,?3,'CUSTOMER','Customer',?4,?5,?6,?7)"#,
    params![
      uuid::Uuid::new_v4().to_string(),
      user_id,
      action,
      entity_id,
      before,
      after,
      now_sqlite(),
    ],
  )?;
  Ok(())
}

#[tauri::command]
pub fn update_customer(
  state: State<'_, AppState>,
  input: UpdateCustomerInput,
) -> Result<CustomerDetail, AppError> {
  let id = input.id.trim().to_string();
  if id.is_empty() {
    return Err(AppError::Validation("Customer id is required.".into()));
  }
  let full_name = input.full_name.trim().to_string();
  if full_name.is_empty() || full_name.len() > 200 {
    return Err(AppError::Validation("fullName is required (1–200).".into()));
  }
  let phone = crate::validation::validate_phone_optional_str(&input.phone)?;
  let father_name = trim_opt(input.father_name, 200)?;
  let address = trim_opt(input.address, 500)?;
  let national_id = trim_opt(input.national_id, 100)?;
  let notes = trim_opt(input.notes, 2000)?;
  let _ = input.actor_user_id.as_deref();

  let conn = state.db.lock();
  let actor = require_screen_write(&state, &conn, "customers")?;
  let actor_id = actor.id.clone();
  let existing = load_customer_detail(&conn, &id)?;
  if existing.is_archived {
    return Err(AppError::Validation("Archived customers cannot be edited.".into()));
  }
  let customer_type = crate::ledger::parse_customer_type(
    input
      .customer_type
      .as_deref()
      .or(Some(existing.customer_type.as_str())),
  );
  // Missing photo keeps the saved one. Empty string removes it.
  let photo = match input.photo {
    None => existing.photo.clone(),
    Some(raw) => normalize_photo(Some(raw))?,
  };

  if let Some(ref phone_val) = phone {
    let phone_taken: bool = conn.query_row(
      "SELECT EXISTS(
         SELECT 1 FROM Customer
         WHERE phone = ?1 AND deletedAt IS NULL AND id != ?2
       )",
      params![phone_val, id],
      |row| row.get(0),
    )?;
    if phone_taken {
      return Err(AppError::Validation(
        "A customer with this phone number already exists.".into(),
      ));
    }
  }

  let before = serde_json::json!({
    "fullName": existing.full_name,
    "fatherName": existing.father_name,
    "phone": existing.phone,
    "address": existing.address,
    "nationalId": existing.national_id,
    "notes": existing.notes,
    "customerType": existing.customer_type,
  })
  .to_string();
  let after = serde_json::json!({
    "fullName": full_name,
    "fatherName": father_name,
    "phone": phone,
    "address": address,
    "nationalId": national_id,
    "notes": notes,
    "customerType": customer_type,
  })
  .to_string();

  let now = now_sqlite();
  conn.execute(
    "UPDATE Customer SET
       fullName = ?1, fatherName = ?2, phone = ?3, address = ?4,
       nationalId = ?5, notes = ?6, customerType = ?7, photo = ?8, updatedAt = ?9
     WHERE id = ?10 AND deletedAt IS NULL",
    params![
      full_name,
      father_name,
      phone,
      address,
      national_id,
      notes,
      customer_type,
      photo,
      now,
      id
    ],
  )?;

  if before != after {
    write_customer_audit(
      &conn,
      Some(actor_id.as_str()),
      "UPDATE_CUSTOMER",
      &id,
      Some(&before),
      Some(&after),
    )?;
  }

  if let Some(mut opening_lines) = input.opening_kata {
    opening_lines.retain(|l| !l.amount.trim().is_empty() && !l.currency_code.trim().is_empty());
    let wallet_id = resolve_customer_wallet_id(&conn, &id)?;
    sync_customer_opening_kata(
      &conn,
      &id,
      &wallet_id,
      &full_name,
      actor_id.as_str(),
      opening_lines,
    )?;
  }

  crate::ledger::maybe_auto_archive_temporary_customer(&conn, &id)?;
  load_customer_detail(&conn, &id)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveCustomerInput {
  pub id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveCustomerResult {
  pub id: String,
  pub is_archived: bool,
}

#[tauri::command]
pub fn archive_customer(
  state: State<'_, AppState>,
  input: ArchiveCustomerInput,
) -> Result<ArchiveCustomerResult, AppError> {
  let id = input.id.trim().to_string();
  if id.is_empty() {
    return Err(AppError::Validation("Customer id is required.".into()));
  }
  let conn = state.db.lock();
  let _actor = require_screen_write(&state, &conn, "customers")?;
  let existing = load_customer_detail(&conn, &id)?;
  if existing.is_archived {
    return Ok(ArchiveCustomerResult {
      id,
      is_archived: true,
    });
  }

  // Soft-archive only when every customer wallet currency balance is zero.
  let open_balances: Vec<(String, f64)> = {
    let mut stmt = conn.prepare(
      r#"SELECT c.code,
                COALESCE(SUM(CASE WHEN le.direction='DEBIT' THEN CAST(le.amount AS REAL)
                                  ELSE -CAST(le.amount AS REAL) END), 0) AS bal
         FROM Wallet w
         INNER JOIN LedgerEntry le ON le.walletId = w.id
         INNER JOIN "Transaction" t ON t.id = le.transactionId AND t.deletedAt IS NULL
         INNER JOIN Currency c ON c.id = le.currencyId AND c.deletedAt IS NULL
         WHERE w.customerId = ?1 AND w.type = 'CUSTOMER' AND w.deletedAt IS NULL
         GROUP BY c.id, c.code
         HAVING ABS(COALESCE(SUM(CASE WHEN le.direction='DEBIT' THEN CAST(le.amount AS REAL)
                                      ELSE -CAST(le.amount AS REAL) END), 0)) > 1e-9
         ORDER BY c.code"#,
    )?;
    let rows = stmt
      .query_map([&id], |row| Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?)))?
      .collect::<Result<Vec<_>, _>>()?;
    rows
  };
  if !open_balances.is_empty() {
    let summary = open_balances
      .iter()
      .map(|(code, bal)| {
        let display = if (bal - bal.round()).abs() < 1e-9 {
          format!("{}", bal.round() as i64)
        } else {
          format!("{bal:.4}")
            .trim_end_matches('0')
            .trim_end_matches('.')
            .to_string()
        };
        format!("{code} {display}")
      })
      .collect::<Vec<_>>()
      .join(", ");
    return Err(AppError::Validation(format!(
      "You cannot archive this customer until the money is 0. Remaining balance: {summary}."
    )));
  }

  let now = now_sqlite();
  let updated = conn.execute(
    "UPDATE Customer SET deletedAt = ?1, isActive = 0, updatedAt = ?1
     WHERE id = ?2 AND deletedAt IS NULL",
    params![now, id],
  )?;
  if updated == 0 {
    return Err(AppError::NotFound("Customer not found.".into()));
  }
  Ok(ArchiveCustomerResult {
    id,
    is_archived: true,
  })
}

#[tauri::command]
pub fn restore_customer(
  state: State<'_, AppState>,
  input: ArchiveCustomerInput,
) -> Result<ArchiveCustomerResult, AppError> {
  let id = input.id.trim().to_string();
  if id.is_empty() {
    return Err(AppError::Validation("Customer id is required.".into()));
  }
  let conn = state.db.lock();
  let _actor = require_screen_write(&state, &conn, "customers")?;
  let existing = load_customer_detail(&conn, &id)?;
  if !existing.is_archived {
    return Ok(ArchiveCustomerResult {
      id,
      is_archived: false,
    });
  }
  let now = now_sqlite();
  let updated = conn.execute(
    "UPDATE Customer SET deletedAt = NULL, isActive = 1, updatedAt = ?1 WHERE id = ?2",
    params![now, id],
  )?;
  if updated == 0 {
    return Err(AppError::NotFound("Customer not found.".into()));
  }
  Ok(ArchiveCustomerResult {
    id,
    is_archived: false,
  })
}
