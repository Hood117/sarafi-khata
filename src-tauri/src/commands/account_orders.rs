//! Account Orders — bulk remittance distribution documents with ledger integration.
//!
//! Purchase (order create): customer wallet is credited the full original amount;
//! the amount is held in "Account Order Clearing". A purchase deduction is booked
//! as fee income (balanced against Opening Equity).
//!
//! Recipient payout (complete): clearing is released, Main Vault pays the net cash,
//! and the distribution fee is booked as fee income (balanced against Opening Equity).
//!
//! Legacy orders without `transactionId` stay tracking-only — they are never auto-posted.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::commands::authorize::{require_screen, require_screen_write};
use crate::commands::trading::util::soft_delete_desk_transaction;
use crate::error::AppError;
use crate::ledger::{
  allocate_next_account_number, find_currency_by_code, money_from_major_units_allow_zero,
  money_to_major_unit_string, post_transaction_in_tx, resolve_shop_cash_wallet_id,
  signed_balance_to_display, PostTransactionInput, PostingLineDto,
};
use crate::state::AppState;
use crate::util::{now_sqlite, require_nonempty, trim_opt};

const SCREEN: &str = "accountOrders";
const ORDER_STATUSES: &[&str] = &["OPEN", "COMPLETED", "CANCELLED"];
const RECIPIENT_STATUSES: &[&str] = &["PENDING", "COMPLETED"];

const CLEARING_WALLET_NAME: &str = "Account Order Clearing";
const FEE_INCOME_WALLET_NAME: &str = "Account Order Fee Income";
const OPENING_EQUITY_WALLET_NAME: &str = "Opening Equity";

fn normalize_status(raw: &str, allowed: &[&str], field: &str) -> Result<String, AppError> {
  let upper = raw.trim().to_ascii_uppercase();
  if allowed.iter().any(|s| *s == upper) {
    Ok(upper)
  } else {
    Err(AppError::Validation(format!(
      "{field} must be one of: {}.",
      allowed.join(", ")
    )))
  }
}

/// Parse a non-negative percent with up to 4 decimal places into centipercent (×100).
/// Example: "2.90" → 290.
fn parse_percent_cp(raw: &str, field: &str) -> Result<i128, AppError> {
  let trimmed = raw.trim();
  if trimmed.is_empty() {
    return Ok(0);
  }
  let minor = money_from_major_units_allow_zero(trimmed, 2)?;
  if minor < 0 {
    return Err(AppError::Validation(format!("{field} cannot be negative.")));
  }
  if minor > 100_00 {
    return Err(AppError::Validation(format!(
      "{field} cannot exceed 100%."
    )));
  }
  Ok(minor)
}

fn percent_cp_to_string(cp: i128) -> Result<String, AppError> {
  money_to_major_unit_string(cp, 2)
}

fn fee_from_amount(amount_minor: i128, percent_cp: i128) -> i128 {
  // amount * (percent_cp / 100) / 100 = amount * percent_cp / 10_000
  // Round half-up.
  if amount_minor == 0 || percent_cp == 0 {
    return 0;
  }
  let num = amount_minor.saturating_mul(percent_cp);
  (num + 5_000) / 10_000
}

fn next_order_number(conn: &Connection) -> Result<i64, AppError> {
  let max: i64 = conn
    .query_row(
      r#"SELECT COALESCE(MAX("orderNumber"), 0) FROM "AccountOrder""#,
      [],
      |row| row.get(0),
    )
    .unwrap_or(0);
  Ok(max + 1)
}

fn next_recipient_number(conn: &Connection) -> Result<i64, AppError> {
  let max: i64 = conn
    .query_row(
      r#"SELECT COALESCE(MAX("recipientNumber"), 0) FROM "AccountOrderRecipient""#,
      [],
      |row| row.get(0),
    )
    .unwrap_or(0);
  Ok(max + 1)
}

fn ensure_customer_exists(conn: &Connection, customer_id: &str) -> Result<(), AppError> {
  let ok: Option<i64> = conn
    .query_row(
      r#"SELECT 1 FROM "Customer" WHERE id = ?1 AND deletedAt IS NULL LIMIT 1"#,
      [customer_id],
      |row| row.get(0),
    )
    .optional()?;
  if ok.is_none() {
    return Err(AppError::NotFound("Customer was not found.".into()));
  }
  Ok(())
}

fn ensure_order_exists(conn: &Connection, order_id: &str) -> Result<(), AppError> {
  let ok: Option<i64> = conn
    .query_row(
      r#"SELECT 1 FROM "AccountOrder" WHERE id = ?1 AND deletedAt IS NULL"#,
      [order_id],
      |row| row.get(0),
    )
    .optional()?;
  if ok.is_none() {
    return Err(AppError::NotFound("Account order was not found.".into()));
  }
  Ok(())
}

fn run_in_immediate_tx<T>(
  conn: &Connection,
  f: impl FnOnce(&Connection) -> Result<T, AppError>,
) -> Result<T, AppError> {
  conn.execute_batch("BEGIN IMMEDIATE;")?;
  match f(conn) {
    Ok(v) => match conn.execute_batch("COMMIT;") {
      Ok(()) => Ok(v),
      Err(e) => {
        let _ = conn.execute_batch("ROLLBACK;");
        Err(e.into())
      }
    },
    Err(e) => {
      let _ = conn.execute_batch("ROLLBACK;");
      Err(e)
    }
  }
}

fn load_order_amounts(
  conn: &Connection,
  order_id: &str,
  exclude_recipient_id: Option<&str>,
) -> Result<(i128, i128, i64), AppError> {
  // DECIMAL has NUMERIC affinity — whole amounts may be stored as INTEGER/REAL.
  // Always CAST AS TEXT (same pattern as trading/exchange/ledger reads).
  let (original_raw, currency_id): (String, String) = conn
    .query_row(
      r#"SELECT CAST("originalAmount" AS TEXT), "currencyId" FROM "AccountOrder"
         WHERE id = ?1 AND deletedAt IS NULL"#,
      [order_id],
      |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .map_err(|e| match e {
      rusqlite::Error::QueryReturnedNoRows => {
        AppError::NotFound("Account order was not found.".into())
      }
      other => other.into(),
    })?;
  let places: i64 = conn.query_row(
    r#"SELECT "decimalPlaces" FROM "Currency" WHERE id = ?1"#,
    [&currency_id],
    |row| row.get(0),
  )?;
  let original_minor = money_from_major_units_allow_zero(&original_raw, places)?;

  let distributed_minor: i128 = if let Some(exclude) = exclude_recipient_id {
    let mut stmt = conn.prepare(
      r#"SELECT CAST("amount" AS TEXT) FROM "AccountOrderRecipient"
         WHERE "orderId" = ?1 AND deletedAt IS NULL AND id != ?2"#,
    )?;
    let rows = stmt.query_map(params![order_id, exclude], |row| row.get::<_, String>(0))?;
    let mut sum = 0_i128;
    for r in rows {
      let raw = r?;
      sum = sum.saturating_add(money_from_major_units_allow_zero(&raw, places)?);
    }
    sum
  } else {
    let mut stmt = conn.prepare(
      r#"SELECT CAST("amount" AS TEXT) FROM "AccountOrderRecipient"
         WHERE "orderId" = ?1 AND deletedAt IS NULL"#,
    )?;
    let rows = stmt.query_map([order_id], |row| row.get::<_, String>(0))?;
    let mut sum = 0_i128;
    for r in rows {
      let raw = r?;
      sum = sum.saturating_add(money_from_major_units_allow_zero(&raw, places)?);
    }
    sum
  };

  Ok((original_minor, distributed_minor, places))
}

fn assert_distribution_fits(
  original_minor: i128,
  distributed_minor: i128,
  add_minor: i128,
) -> Result<(), AppError> {
  if add_minor < 0 {
    return Err(AppError::Validation("Amount cannot be negative.".into()));
  }
  let total = distributed_minor.saturating_add(add_minor);
  if total > original_minor {
    return Err(AppError::Validation(
      "Distribution exceeds the available order amount.".into(),
    ));
  }
  Ok(())
}

// ─── Ledger helpers ──────────────────────────────────────────────────────────

fn ensure_system_wallet(conn: &Connection, name: &str) -> Result<String, AppError> {
  let existing: Option<String> = conn
    .query_row(
      "SELECT id FROM Wallet
       WHERE name = ?1 AND type = 'SYSTEM' AND deletedAt IS NULL AND isActive = 1
       LIMIT 1",
      [name],
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
    params![id, name, now],
  )?;
  Ok(id)
}

fn resolve_sole_customer_wallet(conn: &Connection, customer_id: &str) -> Result<String, AppError> {
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

fn posting_line(
  wallet_id: &str,
  currency: &str,
  direction: &str,
  amount_minor: i128,
  memo: &str,
) -> PostingLineDto {
  PostingLineDto {
    wallet_id: wallet_id.to_string(),
    currency: currency.to_string(),
    direction: direction.to_string(),
    amount_minor: amount_minor.to_string(),
    exchange_rate_id: None,
    memo: Some(memo.to_string()),
  }
}

/// Build the balanced purchase entries (pure — used by posting and tests).
///
/// ```text
/// CREDIT customer_wallet O
/// DEBIT  Account Order Clearing O
/// DEBIT  Opening Equity D          (omitted when D == 0)
/// CREDIT Account Order Fee Income D
/// ```
fn purchase_entries(
  customer_wallet_id: &str,
  clearing_id: &str,
  equity_id: &str,
  fee_income_id: &str,
  currency: &str,
  original_minor: i128,
  deduction_minor: i128,
) -> Vec<PostingLineDto> {
  let mut entries = vec![
    posting_line(
      customer_wallet_id,
      currency,
      "CREDIT",
      original_minor,
      "Account order purchase",
    ),
    posting_line(
      clearing_id,
      currency,
      "DEBIT",
      original_minor,
      "Account order clearing",
    ),
  ];
  if deduction_minor > 0 {
    entries.push(posting_line(
      equity_id,
      currency,
      "DEBIT",
      deduction_minor,
      "Purchase deduction offset",
    ));
    entries.push(posting_line(
      fee_income_id,
      currency,
      "CREDIT",
      deduction_minor,
      "Purchase deduction income",
    ));
  }
  entries
}

/// Build the balanced recipient payout entries (pure).
///
/// ```text
/// CREDIT Account Order Clearing A
/// CREDIT Main Vault N              (N = A - F; omitted when 0)
/// CREDIT Account Order Fee Income F (omitted when 0)
/// DEBIT  Opening Equity (A + N + F)
/// ```
fn payout_entries(
  clearing_id: &str,
  vault_id: &str,
  fee_income_id: &str,
  equity_id: &str,
  currency: &str,
  amount_minor: i128,
  fee_minor: i128,
) -> Vec<PostingLineDto> {
  let net_minor = amount_minor - fee_minor;
  let mut entries = vec![posting_line(
    clearing_id,
    currency,
    "CREDIT",
    amount_minor,
    "Account order clearing release",
  )];
  if net_minor > 0 {
    entries.push(posting_line(
      vault_id,
      currency,
      "CREDIT",
      net_minor,
      "Account order cash payout",
    ));
  }
  if fee_minor > 0 {
    entries.push(posting_line(
      fee_income_id,
      currency,
      "CREDIT",
      fee_minor,
      "Distribution fee income",
    ));
  }
  entries.push(posting_line(
    equity_id,
    currency,
    "DEBIT",
    amount_minor + net_minor + fee_minor,
    "Account order payout offset",
  ));
  entries
}

/// Post the purchase for an existing order row and store `AccountOrder.transactionId`.
/// Runs inside the caller's SQLite transaction.
fn post_purchase_for_order(
  conn: &Connection,
  order_id: &str,
  actor_id: &str,
) -> Result<String, AppError> {
  let (order_number, name, customer_id, order_date, original_raw, purchase_raw, code, places, tx_id): (
    i64,
    String,
    Option<String>,
    String,
    String,
    String,
    String,
    i64,
    Option<String>,
  ) = conn
    .query_row(
      r#"SELECT o."orderNumber", o.name, o."customerId", o."orderDate",
                CAST(o."originalAmount" AS TEXT),
                CAST(o."purchaseDeductionPercent" AS TEXT),
                cur.code, cur."decimalPlaces", o."transactionId"
         FROM "AccountOrder" o
         JOIN "Currency" cur ON cur.id = o."currencyId"
         WHERE o.id = ?1 AND o.deletedAt IS NULL"#,
      [order_id],
      |row| {
        Ok((
          row.get(0)?,
          row.get(1)?,
          row.get(2)?,
          row.get(3)?,
          row.get(4)?,
          row.get(5)?,
          row.get(6)?,
          row.get(7)?,
          row.get(8)?,
        ))
      },
    )
    .map_err(|e| match e {
      rusqlite::Error::QueryReturnedNoRows => {
        AppError::NotFound("Account order was not found.".into())
      }
      other => other.into(),
    })?;

  if tx_id.as_deref().map(str::trim).is_some_and(|s| !s.is_empty()) {
    return Err(AppError::Validation(
      "This account order is already posted to the ledger.".into(),
    ));
  }
  let customer_id = customer_id.ok_or_else(|| {
    AppError::Validation("A customer is required to post an account order.".into())
  })?;

  let original_minor = money_from_major_units_allow_zero(&original_raw, places)?;
  if original_minor <= 0 {
    return Err(AppError::Validation(
      "Original amount must be greater than zero.".into(),
    ));
  }
  let purchase_cp = parse_percent_cp(&purchase_raw, "Purchase deduction percent")?;
  let deduction_minor = fee_from_amount(original_minor, purchase_cp);

  let customer_wallet_id = resolve_sole_customer_wallet(conn, &customer_id)?;
  let clearing_id = ensure_system_wallet(conn, CLEARING_WALLET_NAME)?;
  let fee_income_id = ensure_system_wallet(conn, FEE_INCOME_WALLET_NAME)?;
  let equity_id = ensure_system_wallet(conn, OPENING_EQUITY_WALLET_NAME)?;

  let entries = purchase_entries(
    &customer_wallet_id,
    &clearing_id,
    &equity_id,
    &fee_income_id,
    &code,
    original_minor,
    deduction_minor,
  );

  let posted = post_transaction_in_tx(
    conn,
    PostTransactionInput {
      reference: format!("AO-{order_number}"),
      r#type: "ACCOUNT_ORDER".into(),
      value_date: order_date,
      entries,
      customer_id: Some(customer_id),
      walk_in_name: None,
      walk_in_phone: None,
      description: Some(format!("Account order #{order_number} purchase — {name}")),
      created_by_id: Some(actor_id.to_string()),
    },
  )?;

  let now = now_sqlite();
  conn.execute(
    r#"UPDATE "AccountOrder" SET "transactionId" = ?1, "updatedAt" = ?2
       WHERE id = ?3 AND deletedAt IS NULL"#,
    params![posted.id, now, order_id],
  )?;
  Ok(posted.id)
}

// ─── API types ───────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountOrderTotals {
  pub purchase_deduction: String,
  pub net_purchase_amount: String,
  pub total_distributed: String,
  pub total_distribution_fees: String,
  pub remaining_amount: String,
  /// ΣF − D (kept for compatibility; `net_benefit` is an alias).
  pub net_profit: String,
  pub net_benefit: String,
  pub recipient_count: i64,
  pub pending_count: i64,
  pub completed_count: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountOrderListItem {
  pub id: String,
  pub order_number: i64,
  pub name: String,
  pub customer_id: Option<String>,
  pub customer_name: Option<String>,
  pub customer_code: Option<String>,
  pub currency_id: String,
  pub currency_code: String,
  pub currency_name: String,
  pub order_date: String,
  pub original_amount: String,
  pub purchase_deduction_percent: String,
  pub status: String,
  pub notes: Option<String>,
  /// Linked purchase posting; `None` = legacy tracking-only order.
  pub transaction_id: Option<String>,
  pub totals: AccountOrderTotals,
  pub created_at: String,
  pub updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountOrderRecipientRow {
  pub id: String,
  pub order_id: String,
  pub recipient_number: i64,
  pub customer_id: Option<String>,
  pub customer_name: Option<String>,
  pub customer_code: Option<String>,
  pub name: String,
  pub detail: Option<String>,
  pub recipient_date: String,
  pub amount: String,
  pub distribution_fee_percent: String,
  pub distribution_fee_amount: String,
  pub net_amount: String,
  pub status: String,
  pub notes: Option<String>,
  pub payout_transaction_id: Option<String>,
  pub created_at: String,
  pub updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountOrderDetail {
  pub id: String,
  pub order_number: i64,
  pub name: String,
  pub customer_id: Option<String>,
  pub customer_name: Option<String>,
  pub customer_code: Option<String>,
  pub currency_id: String,
  pub currency_code: String,
  pub currency_name: String,
  pub currency_decimal_places: i64,
  pub order_date: String,
  pub original_amount: String,
  pub purchase_deduction_percent: String,
  pub status: String,
  pub notes: Option<String>,
  pub transaction_id: Option<String>,
  pub totals: AccountOrderTotals,
  pub recipients: Vec<AccountOrderRecipientRow>,
  pub created_by_name: Option<String>,
  pub created_at: String,
  pub updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountOrderPage {
  pub items: Vec<AccountOrderListItem>,
  pub total: i64,
  pub page: i64,
  pub page_size: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListAccountOrdersInput {
  pub page: Option<i64>,
  pub page_size: Option<i64>,
  pub search: Option<String>,
  pub customer_id: Option<String>,
  pub status: Option<String>,
  pub date_from: Option<String>,
  pub date_to: Option<String>,
  pub currency_code: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAccountOrderInput {
  pub name: String,
  /// Required for new orders (the purchase credits this customer's wallet).
  pub customer_id: Option<String>,
  pub currency_code: String,
  pub order_date: String,
  pub original_amount: String,
  pub purchase_deduction_percent: Option<String>,
  pub notes: Option<String>,
  pub status: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAccountOrderInput {
  pub id: String,
  pub name: Option<String>,
  pub customer_id: Option<String>,
  pub clear_customer: Option<bool>,
  pub currency_code: Option<String>,
  pub order_date: Option<String>,
  pub original_amount: Option<String>,
  pub purchase_deduction_percent: Option<String>,
  pub notes: Option<String>,
  pub status: Option<String>,
}

/// Create a customer inline while adding a recipient.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountOrderNewCustomerInput {
  #[serde(default)]
  pub full_name: String,
  #[serde(default)]
  pub phone: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertAccountOrderRecipientInput {
  pub id: Option<String>,
  pub order_id: String,
  /// Existing customer. Takes precedence over `new_customer`.
  pub customer_id: Option<String>,
  pub new_customer: Option<AccountOrderNewCustomerInput>,
  /// Display name; defaults to the customer's full name.
  pub name: Option<String>,
  pub detail: Option<String>,
  pub recipient_date: String,
  pub amount: String,
  pub distribution_fee_percent: Option<String>,
  pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetRecipientStatusInput {
  pub id: String,
  pub status: String,
}

fn compute_totals(
  places: i64,
  original_minor: i128,
  purchase_deduction_cp: i128,
  recipients: &[(i128, i128, &str)],
) -> Result<AccountOrderTotals, AppError> {
  let purchase_deduction = fee_from_amount(original_minor, purchase_deduction_cp);
  let net_purchase = original_minor.saturating_sub(purchase_deduction);
  let mut total_distributed = 0_i128;
  let mut total_fees = 0_i128;
  let mut pending = 0_i64;
  let mut completed = 0_i64;
  for (amount, fee_cp, status) in recipients {
    total_distributed = total_distributed.saturating_add(*amount);
    total_fees = total_fees.saturating_add(fee_from_amount(*amount, *fee_cp));
    match status.to_ascii_uppercase().as_str() {
      "COMPLETED" => completed += 1,
      _ => pending += 1,
    }
  }
  // Remaining is measured against the original amount (not the net purchase).
  let remaining = original_minor.saturating_sub(total_distributed);
  let net_profit = total_fees.saturating_sub(purchase_deduction);
  // May be negative when purchase deduction exceeds collected fees.
  let net_profit_s = signed_balance_to_display(net_profit, places)?;
  Ok(AccountOrderTotals {
    purchase_deduction: money_to_major_unit_string(purchase_deduction, places)?,
    net_purchase_amount: money_to_major_unit_string(net_purchase, places)?,
    total_distributed: money_to_major_unit_string(total_distributed, places)?,
    total_distribution_fees: money_to_major_unit_string(total_fees, places)?,
    remaining_amount: money_to_major_unit_string(remaining, places)?,
    net_benefit: net_profit_s.clone(),
    net_profit: net_profit_s,
    recipient_count: recipients.len() as i64,
    pending_count: pending,
    completed_count: completed,
  })
}

fn load_recipient_math(
  conn: &Connection,
  order_id: &str,
  places: i64,
) -> Result<Vec<(i128, i128, String)>, AppError> {
  let mut stmt = conn.prepare(
    r#"SELECT CAST("amount" AS TEXT), CAST("distributionFeePercent" AS TEXT), "status"
       FROM "AccountOrderRecipient"
       WHERE "orderId" = ?1 AND deletedAt IS NULL
       ORDER BY "recipientNumber" ASC"#,
  )?;
  let rows = stmt.query_map([order_id], |row| {
    Ok((
      row.get::<_, String>(0)?,
      row.get::<_, String>(1)?,
      row.get::<_, String>(2)?,
    ))
  })?;
  let mut out = Vec::new();
  for r in rows {
    let (amount_raw, fee_raw, status) = r?;
    let amount = money_from_major_units_allow_zero(&amount_raw, places)?;
    let fee_cp = parse_percent_cp(&fee_raw, "Distribution fee percent")?;
    out.push((amount, fee_cp, status));
  }
  Ok(out)
}

fn map_list_item(conn: &Connection, order_id: &str) -> Result<AccountOrderListItem, AppError> {
  let row = conn
    .query_row(
      r#"SELECT
         o.id, o."orderNumber", o.name, o."customerId",
         c."fullName", c.code,
         o."currencyId", cur.code, cur.name, cur."decimalPlaces",
         o."orderDate",
         CAST(o."originalAmount" AS TEXT),
         CAST(o."purchaseDeductionPercent" AS TEXT),
         o.status, o.notes, o."createdAt", o."updatedAt", o."transactionId"
       FROM "AccountOrder" o
       JOIN "Currency" cur ON cur.id = o."currencyId"
       LEFT JOIN "Customer" c ON c.id = o."customerId"
       WHERE o.id = ?1 AND o.deletedAt IS NULL"#,
      [order_id],
      |row| {
        Ok((
          row.get::<_, String>(0)?,
          row.get::<_, i64>(1)?,
          row.get::<_, String>(2)?,
          row.get::<_, Option<String>>(3)?,
          row.get::<_, Option<String>>(4)?,
          row.get::<_, Option<String>>(5)?,
          row.get::<_, String>(6)?,
          row.get::<_, String>(7)?,
          row.get::<_, String>(8)?,
          row.get::<_, i64>(9)?,
          row.get::<_, String>(10)?,
          row.get::<_, String>(11)?,
          row.get::<_, String>(12)?,
          row.get::<_, String>(13)?,
          row.get::<_, Option<String>>(14)?,
          row.get::<_, String>(15)?,
          row.get::<_, String>(16)?,
          row.get::<_, Option<String>>(17)?,
        ))
      },
    )
    .map_err(|e| match e {
      rusqlite::Error::QueryReturnedNoRows => {
        AppError::NotFound("Account order was not found.".into())
      }
      other => other.into(),
    })?;

  let (
    id,
    order_number,
    name,
    customer_id,
    customer_name,
    customer_code,
    currency_id,
    currency_code,
    currency_name,
    places,
    order_date,
    original_amount,
    purchase_deduction_percent,
    status,
    notes,
    created_at,
    updated_at,
    transaction_id,
  ) = row;

  let original_minor = money_from_major_units_allow_zero(&original_amount, places)?;
  let purchase_cp = parse_percent_cp(&purchase_deduction_percent, "Purchase deduction percent")?;
  let recip = load_recipient_math(conn, &id, places)?;
  let recip_refs: Vec<(i128, i128, &str)> = recip
    .iter()
    .map(|(a, f, s)| (*a, *f, s.as_str()))
    .collect();
  let totals = compute_totals(places, original_minor, purchase_cp, &recip_refs)?;

  Ok(AccountOrderListItem {
    id,
    order_number,
    name,
    customer_id,
    customer_name,
    customer_code,
    currency_id,
    currency_code,
    currency_name,
    order_date,
    original_amount,
    purchase_deduction_percent: percent_cp_to_string(purchase_cp)?,
    status,
    notes,
    transaction_id,
    totals,
    created_at,
    updated_at,
  })
}

fn map_detail(conn: &Connection, order_id: &str) -> Result<AccountOrderDetail, AppError> {
  let list = map_list_item(conn, order_id)?;
  let places: i64 = conn.query_row(
    r#"SELECT cur."decimalPlaces"
       FROM "AccountOrder" o
       JOIN "Currency" cur ON cur.id = o."currencyId"
       WHERE o.id = ?1"#,
    [order_id],
    |row| row.get(0),
  )?;
  let created_by_name: Option<String> = conn
    .query_row(
      r#"SELECT u."fullName"
         FROM "AccountOrder" o
         LEFT JOIN "User" u ON u.id = o."createdById"
         WHERE o.id = ?1"#,
      [order_id],
      |row| row.get(0),
    )
    .optional()?
    .flatten();

  let mut stmt = conn.prepare(
    r#"SELECT r.id, r."orderId", r."recipientNumber", r.name, r.detail, r."recipientDate",
              CAST(r.amount AS TEXT), CAST(r."distributionFeePercent" AS TEXT),
              r.status, r.notes, r."createdAt", r."updatedAt",
              r."customerId", c."fullName", c.code, r."payoutTransactionId"
       FROM "AccountOrderRecipient" r
       LEFT JOIN "Customer" c ON c.id = r."customerId"
       WHERE r."orderId" = ?1 AND r.deletedAt IS NULL
       ORDER BY r."recipientNumber" ASC"#,
  )?;
  let rows = stmt.query_map([order_id], |row| {
    Ok((
      row.get::<_, String>(0)?,
      row.get::<_, String>(1)?,
      row.get::<_, i64>(2)?,
      row.get::<_, String>(3)?,
      row.get::<_, Option<String>>(4)?,
      row.get::<_, String>(5)?,
      row.get::<_, String>(6)?,
      row.get::<_, String>(7)?,
      row.get::<_, String>(8)?,
      row.get::<_, Option<String>>(9)?,
      row.get::<_, String>(10)?,
      row.get::<_, String>(11)?,
      row.get::<_, Option<String>>(12)?,
      row.get::<_, Option<String>>(13)?,
      row.get::<_, Option<String>>(14)?,
      row.get::<_, Option<String>>(15)?,
    ))
  })?;

  let mut recipients = Vec::new();
  for r in rows {
    let (
      id,
      order_id,
      recipient_number,
      name,
      detail,
      recipient_date,
      amount_raw,
      fee_raw,
      status,
      notes,
      created_at,
      updated_at,
      customer_id,
      customer_name,
      customer_code,
      payout_transaction_id,
    ) = r?;
    let amount_minor = money_from_major_units_allow_zero(&amount_raw, places)?;
    let fee_cp = parse_percent_cp(&fee_raw, "Distribution fee percent")?;
    let fee_minor = fee_from_amount(amount_minor, fee_cp);
    let net_minor = amount_minor.saturating_sub(fee_minor);
    recipients.push(AccountOrderRecipientRow {
      id,
      order_id,
      recipient_number,
      customer_id,
      customer_name,
      customer_code,
      name,
      detail,
      recipient_date,
      amount: money_to_major_unit_string(amount_minor, places)?,
      distribution_fee_percent: percent_cp_to_string(fee_cp)?,
      distribution_fee_amount: money_to_major_unit_string(fee_minor, places)?,
      net_amount: money_to_major_unit_string(net_minor, places)?,
      status,
      notes,
      payout_transaction_id,
      created_at,
      updated_at,
    });
  }

  Ok(AccountOrderDetail {
    id: list.id,
    order_number: list.order_number,
    name: list.name,
    customer_id: list.customer_id,
    customer_name: list.customer_name,
    customer_code: list.customer_code,
    currency_id: list.currency_id,
    currency_code: list.currency_code,
    currency_name: list.currency_name,
    currency_decimal_places: places,
    order_date: list.order_date,
    original_amount: list.original_amount,
    purchase_deduction_percent: list.purchase_deduction_percent,
    status: list.status,
    notes: list.notes,
    transaction_id: list.transaction_id,
    totals: list.totals,
    recipients,
    created_by_name,
    created_at: list.created_at,
    updated_at: list.updated_at,
  })
}

// ─── Customer helper ─────────────────────────────────────────────────────────

/// Create a minimal customer + CUSTOMER wallet (mirrors `customers_write` without opening kata).
fn create_customer_for_recipient(
  conn: &Connection,
  full_name: &str,
  phone: &str,
) -> Result<String, AppError> {
  let full_name = require_nonempty(full_name, "New customer full name")?;
  let phone = require_nonempty(phone, "New customer phone")?;

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
  let mut account_number = String::new();
  let mut last_err: Option<AppError> = None;
  for _ in 0..5 {
    let code = allocate_next_account_number(conn)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_sqlite();
    match conn.execute(
      "INSERT INTO Customer (
         id, code, fullName, phone, customerType,
         isActive, deletedAt, createdAt, updatedAt
       ) VALUES (?1, ?2, ?3, ?4, 'PERMANENT', 1, NULL, ?5, ?5)",
      params![id, code, full_name, phone, now],
    ) {
      Ok(_) => {
        customer_id = id;
        account_number = code;
        last_err = None;
        break;
      }
      Err(e) => {
        if e.to_string().to_lowercase().contains("unique") {
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
    return Err(last_err.unwrap_or_else(|| AppError::Internal("Failed to create customer.".into())));
  }

  let wallet_id = uuid::Uuid::new_v4().to_string();
  let now = now_sqlite();
  conn.execute(
    "INSERT INTO Wallet (id, name, type, customerId, userId, isActive, deletedAt, createdAt, updatedAt, code)
     VALUES (?1, ?2, 'CUSTOMER', ?3, NULL, 1, NULL, ?4, ?4, ?5)",
    params![
      wallet_id,
      format!("{full_name} Wallet"),
      customer_id,
      now,
      account_number
    ],
  )?;
  Ok(customer_id)
}

// ─── Queries (commands) ──────────────────────────────────────────────────────

#[tauri::command]
pub fn list_account_orders(
  state: State<'_, AppState>,
  input: ListAccountOrdersInput,
) -> Result<AccountOrderPage, AppError> {
  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, SCREEN)?;

  let page = input.page.unwrap_or(1).max(1);
  let page_size = input.page_size.unwrap_or(25).clamp(1, 200);
  let offset = (page - 1) * page_size;

  let search = trim_opt(input.search).map(|s| s.to_lowercase());
  let customer_id = trim_opt(input.customer_id);
  let status = trim_opt(input.status)
    .map(|s| normalize_status(&s, ORDER_STATUSES, "Status"))
    .transpose()?;
  let date_from = trim_opt(input.date_from);
  let date_to = trim_opt(input.date_to);
  let currency_code = trim_opt(input.currency_code).map(|s| s.to_ascii_uppercase());

  let mut where_sql = String::from(r#"o.deletedAt IS NULL"#);
  let mut bind: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

  if let Some(ref q) = search {
    where_sql.push_str(
      r#" AND (
        LOWER(o.name) LIKE ?1
        OR CAST(o."orderNumber" AS TEXT) LIKE ?1
        OR LOWER(COALESCE(c."fullName", '')) LIKE ?1
        OR LOWER(COALESCE(c.code, '')) LIKE ?1
        OR LOWER(o.status) LIKE ?1
      )"#,
    );
    bind.push(Box::new(format!("%{q}%")));
  }
  if let Some(ref cid) = customer_id {
    let idx = bind.len() + 1;
    where_sql.push_str(&format!(r#" AND o."customerId" = ?{idx}"#));
    bind.push(Box::new(cid.clone()));
  }
  if let Some(ref st) = status {
    let idx = bind.len() + 1;
    where_sql.push_str(&format!(r#" AND o.status = ?{idx}"#));
    bind.push(Box::new(st.clone()));
  }
  if let Some(ref from) = date_from {
    let idx = bind.len() + 1;
    where_sql.push_str(&format!(r#" AND date(o."orderDate") >= date(?{idx})"#));
    bind.push(Box::new(from.clone()));
  }
  if let Some(ref to) = date_to {
    let idx = bind.len() + 1;
    where_sql.push_str(&format!(r#" AND date(o."orderDate") <= date(?{idx})"#));
    bind.push(Box::new(to.clone()));
  }
  if let Some(ref code) = currency_code {
    let idx = bind.len() + 1;
    where_sql.push_str(&format!(r#" AND cur.code = ?{idx}"#));
    bind.push(Box::new(code.clone()));
  }

  let count_sql = format!(
    r#"SELECT COUNT(*)
       FROM "AccountOrder" o
       JOIN "Currency" cur ON cur.id = o."currencyId"
       LEFT JOIN "Customer" c ON c.id = o."customerId"
       WHERE {where_sql}"#
  );
  let total: i64 = {
    let mut stmt = conn.prepare(&count_sql)?;
    let params_ref: Vec<&dyn rusqlite::types::ToSql> = bind.iter().map(|b| b.as_ref()).collect();
    stmt.query_row(params_ref.as_slice(), |row| row.get(0))?
  };

  let list_sql = format!(
    r#"SELECT o.id
       FROM "AccountOrder" o
       JOIN "Currency" cur ON cur.id = o."currencyId"
       LEFT JOIN "Customer" c ON c.id = o."customerId"
       WHERE {where_sql}
       ORDER BY o."orderDate" DESC, o."orderNumber" DESC
       LIMIT ?{} OFFSET ?{}"#,
    bind.len() + 1,
    bind.len() + 2
  );
  bind.push(Box::new(page_size));
  bind.push(Box::new(offset));

  let ids: Vec<String> = {
    let mut stmt = conn.prepare(&list_sql)?;
    let params_ref: Vec<&dyn rusqlite::types::ToSql> = bind.iter().map(|b| b.as_ref()).collect();
    let rows = stmt.query_map(params_ref.as_slice(), |row| row.get(0))?;
    let mut out = Vec::new();
    for r in rows {
      out.push(r?);
    }
    out
  };

  let mut items = Vec::with_capacity(ids.len());
  for id in ids {
    items.push(map_list_item(&conn, &id)?);
  }

  Ok(AccountOrderPage {
    items,
    total,
    page,
    page_size,
  })
}

#[tauri::command]
pub fn get_account_order(
  state: State<'_, AppState>,
  id: String,
) -> Result<AccountOrderDetail, AppError> {
  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, SCREEN)?;
  let id = require_nonempty(&id, "Order id")?;
  ensure_order_exists(&conn, &id)?;
  map_detail(&conn, &id)
}

// ─── Create ──────────────────────────────────────────────────────────────────

pub(crate) fn create_account_order_inner(
  conn: &Connection,
  actor_id: &str,
  input: CreateAccountOrderInput,
) -> Result<AccountOrderDetail, AppError> {
  let name = require_nonempty(&input.name, "Order name")?;
  let order_date = require_nonempty(&input.order_date, "Order date")?;
  let customer_id = trim_opt(input.customer_id).ok_or_else(|| {
    AppError::Validation("Customer is required for an account order.".into())
  })?;
  let (currency_id, _code, places) = find_currency_by_code(conn, &input.currency_code)?;
  let original_minor = money_from_major_units_allow_zero(input.original_amount.trim(), places)?;
  if original_minor <= 0 {
    return Err(AppError::Validation(
      "Original amount must be greater than zero.".into(),
    ));
  }
  let purchase_cp = parse_percent_cp(
    input.purchase_deduction_percent.as_deref().unwrap_or("0"),
    "Purchase deduction percent",
  )?;
  let status = normalize_status(
    input.status.as_deref().unwrap_or("OPEN"),
    ORDER_STATUSES,
    "Status",
  )?;
  let notes = trim_opt(input.notes);
  let original_s = money_to_major_unit_string(original_minor, places)?;
  let purchase_s = percent_cp_to_string(purchase_cp)?;

  let id = run_in_immediate_tx(conn, |conn| {
    ensure_customer_exists(conn, &customer_id)?;
    let id = uuid::Uuid::new_v4().to_string();
    let order_number = next_order_number(conn)?;
    let now = now_sqlite();
    conn.execute(
      r#"INSERT INTO "AccountOrder" (
           id, "orderNumber", name, "customerId", "currencyId", "orderDate",
           "originalAmount", "purchaseDeductionPercent", status, notes,
           "transactionId", "createdById", deletedAt, "createdAt", "updatedAt"
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, NULL, ?11, NULL, ?12, ?12)"#,
      params![
        id,
        order_number,
        name,
        customer_id,
        currency_id,
        order_date,
        original_s,
        purchase_s,
        status,
        notes,
        actor_id,
        now,
      ],
    )?;
    post_purchase_for_order(conn, &id, actor_id)?;
    Ok(id)
  })?;

  map_detail(conn, &id)
}

#[tauri::command]
pub fn create_account_order(
  state: State<'_, AppState>,
  input: CreateAccountOrderInput,
) -> Result<AccountOrderDetail, AppError> {
  let conn = state.db.lock();
  let actor = require_screen_write(&state, &conn, SCREEN)?;
  create_account_order_inner(&conn, &actor.id, input)
}

// ─── Update ──────────────────────────────────────────────────────────────────

pub(crate) fn update_account_order_inner(
  conn: &Connection,
  actor_id: &str,
  input: UpdateAccountOrderInput,
) -> Result<AccountOrderDetail, AppError> {
  let id = require_nonempty(&input.id, "Order id")?;
  ensure_order_exists(conn, &id)?;
  let existing = map_detail(conn, &id)?;

  let name = input
    .name
    .as_deref()
    .map(|s| require_nonempty(s, "Order name"))
    .transpose()?
    .unwrap_or(existing.name.clone());
  let existing_date: String = existing.order_date.chars().take(10).collect();
  let order_date = input
    .order_date
    .as_deref()
    .map(|s| require_nonempty(s, "Order date"))
    .transpose()?
    .unwrap_or_else(|| existing_date.clone());

  let (currency_id, _code, places) = if let Some(ref code) = input.currency_code {
    find_currency_by_code(conn, code)?
  } else {
    (
      existing.currency_id.clone(),
      existing.currency_code.clone(),
      existing.currency_decimal_places,
    )
  };

  let existing_original_minor =
    money_from_major_units_allow_zero(&existing.original_amount, existing.currency_decimal_places)?;
  let original_minor = if let Some(ref amt) = input.original_amount {
    let m = money_from_major_units_allow_zero(amt.trim(), places)?;
    if m <= 0 {
      return Err(AppError::Validation(
        "Original amount must be greater than zero.".into(),
      ));
    }
    m
  } else if currency_id == existing.currency_id {
    existing_original_minor
  } else {
    money_from_major_units_allow_zero(&existing.original_amount, places)?
  };

  let (_, distributed_minor, _) = load_order_amounts(conn, &id, None)?;
  if distributed_minor > original_minor {
    return Err(AppError::Validation(
      "Original amount cannot be less than total distributed.".into(),
    ));
  }

  let existing_purchase_cp = parse_percent_cp(
    &existing.purchase_deduction_percent,
    "Purchase deduction percent",
  )?;
  let purchase_cp = if let Some(ref p) = input.purchase_deduction_percent {
    parse_percent_cp(p, "Purchase deduction percent")?
  } else {
    existing_purchase_cp
  };

  let status = if let Some(ref s) = input.status {
    normalize_status(s, ORDER_STATUSES, "Status")?
  } else {
    existing.status.clone()
  };

  let has_posting = existing
    .transaction_id
    .as_deref()
    .map(str::trim)
    .is_some_and(|s| !s.is_empty());

  let customer_id = if input.clear_customer.unwrap_or(false) {
    None
  } else if let Some(ref cid) = input.customer_id {
    let t = cid.trim();
    if t.is_empty() {
      None
    } else {
      ensure_customer_exists(conn, t)?;
      Some(t.to_string())
    }
  } else {
    existing.customer_id.clone()
  };
  if has_posting && customer_id.is_none() {
    return Err(AppError::Validation(
      "A posted account order must keep its customer.".into(),
    ));
  }

  let notes = if input.notes.is_some() {
    trim_opt(input.notes.clone())
  } else {
    existing.notes.clone()
  };

  // Only repost when something that affects the ledger changed — otherwise a rename
  // or note edit would void already-completed payouts.
  let ledger_changed = customer_id != existing.customer_id
    || currency_id != existing.currency_id
    || original_minor != existing_original_minor
    || purchase_cp != existing_purchase_cp
    || order_date.chars().take(10).collect::<String>() != existing_date;

  let old_tx_id = existing
    .transaction_id
    .clone()
    .filter(|s| !s.trim().is_empty());

  run_in_immediate_tx(conn, |conn| {
    let now = now_sqlite();
    let original_s = money_to_major_unit_string(original_minor, places)?;
    let purchase_s = percent_cp_to_string(purchase_cp)?;
    let n = conn.execute(
      r#"UPDATE "AccountOrder" SET
           name = ?1,
           "customerId" = ?2,
           "currencyId" = ?3,
           "orderDate" = ?4,
           "originalAmount" = ?5,
           "purchaseDeductionPercent" = ?6,
           status = ?7,
           notes = ?8,
           "updatedAt" = ?9
         WHERE id = ?10 AND deletedAt IS NULL"#,
      params![
        name,
        customer_id,
        currency_id,
        order_date,
        original_s,
        purchase_s,
        status,
        notes,
        now,
        id,
      ],
    )?;
    if n == 0 {
      return Err(AppError::NotFound("Account order was not found.".into()));
    }

    if let Some(ref old_tx) = old_tx_id {
      if ledger_changed {
        // Voids the purchase + any payouts (cascade resets recipients to PENDING).
        soft_delete_desk_transaction(conn, old_tx)?;
        post_purchase_for_order(conn, &id, actor_id)?;
      }
    }
    // Legacy tracking-only (no transactionId): fields only, never auto-post.
    Ok(())
  })?;

  map_detail(conn, &id)
}

#[tauri::command]
pub fn update_account_order(
  state: State<'_, AppState>,
  input: UpdateAccountOrderInput,
) -> Result<AccountOrderDetail, AppError> {
  let conn = state.db.lock();
  let actor = require_screen_write(&state, &conn, SCREEN)?;
  update_account_order_inner(&conn, &actor.id, input)
}

// ─── Archive ─────────────────────────────────────────────────────────────────

pub(crate) fn archive_account_order_inner(conn: &Connection, id: &str) -> Result<(), AppError> {
  let id = require_nonempty(id, "Order id")?;
  ensure_order_exists(conn, &id)?;

  run_in_immediate_tx(conn, |conn| {
    let tx_id: Option<String> = conn
      .query_row(
        r#"SELECT "transactionId" FROM "AccountOrder" WHERE id = ?1 AND deletedAt IS NULL"#,
        [&id],
        |row| row.get::<_, Option<String>>(0),
      )
      .optional()?
      .flatten()
      .filter(|s| !s.trim().is_empty());
    if let Some(tx) = tx_id {
      // Cascade also voids every recipient payout.
      soft_delete_desk_transaction(conn, &tx)?;
    }

    let now = now_sqlite();
    let n = conn.execute(
      r#"UPDATE "AccountOrder" SET deletedAt = ?1, "updatedAt" = ?1
         WHERE id = ?2 AND deletedAt IS NULL"#,
      params![now, id],
    )?;
    if n == 0 {
      return Err(AppError::NotFound("Account order was not found.".into()));
    }
    conn.execute(
      r#"UPDATE "AccountOrderRecipient" SET deletedAt = ?1, "updatedAt" = ?1
         WHERE "orderId" = ?2 AND deletedAt IS NULL"#,
      params![now, id],
    )?;
    Ok(())
  })
}

#[tauri::command]
pub fn archive_account_order(
  state: State<'_, AppState>,
  id: String,
) -> Result<(), AppError> {
  let conn = state.db.lock();
  let _actor = require_screen_write(&state, &conn, SCREEN)?;
  archive_account_order_inner(&conn, &id)
}

// ─── Recipients ──────────────────────────────────────────────────────────────

/// Returns `(order_id, recipient_id)`. Leaves recipient `PENDING` (payouts via complete / save).
pub(crate) fn upsert_account_order_recipient_inner(
  conn: &Connection,
  input: UpsertAccountOrderRecipientInput,
) -> Result<(String, String), AppError> {
  let order_id = require_nonempty(&input.order_id, "Order id")?;
  let recipient_date = require_nonempty(&input.recipient_date, "Recipient date")?;
  ensure_order_exists(conn, &order_id)?;
  let order_status: String = conn.query_row(
    r#"SELECT status FROM "AccountOrder" WHERE id = ?1 AND deletedAt IS NULL"#,
    [&order_id],
    |row| row.get(0),
  )?;
  if order_status.eq_ignore_ascii_case("CANCELLED") {
    return Err(AppError::Validation(
      "Cannot edit recipients on a cancelled order.".into(),
    ));
  }

  // Currency always comes from the order.
  let (original_minor, _, places) = load_order_amounts(conn, &order_id, None)?;
  let amount_minor = money_from_major_units_allow_zero(input.amount.trim(), places)?;
  if amount_minor <= 0 {
    return Err(AppError::Validation(
      "Recipient amount must be greater than zero.".into(),
    ));
  }
  let fee_cp = parse_percent_cp(
    input.distribution_fee_percent.as_deref().unwrap_or("0"),
    "Distribution fee percent",
  )?;
  let detail_text = trim_opt(input.detail);
  let notes = trim_opt(input.notes);
  let name_input = trim_opt(input.name);
  let customer_input = trim_opt(input.customer_id);
  let amount_s = money_to_major_unit_string(amount_minor, places)?;
  let fee_s = percent_cp_to_string(fee_cp)?;
  let recipient_id = trim_opt(input.id);

  let saved_recipient_id = run_in_immediate_tx(conn, |conn| {
    let now = now_sqlite();

    // Existing recipient state (edit path).
    let existing: Option<(Option<String>, String, Option<String>)> = match recipient_id {
      Some(ref rid) => {
        let row = conn
          .query_row(
            r#"SELECT "customerId", status, "payoutTransactionId"
               FROM "AccountOrderRecipient"
               WHERE id = ?1 AND "orderId" = ?2 AND deletedAt IS NULL"#,
            params![rid, order_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
          )
          .optional()?;
        match row {
          Some(r) => Some(r),
          None => return Err(AppError::NotFound("Recipient was not found.".into())),
        }
      }
      None => None,
    };

    let (_, distributed_minor, _) =
      load_order_amounts(conn, &order_id, recipient_id.as_deref())?;
    assert_distribution_fits(original_minor, distributed_minor, amount_minor)?;

    // Resolve customer: explicit id > new customer > existing recipient's customer.
    let customer_id: String = if let Some(cid) = customer_input {
      ensure_customer_exists(conn, &cid)?;
      cid
    } else if let Some(ref nc) = input.new_customer {
      create_customer_for_recipient(conn, &nc.full_name, &nc.phone)?
    } else if let Some(cid) = existing.as_ref().and_then(|(c, _, _)| c.clone()) {
      ensure_customer_exists(conn, &cid)?;
      cid
    } else {
      return Err(AppError::Validation(
        "Recipient customer is required: select a customer or provide a new customer name and phone."
          .into(),
      ));
    };

    let name = match name_input {
      Some(n) => n,
      None => conn.query_row(
        r#"SELECT "fullName" FROM "Customer" WHERE id = ?1"#,
        [&customer_id],
        |row| row.get::<_, String>(0),
      )?,
    };

    if let (Some(rid), Some((_, status, payout_tx))) = (recipient_id.as_ref(), existing.as_ref()) {
      // Editing a completed recipient voids its payout first.
      let payout_tx = payout_tx.clone().filter(|s| !s.trim().is_empty());
      if status.eq_ignore_ascii_case("COMPLETED") || payout_tx.is_some() {
        if let Some(ptx) = payout_tx {
          soft_delete_desk_transaction(conn, &ptx)?;
        }
      }
      let n = conn.execute(
        r#"UPDATE "AccountOrderRecipient" SET
             "customerId" = ?1,
             name = ?2,
             detail = ?3,
             "recipientDate" = ?4,
             amount = ?5,
             "distributionFeePercent" = ?6,
             status = 'PENDING',
             "payoutTransactionId" = NULL,
             notes = ?7,
             "updatedAt" = ?8
           WHERE id = ?9 AND "orderId" = ?10 AND deletedAt IS NULL"#,
        params![
          customer_id,
          name,
          detail_text,
          recipient_date,
          amount_s,
          fee_s,
          notes,
          now,
          rid,
          order_id,
        ],
      )?;
      if n == 0 {
        return Err(AppError::NotFound("Recipient was not found.".into()));
      }
      Ok(rid.clone())
    } else {
      let id = uuid::Uuid::new_v4().to_string();
      let recipient_number = next_recipient_number(conn)?;
      conn.execute(
        r#"INSERT INTO "AccountOrderRecipient" (
             id, "orderId", "recipientNumber", "customerId", name, detail, "recipientDate",
             amount, "distributionFeePercent", status, notes, "payoutTransactionId",
             deletedAt, "createdAt", "updatedAt"
           ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'PENDING', ?10, NULL, NULL, ?11, ?11)"#,
        params![
          id,
          order_id,
          recipient_number,
          customer_id,
          name,
          detail_text,
          recipient_date,
          amount_s,
          fee_s,
          notes,
          now,
        ],
      )?;
      Ok(id)
    }
  })?;

  Ok((order_id, saved_recipient_id))
}

/// Upsert then immediately complete (ledger payout, or status-only for legacy tracking orders).
pub(crate) fn save_account_order_recipient_inner(
  conn: &Connection,
  actor_id: &str,
  input: UpsertAccountOrderRecipientInput,
) -> Result<String, AppError> {
  let (order_id, recipient_id) = upsert_account_order_recipient_inner(conn, input)?;
  let order_tx: Option<String> = conn.query_row(
    r#"SELECT "transactionId" FROM "AccountOrder" WHERE id = ?1 AND deletedAt IS NULL"#,
    [&order_id],
    |row| row.get(0),
  )?;
  if order_tx
    .as_deref()
    .map(str::trim)
    .is_some_and(|s| !s.is_empty())
  {
    complete_account_order_recipient_inner(conn, actor_id, &recipient_id)?;
  } else {
    let now = now_sqlite();
    conn.execute(
      r#"UPDATE "AccountOrderRecipient"
         SET status = 'COMPLETED', "updatedAt" = ?1
         WHERE id = ?2 AND deletedAt IS NULL"#,
      params![now, recipient_id],
    )?;
  }
  Ok(order_id)
}

#[tauri::command]
pub fn upsert_account_order_recipient(
  state: State<'_, AppState>,
  input: UpsertAccountOrderRecipientInput,
) -> Result<AccountOrderDetail, AppError> {
  let conn = state.db.lock();
  let actor = require_screen_write(&state, &conn, SCREEN)?;
  let order_id = save_account_order_recipient_inner(&conn, &actor.id, input)?;
  map_detail(&conn, &order_id)
}

/// Post the cash payout for one recipient. Returns the order id.
pub(crate) fn complete_account_order_recipient_inner(
  conn: &Connection,
  actor_id: &str,
  recipient_id: &str,
) -> Result<String, AppError> {
  let recipient_id = require_nonempty(recipient_id, "Recipient id")?;

  run_in_immediate_tx(conn, |conn| {
    let (
      order_id,
      order_number,
      order_tx,
      order_status,
      recipient_number,
      customer_id,
      name,
      status,
      payout_tx,
      amount_raw,
      fee_raw,
      code,
      places,
    ): (
      String,
      i64,
      Option<String>,
      String,
      i64,
      Option<String>,
      String,
      String,
      Option<String>,
      String,
      String,
      String,
      i64,
    ) = conn
      .query_row(
        r#"SELECT o.id, o."orderNumber", o."transactionId", o.status,
                  r."recipientNumber", r."customerId", r.name, r.status,
                  r."payoutTransactionId",
                  CAST(r.amount AS TEXT), CAST(r."distributionFeePercent" AS TEXT),
                  cur.code, cur."decimalPlaces"
           FROM "AccountOrderRecipient" r
           JOIN "AccountOrder" o ON o.id = r."orderId" AND o.deletedAt IS NULL
           JOIN "Currency" cur ON cur.id = o."currencyId"
           WHERE r.id = ?1 AND r.deletedAt IS NULL"#,
        [&recipient_id],
        |row| {
          Ok((
            row.get(0)?,
            row.get(1)?,
            row.get(2)?,
            row.get(3)?,
            row.get(4)?,
            row.get(5)?,
            row.get(6)?,
            row.get(7)?,
            row.get(8)?,
            row.get(9)?,
            row.get(10)?,
            row.get(11)?,
            row.get(12)?,
          ))
        },
      )
      .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => {
          AppError::NotFound("Recipient was not found.".into())
        }
        other => other.into(),
      })?;

    let has_payout = payout_tx
      .as_deref()
      .map(str::trim)
      .is_some_and(|s| !s.is_empty());
    if has_payout || status.eq_ignore_ascii_case("COMPLETED") {
      return Err(AppError::Validation(
        "This recipient payout is already completed.".into(),
      ));
    }
    if order_status.eq_ignore_ascii_case("CANCELLED") {
      return Err(AppError::Validation(
        "Cannot complete a recipient on a cancelled order.".into(),
      ));
    }
    let order_has_tx = order_tx
      .as_deref()
      .map(str::trim)
      .is_some_and(|s| !s.is_empty());
    if !order_has_tx {
      return Err(AppError::Validation(
        "This order has no ledger purchase posting (legacy tracking-only); payout is not available."
          .into(),
      ));
    }

    let amount_minor = money_from_major_units_allow_zero(&amount_raw, places)?;
    if amount_minor <= 0 {
      return Err(AppError::Validation(
        "Recipient amount must be greater than zero.".into(),
      ));
    }
    let fee_cp = parse_percent_cp(&fee_raw, "Distribution fee percent")?;
    let fee_minor = fee_from_amount(amount_minor, fee_cp);

    let vault_id = resolve_shop_cash_wallet_id(conn, None)?;
    let clearing_id = ensure_system_wallet(conn, CLEARING_WALLET_NAME)?;
    let fee_income_id = ensure_system_wallet(conn, FEE_INCOME_WALLET_NAME)?;
    let equity_id = ensure_system_wallet(conn, OPENING_EQUITY_WALLET_NAME)?;

    let entries = payout_entries(
      &clearing_id,
      &vault_id,
      &fee_income_id,
      &equity_id,
      &code,
      amount_minor,
      fee_minor,
    );

    let now = now_sqlite();
    let posted = post_transaction_in_tx(
      conn,
      PostTransactionInput {
        reference: format!("AO-{order_number}-R{recipient_number}"),
        r#type: "ACCOUNT_ORDER".into(),
        value_date: now.clone(),
        entries,
        customer_id,
        walk_in_name: None,
        walk_in_phone: None,
        description: Some(format!(
          "Account order #{order_number} payout to {name} (R{recipient_number})"
        )),
        created_by_id: Some(actor_id.to_string()),
      },
    )?;

    let updated = conn.execute(
      r#"UPDATE "AccountOrderRecipient"
         SET status = 'COMPLETED', "payoutTransactionId" = ?1, "updatedAt" = ?2
         WHERE id = ?3 AND deletedAt IS NULL
           AND UPPER(status) = 'PENDING'
           AND IFNULL("payoutTransactionId", '') = ''"#,
      params![posted.id, now, recipient_id],
    )?;
    if updated != 1 {
      return Err(AppError::Validation(
        "This recipient payout is already completed.".into(),
      ));
    }
    Ok(order_id)
  })
}

#[tauri::command]
pub fn complete_account_order_recipient(
  state: State<'_, AppState>,
  id: String,
) -> Result<AccountOrderDetail, AppError> {
  let conn = state.db.lock();
  let actor = require_screen_write(&state, &conn, SCREEN)?;
  let order_id = complete_account_order_recipient_inner(&conn, &actor.id, &id)?;
  map_detail(&conn, &order_id)
}

/// Compatibility shim: COMPLETED posts the payout; PENDING voids an existing payout.
pub(crate) fn set_account_order_recipient_status_inner(
  conn: &Connection,
  actor_id: &str,
  input: SetRecipientStatusInput,
) -> Result<String, AppError> {
  let id = require_nonempty(&input.id, "Recipient id")?;
  let status = normalize_status(&input.status, RECIPIENT_STATUSES, "Recipient status")?;
  if status == "COMPLETED" {
    return complete_account_order_recipient_inner(conn, actor_id, &id);
  }

  run_in_immediate_tx(conn, |conn| {
    let (order_id, payout_tx): (String, Option<String>) = conn
      .query_row(
        r#"SELECT "orderId", "payoutTransactionId" FROM "AccountOrderRecipient"
           WHERE id = ?1 AND deletedAt IS NULL"#,
        [&id],
        |row| Ok((row.get(0)?, row.get(1)?)),
      )
      .map_err(|_| AppError::NotFound("Recipient was not found.".into()))?;
    if let Some(ptx) = payout_tx.filter(|s| !s.trim().is_empty()) {
      soft_delete_desk_transaction(conn, &ptx)?;
    }
    let now = now_sqlite();
    conn.execute(
      r#"UPDATE "AccountOrderRecipient"
         SET status = 'PENDING', "payoutTransactionId" = NULL, "updatedAt" = ?1
         WHERE id = ?2 AND deletedAt IS NULL"#,
      params![now, id],
    )?;
    Ok(order_id)
  })
}

#[tauri::command]
pub fn set_account_order_recipient_status(
  state: State<'_, AppState>,
  input: SetRecipientStatusInput,
) -> Result<AccountOrderDetail, AppError> {
  let conn = state.db.lock();
  let actor = require_screen_write(&state, &conn, SCREEN)?;
  let order_id = set_account_order_recipient_status_inner(&conn, &actor.id, input)?;
  map_detail(&conn, &order_id)
}

pub(crate) fn delete_account_order_recipient_inner(
  conn: &Connection,
  id: &str,
) -> Result<String, AppError> {
  let id = require_nonempty(id, "Recipient id")?;
  run_in_immediate_tx(conn, |conn| {
    let (order_id, payout_tx): (String, Option<String>) = conn
      .query_row(
        r#"SELECT "orderId", "payoutTransactionId" FROM "AccountOrderRecipient"
           WHERE id = ?1 AND deletedAt IS NULL"#,
        [&id],
        |row| Ok((row.get(0)?, row.get(1)?)),
      )
      .map_err(|_| AppError::NotFound("Recipient was not found.".into()))?;
    if let Some(ptx) = payout_tx.filter(|s| !s.trim().is_empty()) {
      soft_delete_desk_transaction(conn, &ptx)?;
    }
    let now = now_sqlite();
    conn.execute(
      r#"UPDATE "AccountOrderRecipient"
         SET deletedAt = ?1, "updatedAt" = ?1, "payoutTransactionId" = NULL
         WHERE id = ?2 AND deletedAt IS NULL"#,
      params![now, id],
    )?;
    Ok(order_id)
  })
}

#[tauri::command]
pub fn delete_account_order_recipient(
  state: State<'_, AppState>,
  id: String,
) -> Result<AccountOrderDetail, AppError> {
  let conn = state.db.lock();
  let _actor = require_screen_write(&state, &conn, SCREEN)?;
  let order_id = delete_account_order_recipient_inner(&conn, &id)?;
  map_detail(&conn, &order_id)
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::ledger::{ensure_account_number_schema, ensure_display_seq_schema, ensure_wallet_balance_cache};

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
          code TEXT,
          isActive INTEGER NOT NULL DEFAULT 1,
          deletedAt TEXT,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        );
        CREATE TABLE Customer (
          id TEXT PRIMARY KEY,
          code TEXT,
          fullName TEXT NOT NULL,
          fatherName TEXT,
          phone TEXT,
          address TEXT,
          nationalId TEXT,
          notes TEXT,
          customerType TEXT NOT NULL DEFAULT 'PERMANENT',
          isActive INTEGER NOT NULL DEFAULT 1,
          deletedAt TEXT,
          createdAt TEXT,
          updatedAt TEXT
        );
        CREATE TABLE User (
          id TEXT PRIMARY KEY,
          fullName TEXT,
          isActive INTEGER NOT NULL DEFAULT 1
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
        CREATE TABLE "AccountOrder" (
          id TEXT PRIMARY KEY,
          orderNumber INTEGER NOT NULL UNIQUE,
          name TEXT NOT NULL,
          customerId TEXT,
          currencyId TEXT NOT NULL,
          orderDate DATETIME NOT NULL,
          originalAmount DECIMAL NOT NULL,
          purchaseDeductionPercent DECIMAL NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'OPEN',
          notes TEXT,
          transactionId TEXT,
          createdById TEXT,
          deletedAt DATETIME,
          createdAt DATETIME NOT NULL,
          updatedAt DATETIME NOT NULL
        );
        CREATE TABLE "AccountOrderRecipient" (
          id TEXT PRIMARY KEY,
          orderId TEXT NOT NULL,
          recipientNumber INTEGER NOT NULL UNIQUE,
          customerId TEXT,
          name TEXT NOT NULL,
          detail TEXT,
          recipientDate DATETIME NOT NULL,
          amount DECIMAL NOT NULL,
          distributionFeePercent DECIMAL NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'PENDING',
          notes TEXT,
          payoutTransactionId TEXT,
          deletedAt DATETIME,
          createdAt DATETIME NOT NULL,
          updatedAt DATETIME NOT NULL
        );
        "#,
      )
      .unwrap();
    ensure_wallet_balance_cache(&conn).unwrap();
    ensure_display_seq_schema(&conn).unwrap();
    let now = now_sqlite();
    conn
      .execute(
        "INSERT INTO Currency (id, code, name, decimalPlaces, isActive)
         VALUES ('c1','AFN','Afghani',0,1)",
        [],
      )
      .unwrap();
    conn
      .execute("INSERT INTO User (id, fullName, isActive) VALUES ('u1','Admin',1)", [])
      .unwrap();
    conn
      .execute(
        "INSERT INTO Wallet (id, name, type, customerId, isActive, deletedAt, createdAt, updatedAt, code)
         VALUES ('cash','Main Vault','VAULT',NULL,1,NULL,?1,?1,'1')",
        [&now],
      )
      .unwrap();
    for (cid, code, name, phone) in [
      ("cust-1", "2", "Customer One", "0700000001"),
      ("cust-2", "3", "Customer Two", "0700000002"),
    ] {
      conn
        .execute(
          "INSERT INTO Customer (id, code, fullName, phone, isActive, deletedAt, createdAt, updatedAt)
           VALUES (?1, ?2, ?3, ?4, 1, NULL, ?5, ?5)",
          params![cid, code, name, phone, now],
        )
        .unwrap();
      conn
        .execute(
          "INSERT INTO Wallet (id, name, type, customerId, isActive, deletedAt, createdAt, updatedAt, code)
           VALUES (?1, ?2, 'CUSTOMER', ?3, 1, NULL, ?4, ?4, ?5)",
          params![format!("w-{cid}"), name, cid, now, code],
        )
        .unwrap();
    }
    ensure_account_number_schema(&conn).unwrap();
    conn
  }

  /// Net DEBIT − CREDIT for an active-transaction wallet (AFN, 0 decimal places).
  fn net(conn: &Connection, wallet_name: &str) -> i64 {
    conn
      .query_row(
        r#"SELECT CAST(COALESCE(SUM(
             CASE WHEN le.direction = 'DEBIT' THEN CAST(le.amount AS INTEGER)
                  ELSE -CAST(le.amount AS INTEGER) END), 0) AS INTEGER)
           FROM LedgerEntry le
           JOIN "Transaction" tx ON tx.id = le.transactionId AND tx.deletedAt IS NULL
           JOIN Wallet w ON w.id = le.walletId
           WHERE w.name = ?1"#,
        [wallet_name],
        |row| row.get(0),
      )
      .unwrap()
  }

  fn tx_balance(conn: &Connection, tx_id: &str) -> (i64, i64, i64) {
    let debit: i64 = conn
      .query_row(
        "SELECT CAST(COALESCE(SUM(CAST(amount AS INTEGER)),0) AS INTEGER) FROM LedgerEntry
         WHERE transactionId = ?1 AND direction = 'DEBIT'",
        [tx_id],
        |row| row.get(0),
      )
      .unwrap();
    let credit: i64 = conn
      .query_row(
        "SELECT CAST(COALESCE(SUM(CAST(amount AS INTEGER)),0) AS INTEGER) FROM LedgerEntry
         WHERE transactionId = ?1 AND direction = 'CREDIT'",
        [tx_id],
        |row| row.get(0),
      )
      .unwrap();
    let lines: i64 = conn
      .query_row(
        "SELECT COUNT(*) FROM LedgerEntry WHERE transactionId = ?1",
        [tx_id],
        |row| row.get(0),
      )
      .unwrap();
    (debit, credit, lines)
  }

  fn assert_all_balanced(conn: &Connection) {
    let total: i64 = conn
      .query_row(
        r#"SELECT CAST(COALESCE(SUM(
             CASE WHEN le.direction = 'DEBIT' THEN CAST(le.amount AS INTEGER)
                  ELSE -CAST(le.amount AS INTEGER) END), 0) AS INTEGER)
           FROM LedgerEntry le
           JOIN "Transaction" tx ON tx.id = le.transactionId AND tx.deletedAt IS NULL"#,
        [],
        |row| row.get(0),
      )
      .unwrap();
    assert_eq!(total, 0, "active ledger must net to zero");
  }

  fn create_input(amount: &str, deduction: &str) -> CreateAccountOrderInput {
    CreateAccountOrderInput {
      name: "Test order".into(),
      customer_id: Some("cust-1".into()),
      currency_code: "AFN".into(),
      order_date: "2026-10-16".into(),
      original_amount: amount.into(),
      purchase_deduction_percent: Some(deduction.into()),
      notes: None,
      status: None,
    }
  }

  fn recipient_input(order_id: &str, amount: &str, fee_pct: &str) -> UpsertAccountOrderRecipientInput {
    UpsertAccountOrderRecipientInput {
      id: None,
      order_id: order_id.into(),
      customer_id: Some("cust-2".into()),
      new_customer: None,
      name: None,
      detail: None,
      recipient_date: "2026-10-16".into(),
      amount: amount.into(),
      distribution_fee_percent: Some(fee_pct.into()),
      notes: None,
    }
  }

  fn err_text(r: Result<impl std::fmt::Debug, AppError>) -> String {
    r.expect_err("expected error").to_string()
  }

  fn first_recipient_id(detail: &AccountOrderDetail) -> String {
    detail.recipients[0].id.clone()
  }

  #[test]
  fn fee_calc_rounds_half_up() {
    assert_eq!(parse_percent_cp("2.90", "x").unwrap(), 290);
    assert_eq!(fee_from_amount(1000, 290), 29);
    assert_eq!(fee_from_amount(1000, 0), 0);
    // 0.5% of 1 minor unit = 0.005 → rounds down to 0.
    assert_eq!(fee_from_amount(1, 50), 0);
    assert_eq!(fee_from_amount(100, 5000), 50);
    assert_eq!(fee_from_amount(3, 5000), 2);
  }

  #[test]
  fn totals_use_original_for_remaining_and_net_profit_is_fees_minus_deduction() {
    let conn = setup();
    let order = create_account_order_inner(&conn, "u1", create_input("1000", "3")).unwrap();
    let oid = order.id.clone();
    upsert_account_order_recipient_inner(&conn, recipient_input(&oid, "400", "5")).unwrap();
    let d = map_detail(&conn, &oid).unwrap();
    assert_eq!(d.totals.purchase_deduction, "30");
    assert_eq!(d.totals.net_purchase_amount, "970");
    assert_eq!(d.totals.total_distributed, "400");
    assert_eq!(d.totals.remaining_amount, "600");
    assert_eq!(d.totals.total_distribution_fees, "20");
    assert_eq!(d.totals.net_profit, "-10");
    assert_eq!(d.totals.net_benefit, "-10");
    assert_eq!(d.recipients[0].net_amount, "380");
    assert_eq!(d.recipients[0].status, "PENDING");
  }

  #[test]
  fn create_requires_customer() {
    let conn = setup();
    let mut input = create_input("1000", "0");
    input.customer_id = None;
    let msg = err_text(create_account_order_inner(&conn, "u1", input));
    assert!(msg.contains("Customer is required"), "{msg}");
    let n: i64 = conn
      .query_row(r#"SELECT COUNT(*) FROM "AccountOrder""#, [], |r| r.get(0))
      .unwrap();
    assert_eq!(n, 0);
  }

  #[test]
  fn purchase_posts_balanced_entries() {
    let conn = setup();
    let order = create_account_order_inner(&conn, "u1", create_input("1000", "3")).unwrap();
    let tx_id = order.transaction_id.clone().expect("transactionId stored");

    let reference: String = conn
      .query_row(
        r#"SELECT reference FROM "Transaction" WHERE id = ?1"#,
        [&tx_id],
        |r| r.get(0),
      )
      .unwrap();
    assert_eq!(reference, format!("AO-{}", order.order_number));
    let ty: String = conn
      .query_row(r#"SELECT type FROM "Transaction" WHERE id = ?1"#, [&tx_id], |r| r.get(0))
      .unwrap();
    assert_eq!(ty, "ACCOUNT_ORDER");

    let (debit, credit, lines) = tx_balance(&conn, &tx_id);
    assert_eq!((debit, credit, lines), (1030, 1030, 4));
    assert_eq!(net(&conn, "Customer One"), -1000);
    assert_eq!(net(&conn, CLEARING_WALLET_NAME), 1000);
    assert_eq!(net(&conn, OPENING_EQUITY_WALLET_NAME), 30);
    assert_eq!(net(&conn, FEE_INCOME_WALLET_NAME), -30);
    assert_all_balanced(&conn);
  }

  #[test]
  fn purchase_without_deduction_omits_fee_legs() {
    let conn = setup();
    let order = create_account_order_inner(&conn, "u1", create_input("500", "0")).unwrap();
    let tx_id = order.transaction_id.unwrap();
    let (debit, credit, lines) = tx_balance(&conn, &tx_id);
    assert_eq!((debit, credit, lines), (500, 500, 2));
    assert_eq!(net(&conn, FEE_INCOME_WALLET_NAME), 0);
    assert_eq!(net(&conn, OPENING_EQUITY_WALLET_NAME), 0);
  }

  #[test]
  fn save_recipient_auto_completes_payout() {
    let conn = setup();
    let order = create_account_order_inner(&conn, "u1", create_input("1000", "3")).unwrap();
    let oid = save_account_order_recipient_inner(
      &conn,
      "u1",
      recipient_input(&order.id, "400", "5"),
    )
    .unwrap();
    let d = map_detail(&conn, &oid).unwrap();
    assert_eq!(d.recipients[0].status, "COMPLETED");
    assert!(d.recipients[0].payout_transaction_id.is_some());
    assert_eq!(net(&conn, "Main Vault"), -380);
    assert_all_balanced(&conn);
  }

  #[test]
  fn payout_posts_balanced_entries_and_completes() {
    let conn = setup();
    let order = create_account_order_inner(&conn, "u1", create_input("1000", "3")).unwrap();
    let oid = order.id.clone();
    let after = upsert_account_order_recipient_inner(&conn, recipient_input(&oid, "400", "5"))
      .and_then(|(id, _)| map_detail(&conn, &id))
      .unwrap();
    // Raw upsert leaves PENDING (save_ / command auto-completes).
    assert_eq!(after.recipients[0].status, "PENDING");
    assert!(after.recipients[0].payout_transaction_id.is_none());
    assert_eq!(net(&conn, "Main Vault"), 0);

    let rid = first_recipient_id(&after);
    let oid2 = complete_account_order_recipient_inner(&conn, "u1", &rid).unwrap();
    assert_eq!(oid2, oid);
    let done = map_detail(&conn, &oid).unwrap();
    let r = &done.recipients[0];
    assert_eq!(r.status, "COMPLETED");
    let ptx = r.payout_transaction_id.clone().expect("payout tx stored");

    let reference: String = conn
      .query_row(
        r#"SELECT reference FROM "Transaction" WHERE id = ?1"#,
        [&ptx],
        |row| row.get(0),
      )
      .unwrap();
    assert_eq!(
      reference,
      format!("AO-{}-R{}", order.order_number, r.recipient_number)
    );
    // A=400, F=20, N=380 → debit A+N+F = 800 ; credits 400+380+20 = 800
    let (debit, credit, lines) = tx_balance(&conn, &ptx);
    assert_eq!((debit, credit, lines), (800, 800, 4));
    assert_eq!(net(&conn, "Main Vault"), -380);
    assert_eq!(net(&conn, CLEARING_WALLET_NAME), 600);
    assert_eq!(net(&conn, FEE_INCOME_WALLET_NAME), -50);
    assert_eq!(net(&conn, OPENING_EQUITY_WALLET_NAME), 830);
    assert_all_balanced(&conn);
  }

  #[test]
  fn payout_without_fee_omits_fee_leg() {
    let conn = setup();
    let order = create_account_order_inner(&conn, "u1", create_input("1000", "0")).unwrap();
    upsert_account_order_recipient_inner(&conn, recipient_input(&order.id, "250", "0")).unwrap();
    let d = map_detail(&conn, &order.id).unwrap();
    complete_account_order_recipient_inner(&conn, "u1", &first_recipient_id(&d)).unwrap();
    let d = map_detail(&conn, &order.id).unwrap();
    let ptx = d.recipients[0].payout_transaction_id.clone().unwrap();
    let (debit, credit, lines) = tx_balance(&conn, &ptx);
    assert_eq!((debit, credit, lines), (500, 500, 3)); // 2A = 500
    assert_eq!(net(&conn, "Main Vault"), -250);
    assert_all_balanced(&conn);
  }

  #[test]
  fn over_distribution_rejected() {
    let conn = setup();
    let order = create_account_order_inner(&conn, "u1", create_input("1000", "0")).unwrap();
    let oid = order.id.clone();
    upsert_account_order_recipient_inner(&conn, recipient_input(&oid, "600", "0")).unwrap();
    let msg = err_text(upsert_account_order_recipient_inner(
      &conn,
      recipient_input(&oid, "500", "0"),
    ));
    assert!(msg.contains("exceeds"), "{msg}");

    // Exactly the remaining amount is fine.
    upsert_account_order_recipient_inner(&conn, recipient_input(&oid, "400", "0")).unwrap();

    // Editing an existing recipient above the cap is rejected too.
    let d = map_detail(&conn, &oid).unwrap();
    let mut edit = recipient_input(&oid, "700", "0");
    edit.id = Some(first_recipient_id(&d));
    let msg = err_text(upsert_account_order_recipient_inner(&conn, edit));
    assert!(msg.contains("exceeds"), "{msg}");
  }

  #[test]
  fn complete_retry_rejected() {
    let conn = setup();
    let order = create_account_order_inner(&conn, "u1", create_input("1000", "0")).unwrap();
    upsert_account_order_recipient_inner(&conn, recipient_input(&order.id, "300", "2")).unwrap();
    let d = map_detail(&conn, &order.id).unwrap();
    let rid = first_recipient_id(&d);
    complete_account_order_recipient_inner(&conn, "u1", &rid).unwrap();
    let vault_after_first = net(&conn, "Main Vault");

    let msg = err_text(complete_account_order_recipient_inner(&conn, "u1", &rid));
    assert!(msg.contains("already completed"), "{msg}");
    assert_eq!(net(&conn, "Main Vault"), vault_after_first, "no double payout");
    assert_all_balanced(&conn);
  }

  #[test]
  fn recipient_requires_customer() {
    let conn = setup();
    let order = create_account_order_inner(&conn, "u1", create_input("1000", "0")).unwrap();
    let mut input = recipient_input(&order.id, "100", "0");
    input.customer_id = None;
    input.name = Some("Walk-in".into());
    let msg = err_text(upsert_account_order_recipient_inner(&conn, input));
    assert!(msg.contains("customer is required"), "{msg}");
  }

  #[test]
  fn new_customer_created_and_phone_duplicate_rejected() {
    let conn = setup();
    let order = create_account_order_inner(&conn, "u1", create_input("1000", "0")).unwrap();

    let mut input = recipient_input(&order.id, "100", "0");
    input.customer_id = None;
    input.new_customer = Some(AccountOrderNewCustomerInput {
      full_name: "Fresh Person".into(),
      phone: "0799999999".into(),
    });
    upsert_account_order_recipient_inner(&conn, input).unwrap();
    let d = map_detail(&conn, &order.id).unwrap();
    assert_eq!(d.recipients[0].name, "Fresh Person");
    let new_cid = d.recipients[0].customer_id.clone().unwrap();
    let wallets: i64 = conn
      .query_row(
        "SELECT COUNT(*) FROM Wallet WHERE customerId = ?1 AND type = 'CUSTOMER'",
        [&new_cid],
        |r| r.get(0),
      )
      .unwrap();
    assert_eq!(wallets, 1);

    let mut dup = recipient_input(&order.id, "100", "0");
    dup.customer_id = None;
    dup.new_customer = Some(AccountOrderNewCustomerInput {
      full_name: "Other".into(),
      phone: "0799999999".into(),
    });
    let msg = err_text(upsert_account_order_recipient_inner(&conn, dup));
    assert!(msg.contains("phone"), "{msg}");

    let mut missing = recipient_input(&order.id, "100", "0");
    missing.customer_id = None;
    missing.new_customer = Some(AccountOrderNewCustomerInput {
      full_name: "No Phone".into(),
      phone: "  ".into(),
    });
    assert!(upsert_account_order_recipient_inner(&conn, missing).is_err());
    // Failed attempts must leave only the one good recipient.
    let d = map_detail(&conn, &order.id).unwrap();
    assert_eq!(d.recipients.len(), 1);
  }

  #[test]
  fn editing_completed_recipient_voids_payout() {
    let conn = setup();
    let order = create_account_order_inner(&conn, "u1", create_input("1000", "0")).unwrap();
    upsert_account_order_recipient_inner(&conn, recipient_input(&order.id, "400", "5")).unwrap();
    let d = map_detail(&conn, &order.id).unwrap();
    let rid = first_recipient_id(&d);
    complete_account_order_recipient_inner(&conn, "u1", &rid).unwrap();
    assert_eq!(net(&conn, "Main Vault"), -380);

    let mut edit = recipient_input(&order.id, "300", "0");
    edit.id = Some(rid.clone());
    upsert_account_order_recipient_inner(&conn, edit).unwrap();
    let d = map_detail(&conn, &order.id).unwrap();
    assert_eq!(d.recipients[0].status, "PENDING");
    assert!(d.recipients[0].payout_transaction_id.is_none());
    assert_eq!(net(&conn, "Main Vault"), 0);
    assert_eq!(net(&conn, CLEARING_WALLET_NAME), 1000);
    assert_all_balanced(&conn);

    // Can be completed again after edit.
    complete_account_order_recipient_inner(&conn, "u1", &rid).unwrap();
    assert_eq!(net(&conn, "Main Vault"), -300);
    assert_all_balanced(&conn);
  }

  #[test]
  fn update_reposts_purchase_and_voids_payouts() {
    let conn = setup();
    let order = create_account_order_inner(&conn, "u1", create_input("1000", "3")).unwrap();
    upsert_account_order_recipient_inner(&conn, recipient_input(&order.id, "400", "5")).unwrap();
    let d = map_detail(&conn, &order.id).unwrap();
    complete_account_order_recipient_inner(&conn, "u1", &first_recipient_id(&d)).unwrap();
    let old_tx = map_detail(&conn, &order.id).unwrap().transaction_id.unwrap();

    // Name-only edit must NOT void anything.
    update_account_order_inner(
      &conn,
      "u1",
      UpdateAccountOrderInput {
        id: order.id.clone(),
        name: Some("Renamed".into()),
        customer_id: None,
        clear_customer: None,
        currency_code: None,
        order_date: None,
        original_amount: None,
        purchase_deduction_percent: None,
        notes: None,
        status: None,
      },
    )
    .unwrap();
    let d = map_detail(&conn, &order.id).unwrap();
    assert_eq!(d.transaction_id.as_deref(), Some(old_tx.as_str()));
    assert_eq!(d.recipients[0].status, "COMPLETED");

    // Amount change reposts purchase and resets payouts.
    let d = update_account_order_inner(
      &conn,
      "u1",
      UpdateAccountOrderInput {
        id: order.id.clone(),
        name: None,
        customer_id: None,
        clear_customer: None,
        currency_code: None,
        order_date: None,
        original_amount: Some("2000".into()),
        purchase_deduction_percent: None,
        notes: None,
        status: None,
      },
    )
    .unwrap();
    let new_tx = d.transaction_id.clone().expect("reposted");
    assert_ne!(new_tx, old_tx);
    assert_eq!(d.recipients[0].status, "PENDING");
    assert!(d.recipients[0].payout_transaction_id.is_none());
    assert_eq!(net(&conn, "Customer One"), -2000);
    assert_eq!(net(&conn, CLEARING_WALLET_NAME), 2000);
    assert_eq!(net(&conn, OPENING_EQUITY_WALLET_NAME), 60);
    assert_eq!(net(&conn, FEE_INCOME_WALLET_NAME), -60);
    assert_eq!(net(&conn, "Main Vault"), 0);
    assert_all_balanced(&conn);
  }

  #[test]
  fn update_legacy_order_does_not_auto_post() {
    let conn = setup();
    let now = now_sqlite();
    conn
      .execute(
        r#"INSERT INTO "AccountOrder" (id, orderNumber, name, customerId, currencyId, orderDate,
             originalAmount, purchaseDeductionPercent, status, transactionId, createdAt, updatedAt)
           VALUES ('legacy', 1, 'Legacy', NULL, 'c1', '2026-01-01', '800', '0', 'OPEN', NULL, ?1, ?1)"#,
        [&now],
      )
      .unwrap();
    let d = update_account_order_inner(
      &conn,
      "u1",
      UpdateAccountOrderInput {
        id: "legacy".into(),
        name: Some("Legacy edited".into()),
        customer_id: Some("cust-1".into()),
        clear_customer: None,
        currency_code: None,
        order_date: None,
        original_amount: Some("900".into()),
        purchase_deduction_percent: None,
        notes: None,
        status: None,
      },
    )
    .unwrap();
    assert!(d.transaction_id.is_none());
    assert_eq!(d.original_amount, "900");
    let txs: i64 = conn
      .query_row(r#"SELECT COUNT(*) FROM "Transaction""#, [], |r| r.get(0))
      .unwrap();
    assert_eq!(txs, 0);

    // Legacy: save marks COMPLETED without posting; raw complete still blocked.
    save_account_order_recipient_inner(
      &conn,
      "u1",
      recipient_input("legacy", "100", "0"),
    )
    .unwrap();
    let d = map_detail(&conn, "legacy").unwrap();
    assert_eq!(d.recipients[0].status, "COMPLETED");
    assert!(d.recipients[0].payout_transaction_id.is_none());
    let txs: i64 = conn
      .query_row(r#"SELECT COUNT(*) FROM "Transaction""#, [], |r| r.get(0))
      .unwrap();
    assert_eq!(txs, 0);
  }

  #[test]
  fn archive_voids_purchase_and_payouts() {
    let conn = setup();
    let order = create_account_order_inner(&conn, "u1", create_input("1000", "3")).unwrap();
    upsert_account_order_recipient_inner(&conn, recipient_input(&order.id, "400", "5")).unwrap();
    let d = map_detail(&conn, &order.id).unwrap();
    complete_account_order_recipient_inner(&conn, "u1", &first_recipient_id(&d)).unwrap();

    archive_account_order_inner(&conn, &order.id).unwrap();
    for w in [
      "Customer One",
      "Main Vault",
      CLEARING_WALLET_NAME,
      FEE_INCOME_WALLET_NAME,
      OPENING_EQUITY_WALLET_NAME,
    ] {
      assert_eq!(net(&conn, w), 0, "{w} should be zero after archive");
    }
    let msg = err_text(map_detail(&conn, &order.id));
    assert!(msg.contains("not found"), "{msg}");
  }

  #[test]
  fn delete_completed_recipient_voids_payout() {
    let conn = setup();
    let order = create_account_order_inner(&conn, "u1", create_input("1000", "0")).unwrap();
    upsert_account_order_recipient_inner(&conn, recipient_input(&order.id, "400", "0")).unwrap();
    let d = map_detail(&conn, &order.id).unwrap();
    let rid = first_recipient_id(&d);
    complete_account_order_recipient_inner(&conn, "u1", &rid).unwrap();
    assert_eq!(net(&conn, "Main Vault"), -400);
    delete_account_order_recipient_inner(&conn, &rid).unwrap();
    assert_eq!(net(&conn, "Main Vault"), 0);
    assert_all_balanced(&conn);
  }

  #[test]
  fn pure_entry_builders_balance() {
    for (o, d) in [(1000_i128, 30_i128), (1000, 0), (7, 1)] {
      let lines = purchase_entries("w", "c", "e", "f", "AFN", o, d);
      let (mut dr, mut cr) = (0_i128, 0_i128);
      for l in &lines {
        let a: i128 = l.amount_minor.parse().unwrap();
        if l.direction == "DEBIT" { dr += a } else { cr += a }
      }
      assert_eq!(dr, cr);
    }
    for (a, f) in [(400_i128, 20_i128), (400, 0), (400, 400), (1, 1)] {
      let lines = payout_entries("c", "v", "f", "e", "AFN", a, f);
      let (mut dr, mut cr) = (0_i128, 0_i128);
      for l in &lines {
        let x: i128 = l.amount_minor.parse().unwrap();
        if l.direction == "DEBIT" { dr += x } else { cr += x }
      }
      assert_eq!(dr, cr, "A={a} F={f}");
    }
  }
}
