//! Customer create / update / archive.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::AppError;
use crate::ledger::{
  find_currency_by_code, money_from_major_units, post_transaction, wallet_currency_balance_minor,
  PostTransactionInput, PostingLineDto,
};
use crate::state::AppState;
use crate::util::{now_sqlite};

use super::customers::CustomerDetail;

const CUSTOMER_CODE_START: i64 = 1001;
const OPENING_EQUITY_WALLET_NAME: &str = "Opening Equity";
const CASH_TILL_WALLET_NAME: &str = "Cash Till";
const MAIN_VAULT_WALLET_NAME: &str = "Main Vault";

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

fn next_customer_code(conn: &Connection) -> Result<String, AppError> {
  let mut stmt = conn.prepare("SELECT code FROM Customer WHERE code IS NOT NULL")?;
  let codes = stmt
    .query_map([], |row| row.get::<_, String>(0))?
    .collect::<Result<Vec<_>, _>>()?;
  let mut max_seq = CUSTOMER_CODE_START - 1;
  for code in codes {
    if code.chars().all(|c| c.is_ascii_digit()) {
      if let Ok(n) = code.parse::<i64>() {
        if n > max_seq {
          max_seq = n;
        }
      }
    }
  }
  Ok((max_seq + 1).to_string())
}

fn load_customer_detail(conn: &Connection, id: &str) -> Result<CustomerDetail, AppError> {
  conn
    .query_row(
      "SELECT id, code, fullName, fatherName, phone, address, nationalId, notes,
              isActive, deletedAt, createdAt, updatedAt
       FROM Customer WHERE id = ?1 LIMIT 1",
      [id],
      |row| {
        let deleted_at: Option<String> = row.get(9)?;
        Ok(CustomerDetail {
          id: row.get(0)?,
          code: row.get(1)?,
          full_name: row.get(2)?,
          father_name: row.get(3)?,
          phone: row.get(4)?,
          address: row.get(5)?,
          national_id: row.get(6)?,
          notes: row.get(7)?,
          is_active: row.get::<_, i64>(8)? != 0,
          is_archived: deleted_at.is_some(),
          created_at: row.get(10)?,
          updated_at: row.get(11)?,
        })
      },
    )
    .map_err(|e| match e {
      rusqlite::Error::QueryReturnedNoRows => AppError::NotFound("Customer not found.".into()),
      other => other.into(),
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

fn resolve_cash_wallet_id(conn: &Connection) -> Result<String, AppError> {
  for (name, wtype) in [
    (CASH_TILL_WALLET_NAME, "TILL"),
    (MAIN_VAULT_WALLET_NAME, "VAULT"),
  ] {
    let id: Option<String> = conn
      .query_row(
        "SELECT id FROM Wallet
         WHERE name = ?1 AND type = ?2 AND deletedAt IS NULL AND isActive = 1
         LIMIT 1",
        params![name, wtype],
        |row| row.get(0),
      )
      .optional()?;
    if let Some(id) = id {
      return Ok(id);
    }
  }
  let id: Option<String> = conn
    .query_row(
      "SELECT id FROM Wallet
       WHERE type IN ('TILL','VAULT') AND deletedAt IS NULL AND isActive = 1
       ORDER BY name ASC LIMIT 1",
      [],
      |row| row.get(0),
    )
    .optional()?;
  id.ok_or_else(|| {
    AppError::Validation(
      "Cash Till or Main Vault is required to receive opening wallet money.".into(),
    )
  })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpeningKataLineInput {
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
  /// Preferred: one or more Opening Kata lines.
  pub opening_kata: Option<Vec<OpeningKataLineInput>>,
  /// Legacy single-field opening (maps to one GIVE Opening Kata).
  pub opening_balance_amount: Option<String>,
  pub opening_balance_currency_code: Option<String>,
  pub actor_user_id: String,
}

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
  let cash_id = resolve_cash_wallet_id(conn)?;
  let equity_minor = minor
    .checked_mul(2)
    .ok_or_else(|| AppError::Validation("Opening amount too large.".into()))?;

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
        format!("Opening Kata — {full_name} gave money")
      } else {
        format!("Opening Kata — {full_name} took money")
      }
    });

  let reference = format!(
    "OB-{}-{}",
    chrono::Utc::now().timestamp_millis(),
    uuid::Uuid::new_v4().simple()
  );

  if take {
    let (currency_id, _, _) = find_currency_by_code(conn, &line.currency_code)?;
    let customer_bal =
      wallet_currency_balance_minor(conn, wallet_id, &currency_id, places)?;
    if customer_bal < minor {
      return Err(AppError::Validation(
        "Insufficient customer balance.".into(),
      ));
    }
    let cash_bal = wallet_currency_balance_minor(conn, &cash_id, &currency_id, places)?;
    if cash_bal < minor {
      return Err(AppError::Validation(format!(
        "Insufficient {currency_code} cash available."
      )));
    }
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
            direction: "CREDIT".into(),
            amount_minor: minor.to_string(),
            exchange_rate_id: None,
            memo: Some("Opening Kata — money out".into()),
          },
          PostingLineDto {
            wallet_id: cash_id,
            currency: currency_code.clone(),
            direction: "CREDIT".into(),
            amount_minor: minor.to_string(),
            exchange_rate_id: None,
            memo: Some("Opening Kata — cash paid out".into()),
          },
          PostingLineDto {
            wallet_id: equity_id,
            currency: currency_code,
            direction: "DEBIT".into(),
            amount_minor: equity_minor.to_string(),
            exchange_rate_id: None,
            memo: Some("Opening equity balancing leg".into()),
          },
        ],
      },
    )?;
    return Ok(());
  }

  // Customer Gives Money: customer + cash up, equity balances (unchanged accounting).
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
          direction: "DEBIT".into(),
          amount_minor: minor.to_string(),
          exchange_rate_id: None,
          memo: Some("Opening Kata — money in".into()),
        },
        PostingLineDto {
          wallet_id: cash_id,
          currency: currency_code.clone(),
          direction: "DEBIT".into(),
          amount_minor: minor.to_string(),
          exchange_rate_id: None,
          memo: Some("Opening Kata — cash received".into()),
        },
        PostingLineDto {
          wallet_id: equity_id,
          currency: currency_code,
          direction: "CREDIT".into(),
          amount_minor: equity_minor.to_string(),
          exchange_rate_id: None,
          memo: Some("Opening equity balancing leg".into()),
        },
      ],
    },
  )?;
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
  let phone = input.phone.trim().to_string();
  if phone.is_empty() || phone.len() > 50 {
    return Err(AppError::Validation("phone is required (1–50).".into()));
  }
  let father_name = trim_opt(input.father_name, 200)?;
  let address = trim_opt(input.address, 500)?;
  let national_id = trim_opt(input.national_id, 100)?;
  let notes = trim_opt(input.notes, 2000)?;
  let actor = input.actor_user_id.trim().to_string();
  if actor.is_empty() {
    return Err(AppError::Validation("actorUserId is required.".into()));
  }

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

  let phone_taken: bool = conn.query_row(
    "SELECT EXISTS(
       SELECT 1 FROM Customer
       WHERE phone = ?1 AND deletedAt IS NULL
     )",
    [&phone],
    |row| row.get(0),
  )?;
  if phone_taken {
    return Err(AppError::Validation(
      "A customer with this phone number already exists.".into(),
    ));
  }

  let mut customer_id = String::new();
  let mut last_err: Option<AppError> = None;
  for _ in 0..5 {
    let code = next_customer_code(&conn)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_sqlite();
    match conn.execute(
      "INSERT INTO Customer (
         id, code, fullName, fatherName, phone, address, nationalId, notes,
         isActive, deletedAt, createdAt, updatedAt
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1, NULL, ?9, ?9)",
      params![
        id,
        code,
        full_name,
        father_name,
        phone,
        address,
        national_id,
        notes,
        now
      ],
    ) {
      Ok(_) => {
        customer_id = id;
        last_err = None;
        break;
      }
      Err(e) => {
        let msg = e.to_string();
        if msg.contains("Customer_code_active_key") || msg.to_lowercase().contains("unique") {
          last_err = Some(AppError::Validation(
            "Unable to allocate a unique customer code. Please try again.".into(),
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
    "INSERT INTO Wallet (id, name, type, customerId, userId, isActive, deletedAt, createdAt, updatedAt)
     VALUES (?1, ?2, 'CUSTOMER', ?3, NULL, 1, NULL, ?4, ?4)",
    params![wallet_id, wallet_name, customer_id, now],
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
  pub actor_user_id: Option<String>,
  /// Optional additional Opening Kata lines posted on save (ledger transactions).
  pub opening_kata: Option<Vec<OpeningKataLineInput>>,
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
  let phone = input.phone.trim().to_string();
  if phone.is_empty() || phone.len() > 50 {
    return Err(AppError::Validation("phone is required (1–50).".into()));
  }
  let father_name = trim_opt(input.father_name, 200)?;
  let address = trim_opt(input.address, 500)?;
  let national_id = trim_opt(input.national_id, 100)?;
  let notes = trim_opt(input.notes, 2000)?;
  let actor = input
    .actor_user_id
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty());

  let conn = state.db.lock();
  let existing = load_customer_detail(&conn, &id)?;
  if existing.is_archived {
    return Err(AppError::Validation("Archived customers cannot be edited.".into()));
  }

  let phone_taken: bool = conn.query_row(
    "SELECT EXISTS(
       SELECT 1 FROM Customer
       WHERE phone = ?1 AND deletedAt IS NULL AND id != ?2
     )",
    params![phone, id],
    |row| row.get(0),
  )?;
  if phone_taken {
    return Err(AppError::Validation(
      "A customer with this phone number already exists.".into(),
    ));
  }

  let before = serde_json::json!({
    "fullName": existing.full_name,
    "fatherName": existing.father_name,
    "phone": existing.phone,
    "address": existing.address,
    "nationalId": existing.national_id,
    "notes": existing.notes,
  })
  .to_string();
  let after = serde_json::json!({
    "fullName": full_name,
    "fatherName": father_name,
    "phone": phone,
    "address": address,
    "nationalId": national_id,
    "notes": notes,
  })
  .to_string();

  let now = now_sqlite();
  conn.execute(
    "UPDATE Customer SET
       fullName = ?1, fatherName = ?2, phone = ?3, address = ?4,
       nationalId = ?5, notes = ?6, updatedAt = ?7
     WHERE id = ?8 AND deletedAt IS NULL",
    params![
      full_name,
      father_name,
      phone,
      address,
      national_id,
      notes,
      now,
      id
    ],
  )?;

  if before != after {
    write_customer_audit(
      &conn,
      actor,
      "UPDATE_CUSTOMER",
      &id,
      Some(&before),
      Some(&after),
    )?;
  }

  let mut opening_lines = input.opening_kata.unwrap_or_default();
  opening_lines.retain(|l| !l.amount.trim().is_empty() && !l.currency_code.trim().is_empty());
  if !opening_lines.is_empty() {
    let actor_id = actor.ok_or_else(|| {
      AppError::Validation("actorUserId is required when posting Opening Kata.".into())
    })?;
    let wallet_id = resolve_customer_wallet_id(&conn, &id)?;
    for line in &opening_lines {
      post_opening_kata_line(&conn, &id, &wallet_id, &full_name, line, actor_id)?;
    }
  }

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
