//! High-level money movements — deposit, withdrawal, transfer (via post_transaction).

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::commands::trading::util::soft_delete_desk_transaction;
use crate::error::AppError;
use crate::ledger::{
  find_currency_by_code, money_from_major_units, money_to_major_unit_string, signed_balance_to_display,
  post_transaction_in_tx, resolve_shop_cash_wallet_id, wallet_currency_balance_minor,
  restore_temporary_customers_for_movement_edit,
  PostTransactionInput, PostedTransaction, PostingLineDto,
};
use crate::state::AppState;
use crate::util::{format_amount_commas, now_sqlite};
use crate::commands::authorize::{require_any_screen_write};

const OPENING_EQUITY_WALLET_NAME: &str = "Opening Equity";
const EXCHANGE_DIFFERENCE_WALLET_NAME: &str = "Exchange Difference";

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

fn resolve_exchange_difference_wallet(conn: &Connection) -> Result<String, AppError> {
  let existing: Option<String> = conn
    .query_row(
      "SELECT id FROM Wallet WHERE name = ?1 AND type = 'SYSTEM'
       AND deletedAt IS NULL AND isActive = 1 LIMIT 1",
      [EXCHANGE_DIFFERENCE_WALLET_NAME],
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
    params![id, EXCHANGE_DIFFERENCE_WALLET_NAME, now],
  )?;
  Ok(id)
}

fn parse_positive_f64(raw: &str, field: &str) -> Result<f64, AppError> {
  let n: f64 = raw.trim().replace(',', "").parse().map_err(|_| {
    AppError::Validation(format!("{field} must be a positive number."))
  })?;
  if !n.is_finite() || n <= 0.0 {
    return Err(AppError::Validation(format!("{field} must be a positive number.")));
  }
  Ok(n)
}

fn fmt_money(v: f64) -> String {
  if !v.is_finite() {
    return "0".into();
  }
  if (v - v.round()).abs() < 1e-9 {
    format!("{}", v.round() as i64)
  } else {
    format!("{v:.6}").trim_end_matches('0').trim_end_matches('.').to_string()
  }
}

fn compute_deal_pnl(
  from_code: &str, to_code: &str, from_major: f64, to_major: f64,
  high_code: &str, deal_rate: f64, board_rate: Option<f64>,
) -> Result<(String, String, String, f64, String), AppError> {
  let low_code = if high_code.eq_ignore_ascii_case(from_code) {
    to_code
  } else if high_code.eq_ignore_ascii_case(to_code) {
    from_code
  } else {
    return Err(AppError::Validation(
      "High currency must be either the from or to currency.".into(),
    ));
  };
  let shop_buys_high = from_code.eq_ignore_ascii_case(high_code);
  let side = if shop_buys_high { "BUY_HIGH" } else { "SELL_HIGH" };
  let high_amount = if shop_buys_high { from_major } else { to_major };
  let profit = match board_rate {
    Some(board) if shop_buys_high => high_amount * (board - deal_rate),
    Some(board) => high_amount * (deal_rate - board),
    None => 0.0,
  };
  Ok((side.into(), low_code.into(), fmt_money(deal_rate), profit, fmt_money(profit)))
}

fn default_high_currency(from_code: &str, to_code: &str, supplied: Option<&str>) -> String {
  supplied
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(|s| s.to_ascii_uppercase())
    .or_else(|| {
      [from_code, to_code].into_iter()
        .find(|code| code.eq_ignore_ascii_case("USD"))
        .map(str::to_string)
    })
    .unwrap_or_else(|| from_code.to_ascii_uppercase())
}

fn insert_exchange_deal(
  conn: &Connection,
  transaction_id: &str,
  from: (&str, &str, &str),
  to: (&str, &str, &str),
  high_currency_code: Option<&str>,
  board_rate: Option<&str>,
  value_date: &str,
  created_by_id: &str,
) -> Result<(), AppError> {
  let has_deal: bool = conn.query_row(
    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='ExchangeDeal')",
    [], |row| row.get(0),
  )?;
  if !has_deal {
    return Ok(());
  }
  let from_major = parse_positive_f64(from.2, "fromAmount")?;
  let to_major = parse_positive_f64(to.2, "toAmount")?;
  let high_code = default_high_currency(from.1, to.1, high_currency_code);
  let deal_rate = if high_code.eq_ignore_ascii_case(from.1) {
    to_major / from_major
  } else {
    from_major / to_major
  };
  let board_rate = board_rate
    .map(str::trim).filter(|s| !s.is_empty())
    .map(|s| parse_positive_f64(s, "boardRate")).transpose()?;
  let (side, low_code, deal_rate, _profit, profit_amount) = compute_deal_pnl(
    from.1, to.1, from_major, to_major, &high_code, deal_rate, board_rate,
  )?;
  let (high_id, _, _) = find_currency_by_code(conn, &high_code)?;
  let (low_id, _, _) = find_currency_by_code(conn, &low_code)?;
  let now = now_sqlite();
  conn.execute(
    r#"INSERT INTO ExchangeDeal (
         id, transactionId, fromCurrencyId, toCurrencyId, fromAmount, toAmount,
         highCurrencyId, lowCurrencyId, dealRate, boardRate, side,
         profitAmount, profitCurrencyId, valueDate, createdById, deletedAt, createdAt, updatedAt
       ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,NULL,?16,?16)"#,
    params![
      uuid::Uuid::new_v4().to_string(), transaction_id, from.0, to.0, from.2, to.2,
      high_id, low_id, deal_rate, board_rate.map(fmt_money), side, profit_amount,
      low_id, value_date, created_by_id, now,
    ],
  )?;
  Ok(())
}

/// Live deposit: customer↑ and Main Vault↑, balanced via Opening Equity (×2).
/// Distinct from Opening Kata, which records a claim only and does not move cash.
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
  post_transaction_in_tx(
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
          memo: Some("Customer deposit".into()),
        },
        PostingLineDto {
          wallet_id: cash_wallet_id,
          currency: currency_code.clone(),
          direction: "DEBIT".into(),
          amount_minor: minor.to_string(),
          exchange_rate_id: None,
          memo: Some("Main Vault — cash in".into()),
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

/// Live withdrawal: customer↓ and Main Vault↓, balanced via Opening Equity (×2).
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
  post_transaction_in_tx(
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
          memo: Some("Customer withdrawal".into()),
        },
        PostingLineDto {
          wallet_id: cash_wallet_id,
          currency: currency_code.clone(),
          direction: "CREDIT".into(),
          amount_minor: minor.to_string(),
          exchange_rate_id: None,
          memo: Some("Main Vault — cash out".into()),
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

fn post_customer_fx(
  conn: &Connection,
  reference: String,
  tx_type: &str,
  customer_wallet_id: String,
  cash_wallet_id: String,
  customer_id: String,
  account_currency: (&str, &str, i128, &str),
  cash_currency: (&str, &str, i128, &str),
  value_date: String,
  description: String,
  created_by_id: String,
  board_rate: Option<&str>,
  high_currency_code: Option<&str>,
) -> Result<PostedTransaction, AppError> {
  let diff_id = resolve_exchange_difference_wallet(conn)?;
  let is_deposit = tx_type == "DEPOSIT";
  let customer_direction = if is_deposit { "DEBIT" } else { "CREDIT" };
  let cash_direction = if is_deposit { "DEBIT" } else { "CREDIT" };
  let diff_direction = if is_deposit { "CREDIT" } else { "DEBIT" };
  let transaction = post_transaction_in_tx(
    conn,
    PostTransactionInput {
      reference,
      r#type: tx_type.into(),
      value_date: value_date.clone(),
      customer_id: Some(customer_id),
      walk_in_name: None,
      walk_in_phone: None,
      description: Some(description),
      created_by_id: Some(created_by_id.clone()),
      entries: vec![
        PostingLineDto {
          wallet_id: customer_wallet_id, currency: account_currency.1.into(),
          direction: customer_direction.into(), amount_minor: account_currency.2.to_string(),
          exchange_rate_id: None, memo: Some(format!("Customer {tx_type} account leg")),
        },
        PostingLineDto {
          wallet_id: cash_wallet_id, currency: cash_currency.1.into(),
          direction: cash_direction.into(), amount_minor: cash_currency.2.to_string(),
          exchange_rate_id: None, memo: Some(format!("Main Vault — {tx_type} cash leg")),
        },
        PostingLineDto {
          wallet_id: diff_id.clone(), currency: account_currency.1.into(),
          direction: diff_direction.into(), amount_minor: account_currency.2.to_string(),
          exchange_rate_id: None, memo: Some("FX balancing leg".into()),
        },
        PostingLineDto {
          wallet_id: diff_id, currency: cash_currency.1.into(),
          direction: diff_direction.into(), amount_minor: cash_currency.2.to_string(),
          exchange_rate_id: None, memo: Some("FX balancing leg".into()),
        },
      ],
    },
  )?;
  // The customer gives cash on a deposit, and receives cash on a withdrawal.
  let (from, to) = if is_deposit {
    (cash_currency, account_currency)
  } else {
    (account_currency, cash_currency)
  };
  insert_exchange_deal(
    conn, &transaction.id, (from.0, from.1, from.3), (to.0, to.1, to.3),
    high_currency_code, board_rate, &value_date, &created_by_id,
  )?;
  Ok(transaction)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DepositInput {
  pub reference: String,
  pub customer_wallet_id: String,
  /// Optional — ignored when set; shop cash is always Main Vault.
  pub cash_wallet_id: Option<String>,
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
  let _ = input.created_by_id.trim();

  let conn = state.db.lock();
  let actor = require_any_screen_write(&state, &conn, &["cash", "customers"])?;
  let created_by_id = actor.id.clone();
  let cash_id = resolve_shop_cash_wallet_id(&conn, input.cash_wallet_id.as_deref())?;
  if customer_wallet_id == cash_id {
    return Err(AppError::Validation(
      "Customer wallet and cash wallet must be different.".into(),
    ));
  }
  let (cw_id, cw_type, customer_id, cw_active) = load_wallet(&conn, &customer_wallet_id)?;
  if cw_active == 0 || cw_type != "CUSTOMER" || customer_id.is_none() {
    return Err(AppError::Validation("Deposit requires a customer wallet.".into()));
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
  /// Optional — ignored when set; shop cash is always Main Vault.
  pub cash_wallet_id: Option<String>,
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
  let _ = input.created_by_id.trim();

  let conn = state.db.lock();
  let actor = require_any_screen_write(&state, &conn, &["cash", "customers"])?;
  let created_by_id = actor.id.clone();
  let cash_id = resolve_shop_cash_wallet_id(&conn, input.cash_wallet_id.as_deref())?;
  if customer_wallet_id == cash_id {
    return Err(AppError::Validation(
      "Customer wallet and cash wallet must be different.".into(),
    ));
  }

  let (cw_id, cw_type, customer_id, cw_active) = load_wallet(&conn, &customer_wallet_id)?;
  if cw_active == 0 || cw_type != "CUSTOMER" || customer_id.is_none() {
    return Err(AppError::Validation(
      "Withdrawal requires a customer wallet.".into(),
    ));
  }

  let (currency_id, currency_code, places) = find_currency_by_code(&conn, &input.currency_code)?;
  let minor = money_from_major_units(&input.amount, places)?;
  if minor <= 0 {
    return Err(AppError::Validation("Amount must be positive.".into()));
  }

  let cash_bal = wallet_currency_balance_minor(&conn, &cash_id, &currency_id, places)?;
  if cash_bal < minor {
    return Err(AppError::Validation(format!(
      "Insufficient {currency_code} cash available."
    )));
  }
  // Customer overdraft allowed (ADR-046) — no customer-wallet insufficient-balance check.

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
  pub cash_currency_code: Option<String>,
  pub cash_amount: Option<String>,
  pub board_rate: Option<String>,
  pub high_currency_code: Option<String>,
  pub value_date: Option<String>,
  pub description: Option<String>,
  pub notes: Option<String>,
  /// Who delivered/collected cash. Empty/None = self ("by his own").
  pub acted_by_name: Option<String>,
  pub reference: Option<String>,
  /// Cash | Bank | Other — currently resolves to till/vault (Cash default).
  pub payment_method: Option<String>,
  pub cash_wallet_id: Option<String>,
  pub created_by_id: String,
  /// Soft-delete this existing movement before posting the replacement.
  pub replace_transaction_id: Option<String>,
}

fn acted_by_clause(acted_by_name: Option<String>) -> String {
  match acted_by_name
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty())
  {
    Some(name) => format!("by {name}"),
    None => "by his own".into(),
  }
}

/// Soft-delete a prior DEPOSIT/WITHDRAWAL/TRANSFER before re-posting a replacement.
fn soft_delete_replaced_movement(
  conn: &Connection,
  replace_transaction_id: Option<&str>,
  expected_type: &str,
) -> Result<(), AppError> {
  let Some(id) = replace_transaction_id
    .map(str::trim)
    .filter(|s| !s.is_empty())
  else {
    return Ok(());
  };
  let (found_id, tx_type): (String, String) = conn
    .query_row(
      r#"SELECT id, type FROM "Transaction"
         WHERE id = ?1 AND deletedAt IS NULL
         LIMIT 1"#,
      [id],
      |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .map_err(|e| match e {
      rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(
        "Transaction to replace was not found (or already deleted).".into(),
      ),
      other => other.into(),
    })?;
  if !tx_type.eq_ignore_ascii_case(expected_type) {
    return Err(AppError::Validation(format!(
      "Cannot replace a {tx_type} transaction with a {expected_type}."
    )));
  }
  soft_delete_desk_transaction(conn, &found_id)?;
  Ok(())
}

fn deposit_description(customer_name: &str, amount: &str, currency: &str, acted_by: &str) -> String {
  format!(
    "{customer_name} deposited {} {currency} to his account {acted_by}",
    format_amount_commas(amount)
  )
}

/// Deposit against a negative customer balance (customer owed Sarafi).
fn deposit_debt_repayment_description(
  customer_name: &str,
  amount: &str,
  currency: &str,
) -> String {
  format!(
    "{customer_name} deposited {} {currency} — debt repayment",
    format_amount_commas(amount)
  )
}

fn withdrawal_description(
  customer_name: &str,
  amount: &str,
  currency: &str,
  acted_by: &str,
) -> String {
  format!(
    "{customer_name} withdrew {} {currency} from his account {acted_by}",
    format_amount_commas(amount)
  )
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

#[tauri::command]
pub fn customer_add_money(
  state: State<'_, AppState>,
  input: CustomerMoneyInput,
) -> Result<CustomerMoneyResult, AppError> {
  let _ = input.created_by_id.trim();
  let customer_id = require_nonempty(&input.customer_id, "customerId")?;
  let amount_raw = require_nonempty(&input.amount, "amount")?;

  let conn = state.db.lock();
  let actor = require_any_screen_write(&state, &conn, &["cash", "customers"])?;
  let created_by_id = actor.id.clone();
  restore_temporary_customers_for_movement_edit(
    &conn,
    input.replace_transaction_id.as_deref(),
    &[&customer_id],
  )?;
  let (customer_id, customer_name) = assert_active_customer(&conn, &customer_id, "Customer")?;
  let cw_id = resolve_sole_customer_wallet(&conn, &customer_id, "Customer")?;
  let cash_id = resolve_shop_cash_wallet_id(&conn, input.cash_wallet_id.as_deref())?;

  let (currency_id, currency_code, places) = find_currency_by_code(&conn, &input.currency_code)?;
  let minor = money_from_major_units(&amount_raw, places)?;
  if minor <= 0 {
    return Err(AppError::Validation("Amount must be positive.".into()));
  }
  let account_amount = money_to_major_unit_string(minor, places)?;
  let cash_fx = match (
    input.cash_currency_code.as_deref().map(str::trim).filter(|s| !s.is_empty()),
    input.cash_amount.as_deref().map(str::trim).filter(|s| !s.is_empty()),
  ) {
    (Some(cash_code), Some(cash_amount)) if !cash_code.eq_ignore_ascii_case(&currency_code) => {
      let (cash_currency_id, cash_currency_code, cash_places) =
        find_currency_by_code(&conn, cash_code)?;
      let cash_minor = money_from_major_units(cash_amount, cash_places)?;
      if cash_minor <= 0 {
        return Err(AppError::Validation("cashAmount must be positive.".into()));
      }
      Some((
        cash_currency_id,
        cash_currency_code,
        cash_minor,
        money_to_major_unit_string(cash_minor, cash_places)?,
      ))
    }
    _ => None,
  };

  let previous = wallet_currency_balance_minor(&conn, &cw_id, &currency_id, places)?;
  let previous_balance = signed_balance_to_display(previous, places)?;
  let new_balance = signed_balance_to_display(previous + minor, places)?;

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
  let mut description = if previous < 0 {
    match &cash_fx {
      Some((_, cash_code, _, cash_amount)) => format!(
        "{customer_name} deposited {} {cash_code} as {} {currency_code} — debt repayment",
        format_amount_commas(cash_amount),
        format_amount_commas(&account_amount),
      ),
      None => {
        deposit_debt_repayment_description(&customer_name, &account_amount, &currency_code)
      }
    }
  } else {
    let by = acted_by_clause(input.acted_by_name);
    input
      .description
      .map(|s| s.trim().to_string())
      .filter(|s| !s.is_empty())
      .unwrap_or_else(|| match &cash_fx {
        Some((_, cash_code, _, cash_amount)) => format!(
          "{customer_name} deposited {} {cash_code} cash for {} {currency_code} to his account {by}",
          format_amount_commas(cash_amount),
          format_amount_commas(&account_amount),
        ),
        None => deposit_description(&customer_name, &amount_raw, &currency_code, &by),
      })
  };
  if let Some(extra) = input
    .notes
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
  {
    description = format!("{description} ({extra})");
  }
  let _ = input.payment_method;

  conn.execute_batch("BEGIN IMMEDIATE;")?;
  let result = (|| -> Result<CustomerMoneyResult, AppError> {
    soft_delete_replaced_movement(&conn, input.replace_transaction_id.as_deref(), "DEPOSIT")?;

    let transaction = if let Some((cash_currency_id, cash_currency_code, cash_minor, cash_amount)) =
      cash_fx
    {
      post_customer_fx(
        &conn,
        reference,
        "DEPOSIT",
        cw_id,
        cash_id.clone(),
        customer_id.clone(),
        (&currency_id, &currency_code, minor, &account_amount),
        (&cash_currency_id, &cash_currency_code, cash_minor, &cash_amount),
        value_date,
        description,
        created_by_id,
        input.board_rate.as_deref(),
        input.high_currency_code.as_deref(),
      )?
    } else {
      post_customer_give(
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
      )?
    };

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
  })();
  match result {
    Ok(out) => {
      conn.execute_batch("COMMIT;")?;
      Ok(out)
    }
    Err(e) => {
      let _ = conn.execute_batch("ROLLBACK;");
      Err(e)
    }
  }
}

#[tauri::command]
pub fn customer_take_money(
  state: State<'_, AppState>,
  input: CustomerMoneyInput,
) -> Result<CustomerMoneyResult, AppError> {
  let _ = input.created_by_id.trim();
  let customer_id = require_nonempty(&input.customer_id, "customerId")?;
  let amount_raw = require_nonempty(&input.amount, "amount")?;

  let conn = state.db.lock();
  let actor = require_any_screen_write(&state, &conn, &["cash", "customers"])?;
  let created_by_id = actor.id.clone();
  restore_temporary_customers_for_movement_edit(
    &conn,
    input.replace_transaction_id.as_deref(),
    &[&customer_id],
  )?;
  let (customer_id, customer_name) = assert_active_customer(&conn, &customer_id, "Customer")?;
  let cw_id = resolve_sole_customer_wallet(&conn, &customer_id, "Customer")?;
  let cash_id = resolve_shop_cash_wallet_id(&conn, input.cash_wallet_id.as_deref())?;

  let (currency_id, currency_code, places) = find_currency_by_code(&conn, &input.currency_code)?;
  let minor = money_from_major_units(&amount_raw, places)?;
  if minor <= 0 {
    return Err(AppError::Validation("Amount must be positive.".into()));
  }
  let account_amount = money_to_major_unit_string(minor, places)?;
  let cash_fx = match (
    input.cash_currency_code.as_deref().map(str::trim).filter(|s| !s.is_empty()),
    input.cash_amount.as_deref().map(str::trim).filter(|s| !s.is_empty()),
  ) {
    (Some(cash_code), Some(cash_amount)) if !cash_code.eq_ignore_ascii_case(&currency_code) => {
      let (cash_currency_id, cash_currency_code, cash_places) =
        find_currency_by_code(&conn, cash_code)?;
      let cash_minor = money_from_major_units(cash_amount, cash_places)?;
      if cash_minor <= 0 {
        return Err(AppError::Validation("cashAmount must be positive.".into()));
      }
      Some((
        cash_currency_id,
        cash_currency_code,
        cash_minor,
        money_to_major_unit_string(cash_minor, cash_places)?,
      ))
    }
    _ => None,
  };

  let previous = wallet_currency_balance_minor(&conn, &cw_id, &currency_id, places)?;
  let (cash_check_id, cash_check_places, cash_check_minor, cash_check_code) = cash_fx
    .as_ref()
    .map(|(id, code, cash_minor, _)| (id.as_str(), 0_i64, *cash_minor, code.as_str()))
    .unwrap_or((&currency_id, places, minor, currency_code.as_str()));
  let cash_check_places = if cash_fx.is_some() {
    find_currency_by_code(&conn, cash_check_code)?.2
  } else {
    cash_check_places
  };
  let cash_bal = wallet_currency_balance_minor(&conn, &cash_id, cash_check_id, cash_check_places)?;
  if cash_bal < cash_check_minor {
    return Err(AppError::Validation(format!(
      "Insufficient {cash_check_code} cash available."
    )));
  }

  // Customer overdraft allowed (ADR-046): negative wallet balance = customer owes Sarafi.
  // Ledger entry amounts stay positive; CREDIT on CUSTOMER produces the negative derived balance.
  let previous_balance = signed_balance_to_display(previous, places)?;
  let new_balance = signed_balance_to_display(previous - minor, places)?;

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
  let by = acted_by_clause(input.acted_by_name);
  let mut description = input
    .description
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty())
    .unwrap_or_else(|| match &cash_fx {
      Some((_, cash_code, _, cash_amount)) => format!(
        "{customer_name} withdrew {} {cash_code} cash from {} {currency_code} account {by}",
        format_amount_commas(cash_amount), format_amount_commas(&account_amount),
      ),
      None => withdrawal_description(&customer_name, &amount_raw, &currency_code, &by),
    });
  if let Some(extra) = input
    .notes
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
  {
    description = format!("{description} ({extra})");
  }
  let _ = input.payment_method;

  conn.execute_batch("BEGIN IMMEDIATE;")?;
  let result = (|| -> Result<CustomerMoneyResult, AppError> {
    soft_delete_replaced_movement(&conn, input.replace_transaction_id.as_deref(), "WITHDRAWAL")?;

    let transaction = if let Some((cash_currency_id, cash_currency_code, cash_minor, cash_amount)) =
      cash_fx
    {
      post_customer_fx(
        &conn,
        reference,
        "WITHDRAWAL",
        cw_id,
        cash_id.clone(),
        customer_id.clone(),
        (&currency_id, &currency_code, minor, &account_amount),
        (&cash_currency_id, &cash_currency_code, cash_minor, &cash_amount),
        value_date,
        description,
        created_by_id,
        input.board_rate.as_deref(),
        input.high_currency_code.as_deref(),
      )?
    } else {
      post_customer_take(
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
      )?
    };

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
  })();
  match result {
    Ok(out) => {
      conn.execute_batch("COMMIT;")?;
      Ok(out)
    }
    Err(e) => {
      let _ = conn.execute_batch("ROLLBACK;");
      Err(e)
    }
  }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferInput {
  pub reference: String,
  pub sender_customer_id: String,
  pub receiver_customer_id: String,
  pub currency_code: String,
  pub amount: String,
  /// Optional cross-currency receive leg.
  pub receive_amount: Option<String>,
  pub receive_currency_code: Option<String>,
  pub board_rate: Option<String>,
  pub high_currency_code: Option<String>,
  pub value_date: Option<String>,
  pub description: Option<String>,
  pub created_by_id: String,
  /// Soft-delete this existing transfer before posting the replacement.
  pub replace_transaction_id: Option<String>,
}

#[tauri::command]
pub fn transfer_funds(
  state: State<'_, AppState>,
  input: TransferInput,
) -> Result<PostedTransaction, AppError> {
  let reference = require_nonempty(&input.reference, "reference")?;
  let sender_id = require_nonempty(&input.sender_customer_id, "senderCustomerId")?;
  let receiver_id = require_nonempty(&input.receiver_customer_id, "receiverCustomerId")?;
  let _ = input.created_by_id.trim();
  if sender_id == receiver_id {
    return Err(AppError::Validation(
      "Sender and receiver must be different customers.".into(),
    ));
  }

  let conn = state.db.lock();
  let actor = require_any_screen_write(&state, &conn, &["cash", "customers"])?;
  let created_by_id = actor.id.clone();
  restore_temporary_customers_for_movement_edit(
    &conn,
    input.replace_transaction_id.as_deref(),
    &[&sender_id, &receiver_id],
  )?;
  let (sender_id, sender_name) = assert_active_customer(&conn, &sender_id, "Sender")?;
  let (receiver_id, receiver_name) = assert_active_customer(&conn, &receiver_id, "Receiver")?;
  let sender_wallet = resolve_sole_customer_wallet(&conn, &sender_id, "Sender")?;
  let receiver_wallet = resolve_sole_customer_wallet(&conn, &receiver_id, "Receiver")?;
  if sender_wallet == receiver_wallet {
    return Err(AppError::Validation(
      "Sender and receiver wallets must be different.".into(),
    ));
  }

  let (_currency_id, currency_code, places) = find_currency_by_code(&conn, &input.currency_code)?;
  let minor = money_from_major_units(&input.amount, places)?;
  if minor <= 0 {
    return Err(AppError::Validation("Amount must be positive.".into()));
  }
  let send_amount = money_to_major_unit_string(minor, places)?;
  let receive_fx = match (
    input.receive_currency_code.as_deref().map(str::trim).filter(|s| !s.is_empty()),
    input.receive_amount.as_deref().map(str::trim).filter(|s| !s.is_empty()),
  ) {
    (Some(receive_code), Some(receive_amount))
      if !receive_code.eq_ignore_ascii_case(&currency_code) =>
    {
      let (receive_currency_id, receive_currency_code, receive_places) =
        find_currency_by_code(&conn, receive_code)?;
      let receive_minor = money_from_major_units(receive_amount, receive_places)?;
      if receive_minor <= 0 {
        return Err(AppError::Validation("receiveAmount must be positive.".into()));
      }
      Some((
        receive_currency_id,
        receive_currency_code,
        receive_minor,
        money_to_major_unit_string(receive_minor, receive_places)?,
      ))
    }
    _ => None,
  };
  // Sender may overdraw (negative CUSTOMER balance = owes Sarafi). No customer-side
  // insufficient-balance check. Transfer does not move Main Vault cash.

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
      let amt = format_amount_commas(&input.amount);
      let recv_amt = input
        .receive_amount
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());
      let recv_ccy = input
        .receive_currency_code
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_ascii_uppercase());
      match (recv_amt, recv_ccy) {
        (Some(ra), Some(rc))
          if !rc.eq_ignore_ascii_case(&currency_code) || ra != input.amount.trim() =>
        {
          format!(
            "{sender_name} sent {amt} {currency_code} to {receiver_name} and received {} {rc}",
            format_amount_commas(ra)
          )
        }
        _ => format!(
          "{sender_name} sent {amt} {currency_code} to {receiver_name} from his account"
        ),
      }
    });

  conn.execute_batch("BEGIN IMMEDIATE;")?;
  let result = (|| -> Result<PostedTransaction, AppError> {
    soft_delete_replaced_movement(&conn, input.replace_transaction_id.as_deref(), "TRANSFER")?;

    let transaction = if let Some((
      receive_currency_id,
      receive_currency_code,
      receive_minor,
      receive_amount,
    )) = receive_fx
    {
      let diff_id = resolve_exchange_difference_wallet(&conn)?;
      let transaction = post_transaction_in_tx(
        &conn,
        PostTransactionInput {
          reference,
          r#type: "TRANSFER".into(),
          value_date: value_date.clone(),
          customer_id: Some(sender_id),
          walk_in_name: None,
          walk_in_phone: None,
          description: Some(description),
          created_by_id: Some(created_by_id.clone()),
          entries: vec![
            PostingLineDto {
              wallet_id: sender_wallet,
              currency: currency_code.clone(),
              direction: "CREDIT".into(),
              amount_minor: minor.to_string(),
              exchange_rate_id: None,
              memo: Some("Customer transfer sent".into()),
            },
            PostingLineDto {
              wallet_id: receiver_wallet,
              currency: receive_currency_code.clone(),
              direction: "DEBIT".into(),
              amount_minor: receive_minor.to_string(),
              exchange_rate_id: None,
              memo: Some("Customer transfer received".into()),
            },
            PostingLineDto {
              wallet_id: diff_id.clone(),
              currency: currency_code.clone(),
              direction: "DEBIT".into(),
              amount_minor: minor.to_string(),
              exchange_rate_id: None,
              memo: Some("FX balancing leg".into()),
            },
            PostingLineDto {
              wallet_id: diff_id,
              currency: receive_currency_code.clone(),
              direction: "CREDIT".into(),
              amount_minor: receive_minor.to_string(),
              exchange_rate_id: None,
              memo: Some("FX balancing leg".into()),
            },
          ],
        },
      )?;
      insert_exchange_deal(
        &conn,
        &transaction.id,
        (&_currency_id, &currency_code, &send_amount),
        (&receive_currency_id, &receive_currency_code, &receive_amount),
        input.high_currency_code.as_deref(),
        input.board_rate.as_deref(),
        &value_date,
        &created_by_id,
      )?;
      transaction
    } else {
      post_transaction_in_tx(
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
      )?
    };
    Ok(transaction)
  })();
  match result {
    Ok(out) => {
      conn.execute_batch("COMMIT;")?;
      Ok(out)
    }
    Err(e) => {
      let _ = conn.execute_batch("ROLLBACK;");
      Err(e)
    }
  }
}

fn normalize_movement_type(raw: &str) -> Result<&'static str, AppError> {
  match raw.trim().to_ascii_uppercase().as_str() {
    "DEPOSIT" => Ok("DEPOSIT"),
    "WITHDRAWAL" => Ok("WITHDRAWAL"),
    "TRANSFER" => Ok("TRANSFER"),
    "EXCHANGE" => Ok("EXCHANGE"),
    other => Err(AppError::Validation(format!(
      "Unsupported movement type '{other}'. Expected DEPOSIT, WITHDRAWAL, TRANSFER, or EXCHANGE."
    ))),
  }
}

fn is_allowed_movement_type(tx_type: &str) -> bool {
  matches!(
    tx_type.trim().to_ascii_uppercase().as_str(),
    "DEPOSIT"
      | "WITHDRAWAL"
      | "TRANSFER"
      | "HAWALA"
      | "EXCHANGE"
      | "VAULT_CASH_IN"
      | "VAULT_CASH_OUT"
  )
}

fn is_opening_balance_movement(tx_type: &str, reference: &str) -> bool {
  let t = tx_type.trim().to_ascii_uppercase();
  if t == "OPENING" {
    return true;
  }
  let r = reference.trim().to_ascii_uppercase();
  r.starts_with("OB-") || r.starts_with("OPEN-WALLET")
}

fn soft_delete_allowed(conn: &Connection, tx_type: &str, reference: &str) -> bool {
  if is_allowed_movement_type(tx_type) {
    return true;
  }
  if is_opening_balance_movement(tx_type, reference) {
    return true;
  }
  crate::commands::vaults::is_main_vault_cash_transaction(tx_type, reference)
}

fn format_major_amount_display(raw: &str) -> String {
  let t = raw.trim();
  if t.is_empty() {
    return "0".into();
  }
  if let Ok(v) = t.parse::<f64>() {
    if (v - v.round()).abs() < 1e-9 {
      return format!("{}", v.round() as i64);
    }
    return format!("{v:.4}")
      .trim_end_matches('0')
      .trim_end_matches('.')
      .to_string();
  }
  t.to_string()
}

/// Parse "… by Ali (notes)" / "… by his own" from movement descriptions.
fn parse_acted_by_name(description: Option<&str>) -> Option<String> {
  let desc = description.map(str::trim).filter(|s| !s.is_empty())?;
  if desc.contains(" by his own") {
    return None;
  }
  let idx = desc.rfind(" by ")?;
  let rest = &desc[idx + " by ".len()..];
  let name = rest
    .split(" (")
    .next()
    .unwrap_or(rest)
    .trim();
  if name.is_empty() {
    None
  } else {
    Some(name.to_string())
  }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MovementEditSnapshot {
  pub id: String,
  pub reference: String,
  pub display_ref: String,
  #[serde(rename = "type")]
  pub r#type: String,
  pub value_date: String,
  pub description: Option<String>,
  pub customer_id: Option<String>,
  pub customer_name: Option<String>,
  pub amount: String,
  pub currency_code: String,
  pub cash_amount: Option<String>,
  pub cash_currency_code: Option<String>,
  pub receive_amount: Option<String>,
  pub receive_currency_code: Option<String>,
  pub acted_by_name: Option<String>,
  pub sender_customer_id: Option<String>,
  pub sender_name: Option<String>,
  pub receiver_customer_id: Option<String>,
  pub receiver_name: Option<String>,
}

fn build_movement_edit_snapshot(
  conn: &Connection,
  id: &str,
) -> Result<MovementEditSnapshot, AppError> {
  let row = conn
    .query_row(
      r#"SELECT t.id, t.reference, IFNULL(t.displayRef,''), t.type, t.valueDate, t.description,
                t.customerId, c.fullName
         FROM "Transaction" t
         LEFT JOIN Customer c ON c.id = t.customerId
         WHERE t.id = ?1 AND t.deletedAt IS NULL
         LIMIT 1"#,
      [id],
      |row| {
        Ok((
          row.get::<_, String>(0)?,
          row.get::<_, String>(1)?,
          row.get::<_, String>(2)?,
          row.get::<_, String>(3)?,
          row.get::<_, String>(4)?,
          row.get::<_, Option<String>>(5)?,
          row.get::<_, Option<String>>(6)?,
          row.get::<_, Option<String>>(7)?,
        ))
      },
    )
    .map_err(|e| match e {
      rusqlite::Error::QueryReturnedNoRows => {
        AppError::NotFound("Movement transaction was not found.".into())
      }
      other => other.into(),
    })?;

  let (id, reference, display_ref, tx_type, value_date, description, customer_id, customer_name) =
    row;
  if !is_allowed_movement_type(&tx_type) {
    return Err(AppError::Validation(format!(
      "Transaction type '{tx_type}' is not a customer deposit, withdrawal, or transfer."
    )));
  }

  let mut stmt = conn.prepare(
    r#"SELECT le.direction, CAST(le.amount AS TEXT), cur.code, w.type,
              w.customerId, cust.fullName
       FROM LedgerEntry le
       INNER JOIN Wallet w ON w.id = le.walletId
         AND w.deletedAt IS NULL
       INNER JOIN Currency cur ON cur.id = le.currencyId AND cur.deletedAt IS NULL
       LEFT JOIN Customer cust ON cust.id = w.customerId
       WHERE le.transactionId = ?1
       ORDER BY le.createdAt ASC"#,
  )?;
  let lines: Vec<(String, String, String, String, Option<String>, Option<String>)> = stmt
    .query_map([&id], |row| {
      Ok((
        row.get(0)?,
        row.get(1)?,
        row.get(2)?,
        row.get(3)?,
        row.get(4)?,
        row.get(5)?,
      ))
    })?
    .collect::<Result<Vec<_>, _>>()?;

  let mut amount = String::new();
  let mut currency_code = String::new();
  let mut cash_amount: Option<String> = None;
  let mut cash_currency_code: Option<String> = None;
  let mut receive_amount: Option<String> = None;
  let mut receive_currency_code: Option<String> = None;
  let mut sender_customer_id: Option<String> = None;
  let mut sender_name: Option<String> = None;
  let mut receiver_customer_id: Option<String> = None;
  let mut receiver_name: Option<String> = None;

  if tx_type.eq_ignore_ascii_case("TRANSFER") {
    for (direction, amt_raw, code, wallet_type, cust_id, cust_name) in &lines {
      if wallet_type == "CUSTOMER" && direction.eq_ignore_ascii_case("CREDIT") {
        if amount.is_empty() {
          amount = format_major_amount_display(amt_raw);
          currency_code = code.clone();
        }
        if sender_customer_id.is_none() {
          sender_customer_id = cust_id.clone();
          sender_name = cust_name.clone();
        }
      } else if wallet_type == "CUSTOMER"
        && direction.eq_ignore_ascii_case("DEBIT")
        && receiver_customer_id.is_none()
      {
        receiver_customer_id = cust_id.clone();
        receiver_name = cust_name.clone();
        receive_amount = Some(format_major_amount_display(amt_raw));
        receive_currency_code = Some(code.clone());
      }
    }
  } else {
    for (direction, amt_raw, code, wallet_type, _cust_id, _cust_name) in &lines {
      if wallet_type == "CUSTOMER" && amount.is_empty() {
        let _ = direction;
        amount = format_major_amount_display(amt_raw);
        currency_code = code.clone();
      } else if (wallet_type == "VAULT" || wallet_type == "TILL") && cash_amount.is_none() {
        cash_amount = Some(format_major_amount_display(amt_raw));
        cash_currency_code = Some(code.clone());
      }
    }
  }

  if amount.is_empty() || currency_code.is_empty() {
    return Err(AppError::Validation(
      "Could not resolve amount/currency from customer ledger lines.".into(),
    ));
  }

  let acted_by_name = parse_acted_by_name(description.as_deref());

  Ok(MovementEditSnapshot {
    id,
    reference,
    display_ref,
    r#type: tx_type,
    value_date,
    description,
    customer_id,
    customer_name,
    amount,
    currency_code,
    cash_amount,
    cash_currency_code,
    receive_amount,
    receive_currency_code,
    acted_by_name,
    sender_customer_id,
    sender_name,
    receiver_customer_id,
    receiver_name,
  })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SoftDeleteMovementInput {
  pub id: String,
  pub created_by_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SoftDeleteMovementResult {
  pub id: String,
  pub reference: String,
  #[serde(rename = "type")]
  pub r#type: String,
}

#[tauri::command]
pub fn soft_delete_movement(
  state: State<'_, AppState>,
  input: SoftDeleteMovementInput,
) -> Result<SoftDeleteMovementResult, AppError> {
  let id = require_nonempty(&input.id, "id")?;
  let _ = input.created_by_id.trim();

  let conn = state.db.lock();
  let actor = require_any_screen_write(
    &state,
    &conn,
    &["cash", "transactions", "daybook", "vaults"],
  )?;
  let _ = actor.id;
  let (found_id, reference, _display_ref, tx_type): (String, String, String, String) = conn
    .query_row(
      r#"SELECT id, reference, IFNULL(displayRef,''), type FROM "Transaction"
         WHERE id = ?1 AND deletedAt IS NULL
         LIMIT 1"#,
      [&id],
      |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    )
    .map_err(|e| match e {
      rusqlite::Error::QueryReturnedNoRows => {
        AppError::NotFound("Movement transaction was not found.".into())
      }
      other => other.into(),
    })?;

  if !soft_delete_allowed(&conn, &tx_type, &reference) {
    return Err(AppError::Validation(format!(
      "Only DEPOSIT, WITHDRAWAL, TRANSFER, HAWALA, EXCHANGE, Opening balance, or Main Vault Cash In/Out can be soft-deleted (got {tx_type})."
    )));
  }

  soft_delete_desk_transaction(&conn, &found_id)?;

  Ok(SoftDeleteMovementResult {
    id: found_id,
    reference,
    r#type: tx_type,
  })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetPreviousMovementInput {
  pub transaction_type: String,
  pub before_id: Option<String>,
}

#[tauri::command]
pub fn get_previous_movement(
  state: State<'_, AppState>,
  input: GetPreviousMovementInput,
) -> Result<Option<MovementEditSnapshot>, AppError> {
  let tx_type = normalize_movement_type(&input.transaction_type)?;
  let before_id = input
    .before_id
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(|s| s.to_string());

  let conn = state.db.lock();
  let _actor = require_any_screen_write(&state, &conn, &["cash", "customers"])?;

  let previous_id: Option<String> = if let Some(ref before) = before_id {
    // Ensure before_id exists (may be soft-deleted or not — still use its timestamps).
    let before_row: Option<(String, String)> = conn
      .query_row(
        r#"SELECT createdAt, valueDate FROM "Transaction" WHERE id = ?1 LIMIT 1"#,
        [before],
        |row| Ok((row.get(0)?, row.get(1)?)),
      )
      .optional()?;
    let Some((before_created, before_value)) = before_row else {
      return Err(AppError::NotFound(
        "beforeId transaction was not found.".into(),
      ));
    };
    conn
      .query_row(
        r#"SELECT id FROM "Transaction"
           WHERE deletedAt IS NULL
             AND UPPER(type) = UPPER(?1)
             AND id != ?2
             AND (
               createdAt < ?3
               OR (createdAt = ?3 AND valueDate < ?4)
             )
           ORDER BY createdAt DESC, valueDate DESC, id DESC
           LIMIT 1"#,
        params![tx_type, before, before_created, before_value],
        |row| row.get(0),
      )
      .optional()?
  } else {
    conn
      .query_row(
        r#"SELECT id FROM "Transaction"
           WHERE deletedAt IS NULL
             AND UPPER(type) = UPPER(?1)
           ORDER BY createdAt DESC, valueDate DESC, id DESC
           LIMIT 1"#,
        [tx_type],
        |row| row.get(0),
      )
      .optional()?
  };

  match previous_id {
    Some(id) => Ok(Some(build_movement_edit_snapshot(&conn, &id)?)),
    None => Ok(None),
  }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetMovementForEditInput {
  pub id: String,
}

#[tauri::command]
pub fn get_movement_for_edit(
  state: State<'_, AppState>,
  input: GetMovementForEditInput,
) -> Result<MovementEditSnapshot, AppError> {
  let id = require_nonempty(&input.id, "id")?;
  let conn = state.db.lock();
  let _actor = require_any_screen_write(&state, &conn, &["cash", "customers"])?;
  build_movement_edit_snapshot(&conn, &id)
}

#[cfg(test)]
mod daybook_edit_replace_tests {
  use super::*;
  use crate::commands::trading::util::soft_delete_desk_transaction;
  use crate::ledger::{
    ensure_wallet_balance_cache, post_transaction, post_transaction_in_tx, PostTransactionInput,
    PostingLineDto, wallet_currency_balance_minor,
  };

  fn setup() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    conn
      .execute_batch(
        r#"
        CREATE TABLE Currency (
          id TEXT PRIMARY KEY,
          code TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          symbol TEXT,
          decimalPlaces INTEGER NOT NULL DEFAULT 0,
          isActive INTEGER NOT NULL DEFAULT 1,
          deletedAt TEXT
        );
        CREATE TABLE Wallet (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          customerId TEXT,
          partnerSarafiId TEXT,
          userId TEXT,
          isActive INTEGER NOT NULL DEFAULT 1,
          deletedAt TEXT,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        );
        CREATE TABLE "Transaction" (
          id TEXT PRIMARY KEY,
          reference TEXT NOT NULL UNIQUE,
          displaySeq INTEGER,
          displayRef TEXT,
          type TEXT NOT NULL,
          status TEXT NOT NULL,
          valueDate TEXT NOT NULL,
          postedAt TEXT,
          description TEXT,
          walkInName TEXT,
          walkInPhone TEXT,
          customerId TEXT,
          createdById TEXT,
          deletedAt TEXT,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        );
        CREATE TABLE LedgerEntry (
          id TEXT PRIMARY KEY,
          transactionId TEXT NOT NULL,
          walletId TEXT NOT NULL,
          currencyId TEXT NOT NULL,
          direction TEXT NOT NULL,
          amount TEXT NOT NULL,
          exchangeRateId TEXT,
          memo TEXT,
          createdAt TEXT NOT NULL
        );
        "#,
      )
      .unwrap();
    ensure_wallet_balance_cache(&conn).unwrap();
    let now = now_sqlite();
    conn
      .execute(
        "INSERT INTO Currency (id, code, name, decimalPlaces, isActive) VALUES ('c1','AFN','Afghani',0,1)",
        [],
      )
      .unwrap();
    for (id, name, wtype) in [
      ("cash", "Main Vault", "VAULT"),
      ("eq", "Opening Equity", "SYSTEM"),
    ] {
      conn
        .execute(
          "INSERT INTO Wallet (id, name, type, isActive, deletedAt, createdAt, updatedAt)
           VALUES (?1, ?2, ?3, 1, NULL, ?4, ?4)",
          params![id, name, wtype, now],
        )
        .unwrap();
    }
    conn
  }

  fn post_deposit(conn: &Connection, amount: &str, reference: &str, desc: &str) -> PostedTransaction {
    post_transaction(
      conn,
      PostTransactionInput {
        reference: reference.into(),
        r#type: "DEPOSIT".into(),
        value_date: now_sqlite(),
        customer_id: None,
        walk_in_name: None,
        walk_in_phone: None,
        description: Some(desc.into()),
        created_by_id: Some("admin".into()),
        entries: vec![
          PostingLineDto {
            wallet_id: "cash".into(),
            currency: "AFN".into(),
            direction: "DEBIT".into(),
            amount_minor: amount.into(),
            exchange_rate_id: None,
            memo: None,
          },
          PostingLineDto {
            wallet_id: "eq".into(),
            currency: "AFN".into(),
            direction: "CREDIT".into(),
            amount_minor: amount.into(),
            exchange_rate_id: None,
            memo: None,
          },
        ],
      },
    )
    .unwrap()
  }

  fn live_ref_count(conn: &Connection, reference: &str) -> i64 {
    conn.query_row(
      r#"SELECT COUNT(*) FROM "Transaction"
         WHERE reference = ?1 AND deletedAt IS NULL"#,
      [reference],
      |row| row.get(0),
    )
    .unwrap()
  }

  fn cash_bal(conn: &Connection) -> i128 {
    wallet_currency_balance_minor(conn, "cash", "c1", 0).unwrap()
  }

  #[test]
  fn soft_delete_tombstones_reference_freeing_unique_slot() {
    let conn = setup();
    let posted = post_deposit(&conn, "100", "DB-001", "orig");
    soft_delete_desk_transaction(&conn, &posted.id).unwrap();
    let tomb: String = conn
      .query_row(
        r#"SELECT reference FROM "Transaction" WHERE id = ?1"#,
        [&posted.id],
        |row| row.get(0),
      )
      .unwrap();
    assert!(tomb.contains("__DEL__"), "{tomb}");
    assert_eq!(live_ref_count(&conn, "DB-001"), 0);
  }

  #[test]
  fn replace_reuses_same_reference_without_duplicate() {
    let conn = setup();
    let old = post_deposit(&conn, "100", "DB-EDIT-1", "before");
    assert_eq!(cash_bal(&conn), 100);

    conn.execute_batch("BEGIN IMMEDIATE;").unwrap();
    let new_id = (|| -> Result<String, AppError> {
      soft_delete_desk_transaction(&conn, &old.id)?;
      let p = post_transaction_in_tx(
        &conn,
        PostTransactionInput {
          reference: "DB-EDIT-1".into(),
          r#type: "DEPOSIT".into(),
          value_date: now_sqlite(),
          customer_id: None,
          walk_in_name: None,
          walk_in_phone: None,
          description: Some("after amount+desc".into()),
          created_by_id: Some("admin".into()),
          entries: vec![
            PostingLineDto {
              wallet_id: "cash".into(),
              currency: "AFN".into(),
              direction: "DEBIT".into(),
              amount_minor: "250".into(),
              exchange_rate_id: None,
              memo: None,
            },
            PostingLineDto {
              wallet_id: "eq".into(),
              currency: "AFN".into(),
              direction: "CREDIT".into(),
              amount_minor: "250".into(),
              exchange_rate_id: None,
              memo: None,
            },
          ],
        },
      )?;
      Ok(p.id)
    })()
    .unwrap();
    conn.execute_batch("COMMIT;").unwrap();

    assert_eq!(live_ref_count(&conn, "DB-EDIT-1"), 1);
    assert_ne!(new_id, old.id);
    assert_eq!(cash_bal(&conn), 250);
    let desc: String = conn
      .query_row(
        r#"SELECT description FROM "Transaction" WHERE id = ?1"#,
        [&new_id],
        |row| row.get(0),
      )
      .unwrap();
    assert_eq!(desc, "after amount+desc");
    let old_deleted: Option<String> = conn
      .query_row(
        r#"SELECT deletedAt FROM "Transaction" WHERE id = ?1"#,
        [&old.id],
        |row| row.get(0),
      )
      .unwrap();
    assert!(old_deleted.is_some());
  }

  #[test]
  fn failed_replace_rolls_back_original() {
    let conn = setup();
    let old = post_deposit(&conn, "100", "DB-FAIL-1", "keep-me");
    assert_eq!(cash_bal(&conn), 100);

    conn.execute_batch("BEGIN IMMEDIATE;").unwrap();
    let err = (|| -> Result<(), AppError> {
      soft_delete_desk_transaction(&conn, &old.id)?;
      conn.execute("UPDATE Wallet SET isActive = 0 WHERE id = 'cash'", [])?;
      let _ = post_transaction_in_tx(
        &conn,
        PostTransactionInput {
          reference: "DB-FAIL-1".into(),
          r#type: "DEPOSIT".into(),
          value_date: now_sqlite(),
          customer_id: None,
          walk_in_name: None,
          walk_in_phone: None,
          description: Some("should not land".into()),
          created_by_id: Some("admin".into()),
          entries: vec![
            PostingLineDto {
              wallet_id: "cash".into(),
              currency: "AFN".into(),
              direction: "DEBIT".into(),
              amount_minor: "999".into(),
              exchange_rate_id: None,
              memo: None,
            },
            PostingLineDto {
              wallet_id: "eq".into(),
              currency: "AFN".into(),
              direction: "CREDIT".into(),
              amount_minor: "999".into(),
              exchange_rate_id: None,
              memo: None,
            },
          ],
        },
      )?;
      Ok(())
    })();
    assert!(err.is_err());
    conn.execute_batch("ROLLBACK;").unwrap();

    conn
      .execute("UPDATE Wallet SET isActive = 1 WHERE id = 'cash'", [])
      .unwrap();
    let deleted: Option<String> = conn
      .query_row(
        r#"SELECT deletedAt FROM "Transaction" WHERE id = ?1"#,
        [&old.id],
        |row| row.get(0),
      )
      .unwrap();
    assert!(deleted.is_none(), "original must survive rollback");
    let reference: String = conn
      .query_row(
        r#"SELECT reference FROM "Transaction" WHERE id = ?1"#,
        [&old.id],
        |row| row.get(0),
      )
      .unwrap();
    assert_eq!(reference, "DB-FAIL-1");
    assert_eq!(cash_bal(&conn), 100);
  }

  #[test]
  fn opening_balance_and_vault_cash_are_soft_deletable() {
    let conn = Connection::open_in_memory().unwrap();
    assert!(is_opening_balance_movement("ADJUSTMENT", "OB-123"));
    assert!(is_opening_balance_movement("OPENING", "x"));
    assert!(is_opening_balance_movement("ADJUSTMENT", "OPEN-WALLET-1"));
    assert!(!is_opening_balance_movement("ADJUSTMENT", "OTHER-1"));
    assert!(soft_delete_allowed(&conn, "ADJUSTMENT", "OB-abc"));
    assert!(soft_delete_allowed(&conn, "VAULT_CASH_IN", "CASH-IN-1"));
    assert!(soft_delete_allowed(&conn, "VAULT_CASH_OUT", "CASH-OUT-1"));
    assert!(!soft_delete_allowed(&conn, "EXPENSE", "EX-1"));
  }
}
