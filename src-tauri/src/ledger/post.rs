//! `post_transaction` — only writer for Transaction + LedgerEntry rows.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::util::{now_sqlite};
use crate::ledger::money::{
  assert_ledger_balanced, money_to_major_unit_string, parse_amount_minor, DomainEntry,
  LedgerDirection,
};

const ALLOWED_TYPES: &[&str] = &[
  "DEPOSIT",
  "WITHDRAWAL",
  "TRANSFER",
  "EXCHANGE",
  "HAWALA",
  "ADJUSTMENT",
  "EXPENSE",
  "TRADE_BUY",
  "TRADE_SELL",
];

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PostingLineDto {
  pub wallet_id: String,
  pub currency: String,
  pub direction: String,
  /// Integer minor units as a decimal string (no floats).
  pub amount_minor: String,
  pub exchange_rate_id: Option<String>,
  pub memo: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PostTransactionInput {
  pub reference: String,
  pub r#type: String,
  /// ISO date or SQLite datetime string.
  pub value_date: String,
  pub entries: Vec<PostingLineDto>,
  pub customer_id: Option<String>,
  pub walk_in_name: Option<String>,
  pub walk_in_phone: Option<String>,
  pub description: Option<String>,
  pub created_by_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PostedLedgerEntry {
  pub id: String,
  pub wallet_id: String,
  pub currency_id: String,
  pub direction: String,
  pub amount: String,
  pub memo: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PostedTransaction {
  pub id: String,
  pub reference: String,
  pub r#type: String,
  pub status: String,
  pub value_date: String,
  pub ledger_entries: Vec<PostedLedgerEntry>,
}

fn normalize(input: PostTransactionInput) -> Result<(String, String, String, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, Vec<DomainEntry>), AppError> {
  let reference = input.reference.trim().to_string();
  if reference.is_empty() {
    return Err(AppError::Validation("Transaction reference is required.".into()));
  }
  if reference.len() > 100 {
    return Err(AppError::Validation(
      "Transaction reference must be at most 100 characters.".into(),
    ));
  }

  let tx_type = input.r#type.trim().to_ascii_uppercase();
  if !ALLOWED_TYPES.contains(&tx_type.as_str()) {
    return Err(AppError::Validation(
      "A valid transaction type is required.".into(),
    ));
  }

  let value_date = input.value_date.trim().to_string();
  if value_date.is_empty() {
    return Err(AppError::Validation("A valid value date is required.".into()));
  }

  if input.entries.len() < 2 {
    return Err(AppError::Validation(
      "At least two ledger entries are required for double-entry posting.".into(),
    ));
  }

  let mut domain = Vec::with_capacity(input.entries.len());
  for (index, entry) in input.entries.into_iter().enumerate() {
    let wallet_id = entry.wallet_id.trim().to_string();
    if wallet_id.is_empty() {
      return Err(AppError::Validation(format!(
        "Ledger entry at index {index} is missing walletId."
      )));
    }
    let currency = entry.currency.trim().to_ascii_uppercase();
    if currency.is_empty() {
      return Err(AppError::Validation(format!(
        "Ledger entry at index {index} has an invalid currency code."
      )));
    }
    let direction = LedgerDirection::parse(&entry.direction)?;
    let amount_minor = parse_amount_minor(&entry.amount_minor)?;
    if amount_minor <= 0 {
      return Err(AppError::Validation(format!(
        "Ledger entry at index {index} amount must be positive."
      )));
    }
    domain.push(DomainEntry {
      wallet_id,
      currency,
      direction,
      amount_minor,
      memo: entry
        .memo
        .map(|m| m.trim().to_string())
        .filter(|m| !m.is_empty()),
      exchange_rate_id: entry
        .exchange_rate_id
        .map(|m| m.trim().to_string())
        .filter(|m| !m.is_empty()),
    });
  }

  assert_ledger_balanced(&domain)?;

  let customer_id = input
    .customer_id
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty());
  let walk_in_name = input
    .walk_in_name
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty());
  let walk_in_phone = input
    .walk_in_phone
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty());
  let description = input
    .description
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty());
  let created_by_id = input
    .created_by_id
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty());

  Ok((
    reference,
    tx_type,
    value_date,
    customer_id,
    walk_in_name,
    walk_in_phone,
    description,
    created_by_id,
    domain,
  ))
}

/// Persist a balanced posting inside one SQLite transaction.
pub fn post_transaction(
  conn: &Connection,
  input: PostTransactionInput,
) -> Result<PostedTransaction, AppError> {
  let (
    reference,
    tx_type,
    value_date,
    customer_id,
    walk_in_name,
    walk_in_phone,
    description,
    created_by_id,
    domain,
  ) = normalize(input)?;

  conn.execute_batch("BEGIN IMMEDIATE;")?;
  let result = (|| -> Result<PostedTransaction, AppError> {
    let existing: Option<String> = conn
      .query_row(
        "SELECT id FROM \"Transaction\" WHERE reference = ?1 AND deletedAt IS NULL LIMIT 1",
        [&reference],
        |row| row.get(0),
      )
      .optional()?;
    if existing.is_some() {
      return Err(AppError::Validation(format!(
        "Transaction reference \"{reference}\" already exists."
      )));
    }

    if let Some(ref cid) = customer_id {
      let row: Option<(i64,)> = conn
        .query_row(
          "SELECT isActive FROM Customer WHERE id = ?1 AND deletedAt IS NULL LIMIT 1",
          [cid],
          |row| Ok((row.get::<_, i64>(0)?,)),
        )
        .optional()?;
      match row {
        None => {
          return Err(AppError::NotFound("Customer was not found.".into()));
        }
        Some((0,)) => {
          return Err(AppError::Validation(
            "Customer is inactive and cannot be used for posting.".into(),
          ));
        }
        Some(_) => {}
      }
    }

    if let Some(ref uid) = created_by_id {
      let row: Option<(i64,)> = conn
        .query_row(
          "SELECT isActive FROM User WHERE id = ?1 LIMIT 1",
          [uid],
          |row| Ok((row.get::<_, i64>(0)?,)),
        )
        .optional()?;
      match row {
        None => {
          return Err(AppError::NotFound("Created-by user was not found.".into()));
        }
        Some((0,)) => {
          return Err(AppError::Validation(
            "Created-by user is inactive and cannot post transactions.".into(),
          ));
        }
        Some(_) => {}
      }
    }

    for entry in &domain {
      let wallet: Option<(String, String, Option<String>, i64)> = conn
        .query_row(
          "SELECT name, type, customerId, isActive FROM Wallet
           WHERE id = ?1 AND deletedAt IS NULL LIMIT 1",
          [&entry.wallet_id],
          |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .optional()?;
      let Some((name, wtype, customer_link, active)) = wallet else {
        return Err(AppError::NotFound(format!(
          "Wallet was not found: {}.",
          entry.wallet_id
        )));
      };
      if active == 0 {
        return Err(AppError::Validation(format!(
          "Wallet \"{name}\" is inactive and cannot receive postings."
        )));
      }
      if wtype == "CUSTOMER" && customer_link.is_none() {
        return Err(AppError::Validation(format!(
          "Customer wallet \"{name}\" is missing a customer link."
        )));
      }
    }

    let mut currency_ids = std::collections::HashMap::new();
    let mut decimal_places = std::collections::HashMap::new();
    for entry in &domain {
      if currency_ids.contains_key(&entry.currency) {
        continue;
      }
      let row: Option<(String, i64, i64)> = conn
        .query_row(
          "SELECT id, decimalPlaces, isActive FROM Currency
           WHERE code = ?1 AND deletedAt IS NULL LIMIT 1",
          [&entry.currency],
          |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()?;
      let Some((id, places, active)) = row else {
        return Err(AppError::NotFound(format!(
          "Currency was not found: {}.",
          entry.currency
        )));
      };
      if active == 0 {
        return Err(AppError::Validation(format!(
          "Currency {} is inactive and cannot be used for posting.",
          entry.currency
        )));
      }
      currency_ids.insert(entry.currency.clone(), id);
      decimal_places.insert(entry.currency.clone(), places);
    }

    for entry in &domain {
      if let Some(ref rate_id) = entry.exchange_rate_id {
        let exists: bool = conn.query_row(
          "SELECT EXISTS(SELECT 1 FROM ExchangeRate WHERE id = ?1)",
          [rate_id],
          |row| row.get(0),
        )?;
        if !exists {
          return Err(AppError::NotFound(format!(
            "Exchange rate was not found: {rate_id}."
          )));
        }
      }
    }

    let tx_id = uuid::Uuid::new_v4().to_string();
    let now = now_sqlite();
    conn.execute(
      "INSERT INTO \"Transaction\" (
         id, reference, type, status, valueDate, postedAt, description,
         walkInName, walkInPhone, customerId, createdById, deletedAt, createdAt, updatedAt
       ) VALUES (?1, ?2, ?3, 'POSTED', ?4, ?5, ?6, ?7, ?8, ?9, ?10, NULL, ?5, ?5)",
      params![
        tx_id,
        reference,
        tx_type,
        value_date,
        now,
        description,
        walk_in_name,
        walk_in_phone,
        customer_id,
        created_by_id,
      ],
    )?;

    let mut posted_entries = Vec::with_capacity(domain.len());
    for entry in &domain {
      let currency_id = currency_ids
        .get(&entry.currency)
        .ok_or_else(|| AppError::Internal("currency map miss".into()))?;
      let places = *decimal_places
        .get(&entry.currency)
        .ok_or_else(|| AppError::Internal("decimalPlaces map miss".into()))?;
      let amount = money_to_major_unit_string(entry.amount_minor, places)?;
      let entry_id = uuid::Uuid::new_v4().to_string();
      conn.execute(
        "INSERT INTO LedgerEntry (
           id, transactionId, walletId, currencyId, direction, amount,
           exchangeRateId, memo, createdAt
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
          entry_id,
          tx_id,
          entry.wallet_id,
          currency_id,
          entry.direction.as_str(),
          amount,
          entry.exchange_rate_id,
          entry.memo,
          now,
        ],
      )?;
      posted_entries.push(PostedLedgerEntry {
        id: entry_id,
        wallet_id: entry.wallet_id.clone(),
        currency_id: currency_id.clone(),
        direction: entry.direction.as_str().to_string(),
        amount,
        memo: entry.memo.clone(),
      });
    }

    Ok(PostedTransaction {
      id: tx_id,
      reference,
      r#type: tx_type,
      status: "POSTED".into(),
      value_date,
      ledger_entries: posted_entries,
    })
  })();

  match result {
    Ok(posted) => {
      conn.execute_batch("COMMIT;")?;
      // Best-effort path for auto-backup (debounced).
      if let Ok(path) = conn.query_row(
        "SELECT file FROM pragma_database_list WHERE name = 'main'",
        [],
        |row| row.get::<_, String>(0),
      ) {
        if !path.is_empty() {
          crate::backup::queue_auto_backup(
            std::path::PathBuf::from(path),
            &format!("txn-{}", posted.r#type.to_ascii_lowercase()),
          );
        }
      }
      Ok(posted)
    }
    Err(e) => {
      let _ = conn.execute_batch("ROLLBACK;");
      Err(e)
    }
  }
}
