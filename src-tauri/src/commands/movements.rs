//! High-level money movements — deposit, withdrawal, transfer (via post_transaction).

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::AppError;
use crate::ledger::{
  find_currency_by_code, money_from_major_units, money_to_major_unit_string, post_transaction,
  wallet_currency_balance_minor, PostTransactionInput, PostedTransaction, PostingLineDto,
};
use crate::state::AppState;
use crate::util::{now_sqlite};

const OPENING_EQUITY_WALLET_NAME: &str = "Opening Equity";
const CASH_TILL_WALLET_NAME: &str = "Cash Till";
const MAIN_VAULT_WALLET_NAME: &str = "Main Vault";

fn require_nonempty(value: &str, field: &str) -> Result<String, AppError> {
  let trimmed = value.trim().to_string();
  if trimmed.is_empty() {
    return Err(AppError::Validation(format!("{field} is required.")));
  }
  Ok(trimmed)
}

fn load_wallet(
  conn: &Connection,
  id: &str,
) -> Result<(String, String, Option<String>, i64), AppError> {
  conn
    .query_row(
      "SELECT id, type, customerId, isActive FROM Wallet
       WHERE id = ?1 AND deletedAt IS NULL LIMIT 1",
      [id],
      |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    )
    .map_err(|e| match e {
      rusqlite::Error::QueryReturnedNoRows => AppError::NotFound("Wallet was not found.".into()),
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
       ORDER BY CASE type WHEN 'TILL' THEN 0 ELSE 1 END, name
       LIMIT 1",
      [],
      |row| row.get(0),
    )
    .optional()?;
  id.ok_or_else(|| {
    AppError::Validation("Cash Till or Main Vault is required for money movements.".into())
  })
}

/// Customer gives money: customer↑ cash↑, balanced via Opening Equity (same as Opening Kata).
fn post_customer_give(
  conn: &Connection,
  reference: String,
  tx_type: &str,
  customer_wallet_id: String,
  cash_wallet_id: String,
  customer_id: Option<String>,
  currency_code: String,
  minor: i128,
  value_date: String,
  description: Option<String>,
  created_by_id: String,
) -> Result<PostedTransaction, AppError> {
  let equity_id = ensure_opening_equity(conn)?;
  let equity_minor = minor
    .checked_mul(2)
    .ok_or_else(|| AppError::Validation("Amount too large.".into()))?;
  post_transaction(
    conn,
    PostTransactionInput {
      reference,
      r#type: tx_type.into(),
      value_date,
      customer_id,
      walk_in_name: None,
      walk_in_phone: None,
      description,
      created_by_id: Some(created_by_id),
      entries: vec![
        PostingLineDto {
          wallet_id: customer_wallet_id,
          currency: currency_code.clone(),
          direction: "DEBIT".into(),
          amount_minor: minor.to_string(),
          exchange_rate_id: None,
          memo: Some("Customer gives money".into()),
        },
        PostingLineDto {
          wallet_id: cash_wallet_id,
          currency: currency_code.clone(),
          direction: "DEBIT".into(),
          amount_minor: minor.to_string(),
          exchange_rate_id: None,
          memo: Some("Cash received".into()),
        },
        PostingLineDto {
          wallet_id: equity_id,
          currency: currency_code,
          direction: "CREDIT".into(),
          amount_minor: equity_minor.to_string(),
          exchange_rate_id: None,
          memo: Some("Balancing equity leg".into()),
        },
      ],
    },
  )
}

/// Customer takes money: customer↓ cash↓, balanced via Opening Equity.
fn post_customer_take(
  conn: &Connection,
  reference: String,
  tx_type: &str,
  customer_wallet_id: String,
  cash_wallet_id: String,
  customer_id: Option<String>,
  currency_code: String,
  minor: i128,
  value_date: String,
  description: Option<String>,
  created_by_id: String,
) -> Result<PostedTransaction, AppError> {
  let equity_id = ensure_opening_equity(conn)?;
  let equity_minor = minor
    .checked_mul(2)
    .ok_or_else(|| AppError::Validation("Amount too large.".into()))?;
  post_transaction(
    conn,
    PostTransactionInput {
      reference,
      r#type: tx_type.into(),
      value_date,
      customer_id,
      walk_in_name: None,
      walk_in_phone: None,
      description,
      created_by_id: Some(created_by_id),
      entries: vec![
        PostingLineDto {
          wallet_id: customer_wallet_id,
          currency: currency_code.clone(),
          direction: "CREDIT".into(),
          amount_minor: minor.to_string(),
          exchange_rate_id: None,
          memo: Some("Customer takes money".into()),
        },
        PostingLineDto {
          wallet_id: cash_wallet_id,
          currency: currency_code.clone(),
          direction: "CREDIT".into(),
          amount_minor: minor.to_string(),
          exchange_rate_id: None,
          memo: Some("Cash paid out".into()),
        },
        PostingLineDto {
          wallet_id: equity_id,
          currency: currency_code,
          direction: "DEBIT".into(),
          amount_minor: equity_minor.to_string(),
          exchange_rate_id: None,
          memo: Some("Balancing equity leg".into()),
        },
      ],
    },
  )
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DepositInput {
  pub reference: String,
  pub customer_wallet_id: String,
  pub cash_wallet_id: String,
  pub currency_code: String,
  pub amount: String,
  pub value_date: Option<String>,
  pub description: Option<String>,
  pub created_by_id: String,
}

#[tauri::command]
pub fn deposit_funds(
  state: State<'_, AppState>,
  input: DepositInput,
) -> Result<PostedTransaction, AppError> {
  let reference = require_nonempty(&input.reference, "reference")?;
  let customer_wallet_id = require_nonempty(&input.customer_wallet_id, "customerWalletId")?;
  let cash_wallet_id = require_nonempty(&input.cash_wallet_id, "cashWalletId")?;
  let created_by_id = require_nonempty(&input.created_by_id, "createdById")?;
  if customer_wallet_id == cash_wallet_id {
    return Err(AppError::Validation(
      "Customer wallet and cash wallet must be different.".into(),
    ));
  }

  let conn = state.db.lock();
  let (cw_id, cw_type, customer_id, cw_active) = load_wallet(&conn, &customer_wallet_id)?;
  if cw_active == 0 || cw_type != "CUSTOMER" || customer_id.is_none() {
    return Err(AppError::Validation("Deposit requires a customer wallet.".into()));
  }
  let (cash_id, cash_type, _, cash_active) = load_wallet(&conn, &cash_wallet_id)?;
  if cash_active == 0 || (cash_type != "VAULT" && cash_type != "TILL") {
    return Err(AppError::Validation(
      "Deposit cash side must be a vault or till wallet.".into(),
    ));
  }

  let (_cid, currency_code, places) = find_currency_by_code(&conn, &input.currency_code)?;
  let minor = money_from_major_units(&input.amount, places)?;
  if minor <= 0 {
    return Err(AppError::Validation("Amount must be positive.".into()));
  }
  let value_date = input
    .value_date
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty())
    .unwrap_or_else(now_sqlite);
  let description = input
    .description
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty());

  post_customer_give(
    &conn,
    reference,
    "DEPOSIT",
    cw_id,
    cash_id,
    customer_id,
    currency_code,
    minor,
    value_date,
    description,
    created_by_id,
  )
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WithdrawInput {
  pub reference: String,
  pub customer_wallet_id: String,
  pub cash_wallet_id: String,
  pub currency_code: String,
  pub amount: String,
  pub value_date: Option<String>,
  pub description: Option<String>,
  pub created_by_id: String,
}

#[tauri::command]
pub fn withdraw_funds(
  state: State<'_, AppState>,
  input: WithdrawInput,
) -> Result<PostedTransaction, AppError> {
  let reference = require_nonempty(&input.reference, "reference")?;
  let customer_wallet_id = require_nonempty(&input.customer_wallet_id, "customerWalletId")?;
  let cash_wallet_id = require_nonempty(&input.cash_wallet_id, "cashWalletId")?;
  let created_by_id = require_nonempty(&input.created_by_id, "createdById")?;
  if customer_wallet_id == cash_wallet_id {
    return Err(AppError::Validation(
      "Customer wallet and cash wallet must be different.".into(),
    ));
  }

  let conn = state.db.lock();
  let (cw_id, cw_type, customer_id, cw_active) = load_wallet(&conn, &customer_wallet_id)?;
  if cw_active == 0 || cw_type != "CUSTOMER" || customer_id.is_none() {
    return Err(AppError::Validation(
      "Withdrawal requires a customer wallet.".into(),
    ));
  }
  let (cash_id, cash_type, _, cash_active) = load_wallet(&conn, &cash_wallet_id)?;
  if cash_active == 0 || (cash_type != "VAULT" && cash_type != "TILL") {
    return Err(AppError::Validation(
      "Withdrawal cash side must be a vault or till wallet.".into(),
    ));
  }

  let (currency_id, currency_code, places) = find_currency_by_code(&conn, &input.currency_code)?;
  let minor = money_from_major_units(&input.amount, places)?;
  if minor <= 0 {
    return Err(AppError::Validation("Amount must be positive.".into()));
  }

  let customer_bal = wallet_currency_balance_minor(&conn, &cw_id, &currency_id, places)?;
  if customer_bal < minor {
    return Err(AppError::Validation(
      "Insufficient customer balance.".into(),
    ));
  }
  let cash_bal = wallet_currency_balance_minor(&conn, &cash_id, &currency_id, places)?;
  if cash_bal < minor {
    return Err(AppError::Validation(format!(
      "Insufficient {currency_code} cash available."
    )));
  }

  let value_date = input
    .value_date
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty())
    .unwrap_or_else(now_sqlite);
  let description = input
    .description
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty());

  post_customer_take(
    &conn,
    reference,
    "WITHDRAWAL",
    cw_id,
    cash_id,
    customer_id,
    currency_code,
    minor,
    value_date,
    description,
    created_by_id,
  )
}

fn resolve_sole_customer_wallet(
  conn: &Connection,
  customer_id: &str,
  role: &str,
) -> Result<String, AppError> {
  let mut stmt = conn.prepare(
    "SELECT id FROM Wallet
     WHERE customerId = ?1 AND type = 'CUSTOMER' AND deletedAt IS NULL AND isActive = 1",
  )?;
  let ids = stmt
    .query_map([customer_id], |row| row.get::<_, String>(0))?
    .collect::<Result<Vec<_>, _>>()?;
  match ids.len() {
    0 => Err(AppError::Validation(format!(
      "{role} customer has no account wallet."
    ))),
    1 => Ok(ids[0].clone()),
    _ => Err(AppError::Validation(format!(
      "{role} customer has more than one wallet."
    ))),
  }
}

fn assert_active_customer(
  conn: &Connection,
  customer_id: &str,
  role: &str,
) -> Result<(String, String), AppError> {
  let row: Option<(String, String, i64, Option<String>)> = conn
    .query_row(
      "SELECT id, fullName, isActive, deletedAt FROM Customer WHERE id = ?1 LIMIT 1",
      [customer_id],
      |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    )
    .optional()?;
  let Some((id, name, active, deleted)) = row else {
    return Err(AppError::NotFound(format!(
      "{role} customer was not found."
    )));
  };
  if deleted.is_some() || active == 0 {
    return Err(AppError::Validation(format!(
      "{role} customer is inactive and cannot be used for transfers."
    )));
  }
  Ok((id, name))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerMoneyInput {
  pub customer_id: String,
  pub currency_code: String,
  pub amount: String,
  pub value_date: Option<String>,
  pub description: Option<String>,
  pub notes: Option<String>,
  pub reference: Option<String>,
  /// Cash | Bank | Other — currently resolves to till/vault (Cash default).
  pub payment_method: Option<String>,
  pub cash_wallet_id: Option<String>,
  pub created_by_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerMoneyResult {
  pub transaction: PostedTransaction,
  pub customer_id: String,
  pub customer_name: String,
  pub currency_code: String,
  pub amount: String,
  pub direction: String,
  pub previous_balance: String,
  pub new_balance: String,
  pub cash_wallet_id: String,
}

fn compose_description(
  description: Option<String>,
  notes: Option<String>,
  fallback: String,
) -> String {
  let desc = description
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty());
  let notes = notes
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty());
  match (desc, notes) {
    (Some(d), Some(n)) => format!("{d} — {n}"),
    (Some(d), None) => d,
    (None, Some(n)) => n,
    (None, None) => fallback,
  }
}

#[tauri::command]
pub fn customer_add_money(
  state: State<'_, AppState>,
  input: CustomerMoneyInput,
) -> Result<CustomerMoneyResult, AppError> {
  let created_by_id = require_nonempty(&input.created_by_id, "createdById")?;
  let customer_id = require_nonempty(&input.customer_id, "customerId")?;
  let amount_raw = require_nonempty(&input.amount, "amount")?;

  let conn = state.db.lock();
  let (customer_id, customer_name) = assert_active_customer(&conn, &customer_id, "Customer")?;
  let cw_id = resolve_sole_customer_wallet(&conn, &customer_id, "Customer")?;
  let cash_id = match input
    .cash_wallet_id
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
  {
    Some(id) => {
      let (cid, cash_type, _, cash_active) = load_wallet(&conn, id)?;
      if cash_active == 0 || (cash_type != "VAULT" && cash_type != "TILL") {
        return Err(AppError::Validation(
          "Cash side must be a vault or till wallet.".into(),
        ));
      }
      cid
    }
    None => resolve_cash_wallet_id(&conn)?,
  };

  let (currency_id, currency_code, places) = find_currency_by_code(&conn, &input.currency_code)?;
  let minor = money_from_major_units(&amount_raw, places)?;
  if minor <= 0 {
    return Err(AppError::Validation("Amount must be positive.".into()));
  }

  let previous = wallet_currency_balance_minor(&conn, &cw_id, &currency_id, places)?;
  let previous_balance = money_to_major_unit_string(previous, places)?;
  let new_balance = money_to_major_unit_string(previous + minor, places)?;

  let reference = input
    .reference
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(|s| s.to_string())
    .unwrap_or_else(|| format!("MI-{}", chrono::Utc::now().timestamp_millis()));
  let value_date = input
    .value_date
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(|s| s.to_string())
    .unwrap_or_else(now_sqlite);
  let mut description = compose_description(
    input.description,
    input.notes,
    format!("Add Money — {customer_name}"),
  );
  if let Some(method) = input
    .payment_method
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
  {
    description = format!("{description} [{method}]");
  }

  let transaction = post_customer_give(
    &conn,
    reference,
    "DEPOSIT",
    cw_id,
    cash_id.clone(),
    Some(customer_id.clone()),
    currency_code.clone(),
    minor,
    value_date,
    Some(description),
    created_by_id,
  )?;

  Ok(CustomerMoneyResult {
    transaction,
    customer_id,
    customer_name,
    currency_code,
    amount: amount_raw,
    direction: "IN".into(),
    previous_balance,
    new_balance,
    cash_wallet_id: cash_id,
  })
}

#[tauri::command]
pub fn customer_take_money(
  state: State<'_, AppState>,
  input: CustomerMoneyInput,
) -> Result<CustomerMoneyResult, AppError> {
  let created_by_id = require_nonempty(&input.created_by_id, "createdById")?;
  let customer_id = require_nonempty(&input.customer_id, "customerId")?;
  let amount_raw = require_nonempty(&input.amount, "amount")?;

  let conn = state.db.lock();
  let (customer_id, customer_name) = assert_active_customer(&conn, &customer_id, "Customer")?;
  let cw_id = resolve_sole_customer_wallet(&conn, &customer_id, "Customer")?;
  let cash_id = match input
    .cash_wallet_id
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
  {
    Some(id) => {
      let (cid, cash_type, _, cash_active) = load_wallet(&conn, id)?;
      if cash_active == 0 || (cash_type != "VAULT" && cash_type != "TILL") {
        return Err(AppError::Validation(
          "Cash side must be a vault or till wallet.".into(),
        ));
      }
      cid
    }
    None => resolve_cash_wallet_id(&conn)?,
  };

  let (currency_id, currency_code, places) = find_currency_by_code(&conn, &input.currency_code)?;
  let minor = money_from_major_units(&amount_raw, places)?;
  if minor <= 0 {
    return Err(AppError::Validation("Amount must be positive.".into()));
  }

  let previous = wallet_currency_balance_minor(&conn, &cw_id, &currency_id, places)?;
  if previous < minor {
    return Err(AppError::Validation(
      "Insufficient customer balance.".into(),
    ));
  }
  let cash_bal = wallet_currency_balance_minor(&conn, &cash_id, &currency_id, places)?;
  if cash_bal < minor {
    return Err(AppError::Validation(format!(
      "Insufficient {currency_code} cash available."
    )));
  }

  let previous_balance = money_to_major_unit_string(previous, places)?;
  let new_balance = money_to_major_unit_string(previous - minor, places)?;

  let reference = input
    .reference
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(|s| s.to_string())
    .unwrap_or_else(|| format!("MO-{}", chrono::Utc::now().timestamp_millis()));
  let value_date = input
    .value_date
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(|s| s.to_string())
    .unwrap_or_else(now_sqlite);
  let description = compose_description(
    input.description,
    input.notes,
    format!("Take Money — {customer_name}"),
  );

  let transaction = post_customer_take(
    &conn,
    reference,
    "WITHDRAWAL",
    cw_id,
    cash_id.clone(),
    Some(customer_id.clone()),
    currency_code.clone(),
    minor,
    value_date,
    Some(description),
    created_by_id,
  )?;

  Ok(CustomerMoneyResult {
    transaction,
    customer_id,
    customer_name,
    currency_code,
    amount: amount_raw,
    direction: "OUT".into(),
    previous_balance,
    new_balance,
    cash_wallet_id: cash_id,
  })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferInput {
  pub reference: String,
  pub sender_customer_id: String,
  pub receiver_customer_id: String,
  pub currency_code: String,
  pub amount: String,
  pub value_date: Option<String>,
  pub description: Option<String>,
  pub created_by_id: String,
}

#[tauri::command]
pub fn transfer_funds(
  state: State<'_, AppState>,
  input: TransferInput,
) -> Result<PostedTransaction, AppError> {
  let reference = require_nonempty(&input.reference, "reference")?;
  let sender_id = require_nonempty(&input.sender_customer_id, "senderCustomerId")?;
  let receiver_id = require_nonempty(&input.receiver_customer_id, "receiverCustomerId")?;
  let created_by_id = require_nonempty(&input.created_by_id, "createdById")?;
  if sender_id == receiver_id {
    return Err(AppError::Validation(
      "Sender and receiver must be different customers.".into(),
    ));
  }

  let conn = state.db.lock();
  let (sender_id, sender_name) = assert_active_customer(&conn, &sender_id, "Sender")?;
  let (receiver_id, receiver_name) = assert_active_customer(&conn, &receiver_id, "Receiver")?;
  let sender_wallet = resolve_sole_customer_wallet(&conn, &sender_id, "Sender")?;
  let receiver_wallet = resolve_sole_customer_wallet(&conn, &receiver_id, "Receiver")?;
  if sender_wallet == receiver_wallet {
    return Err(AppError::Validation(
      "Sender and receiver wallets must be different.".into(),
    ));
  }

  let (currency_id, currency_code, places) = find_currency_by_code(&conn, &input.currency_code)?;
  let minor = money_from_major_units(&input.amount, places)?;
  let balance = wallet_currency_balance_minor(&conn, &sender_wallet, &currency_id, places)?;
  if balance < minor {
    return Err(AppError::Validation(
      "Sender has insufficient balance for this transfer.".into(),
    ));
  }

  let value_date = input
    .value_date
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty())
    .unwrap_or_else(now_sqlite);
  let description = input
    .description
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty())
    .unwrap_or_else(|| {
      format!(
        "Transfer {} {} from {} to {}",
        input.amount.trim(),
        currency_code,
        sender_name,
        receiver_name
      )
    });

  post_transaction(
    &conn,
    PostTransactionInput {
      reference,
      r#type: "TRANSFER".into(),
      value_date,
      customer_id: Some(sender_id),
      walk_in_name: None,
      walk_in_phone: None,
      description: Some(description),
      created_by_id: Some(created_by_id),
      entries: vec![
        PostingLineDto {
          wallet_id: sender_wallet,
          currency: currency_code.clone(),
          direction: "CREDIT".into(),
          amount_minor: minor.to_string(),
          exchange_rate_id: None,
          memo: Some("Customer transfer".into()),
        },
        PostingLineDto {
          wallet_id: receiver_wallet,
          currency: currency_code,
          direction: "DEBIT".into(),
          amount_minor: minor.to_string(),
          exchange_rate_id: None,
          memo: Some("Customer transfer".into()),
        },
      ],
    },
  )
}
