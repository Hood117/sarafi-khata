//! Account Orders — bulk remittance distribution documents.
//! Tracking only: no ledger posts and no customer-balance changes.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::commands::authorize::{require_screen, require_screen_write};
use crate::error::AppError;
use crate::ledger::{
  find_currency_by_code, money_from_major_units_allow_zero, money_to_major_unit_string,
  signed_balance_to_display,
};
use crate::state::AppState;
use crate::util::{now_sqlite, require_nonempty, trim_opt};

const SCREEN: &str = "accountOrders";
const ORDER_STATUSES: &[&str] = &["OPEN", "COMPLETED", "CANCELLED"];
const RECIPIENT_STATUSES: &[&str] = &["PENDING", "COMPLETED"];

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

fn load_order_amounts(
  conn: &Connection,
  order_id: &str,
  exclude_recipient_id: Option<&str>,
) -> Result<(i128, i128, i64), AppError> {
  // DECIMAL has NUMERIC affinity — whole amounts may be stored as INTEGER/REAL.
  // Always CAST AS TEXT (same pattern as trading/exchange/ledger reads).
  let (original_raw, currency_id): (String, String) = conn.query_row(
    r#"SELECT CAST("originalAmount" AS TEXT), "currencyId" FROM "AccountOrder"
       WHERE id = ?1 AND deletedAt IS NULL"#,
    [order_id],
    |row| Ok((row.get(0)?, row.get(1)?)),
  )?;
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountOrderTotals {
  pub purchase_deduction: String,
  pub net_purchase_amount: String,
  pub total_distributed: String,
  pub total_distribution_fees: String,
  pub remaining_amount: String,
  pub net_profit: String,
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
  pub name: String,
  pub detail: Option<String>,
  pub recipient_date: String,
  pub amount: String,
  pub distribution_fee_percent: String,
  pub distribution_fee_amount: String,
  pub net_amount: String,
  pub status: String,
  pub notes: Option<String>,
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertAccountOrderRecipientInput {
  pub id: Option<String>,
  pub order_id: String,
  pub name: String,
  pub detail: Option<String>,
  pub recipient_date: String,
  pub amount: String,
  pub distribution_fee_percent: Option<String>,
  pub status: Option<String>,
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
  let remaining = original_minor.saturating_sub(total_distributed);
  let net_profit = total_fees.saturating_sub(purchase_deduction);
  Ok(AccountOrderTotals {
    purchase_deduction: money_to_major_unit_string(purchase_deduction, places)?,
    net_purchase_amount: money_to_major_unit_string(net_purchase, places)?,
    total_distributed: money_to_major_unit_string(total_distributed, places)?,
    total_distribution_fees: money_to_major_unit_string(total_fees, places)?,
    remaining_amount: money_to_major_unit_string(remaining, places)?,
    // May be negative when purchase deduction exceeds collected fees.
    net_profit: signed_balance_to_display(net_profit, places)?,
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
  let row = conn.query_row(
    r#"SELECT
         o.id, o."orderNumber", o.name, o."customerId",
         c."fullName", c.code,
         o."currencyId", cur.code, cur.name, cur."decimalPlaces",
         o."orderDate",
         CAST(o."originalAmount" AS TEXT),
         CAST(o."purchaseDeductionPercent" AS TEXT),
         o.status, o.notes, o."createdAt", o."updatedAt"
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
      ))
    },
  )?;

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
    r#"SELECT id, "orderId", "recipientNumber", name, detail, "recipientDate",
              CAST(amount AS TEXT), CAST("distributionFeePercent" AS TEXT),
              status, notes, "createdAt", "updatedAt"
       FROM "AccountOrderRecipient"
       WHERE "orderId" = ?1 AND deletedAt IS NULL
       ORDER BY "recipientNumber" ASC"#,
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
    ) = r?;
    let amount_minor = money_from_major_units_allow_zero(&amount_raw, places)?;
    let fee_cp = parse_percent_cp(&fee_raw, "Distribution fee percent")?;
    let fee_minor = fee_from_amount(amount_minor, fee_cp);
    let net_minor = amount_minor.saturating_sub(fee_minor);
    recipients.push(AccountOrderRecipientRow {
      id,
      order_id,
      recipient_number,
      name,
      detail,
      recipient_date,
      amount: money_to_major_unit_string(amount_minor, places)?,
      distribution_fee_percent: percent_cp_to_string(fee_cp)?,
      distribution_fee_amount: money_to_major_unit_string(fee_minor, places)?,
      net_amount: money_to_major_unit_string(net_minor, places)?,
      status,
      notes,
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
    totals: list.totals,
    recipients,
    created_by_name,
    created_at: list.created_at,
    updated_at: list.updated_at,
  })
}

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
  let exists: Option<i64> = conn
    .query_row(
      r#"SELECT 1 FROM "AccountOrder" WHERE id = ?1 AND deletedAt IS NULL"#,
      [&id],
      |row| row.get(0),
    )
    .optional()?;
  if exists.is_none() {
    return Err(AppError::NotFound("Account order was not found.".into()));
  }
  map_detail(&conn, &id)
}

#[tauri::command]
pub fn create_account_order(
  state: State<'_, AppState>,
  input: CreateAccountOrderInput,
) -> Result<AccountOrderDetail, AppError> {
  let conn = state.db.lock();
  let actor = require_screen_write(&state, &conn, SCREEN)?;

  let name = require_nonempty(&input.name, "Order name")?;
  let order_date = require_nonempty(&input.order_date, "Order date")?;
  let (currency_id, _code, places) = find_currency_by_code(&conn, &input.currency_code)?;
  let original_minor = money_from_major_units_allow_zero(input.original_amount.trim(), places)?;
  if original_minor <= 0 {
    return Err(AppError::Validation(
      "Original amount must be greater than zero.".into(),
    ));
  }
  let purchase_cp = parse_percent_cp(
    input
      .purchase_deduction_percent
      .as_deref()
      .unwrap_or("0"),
    "Purchase deduction percent",
  )?;
  let status = normalize_status(
    input.status.as_deref().unwrap_or("OPEN"),
    ORDER_STATUSES,
    "Status",
  )?;
  let customer_id = trim_opt(input.customer_id);
  if let Some(ref cid) = customer_id {
    ensure_customer_exists(&conn, cid)?;
  }
  let notes = trim_opt(input.notes);
  let id = uuid::Uuid::new_v4().to_string();
  let order_number = next_order_number(&conn)?;
  let now = now_sqlite();
  let original_s = money_to_major_unit_string(original_minor, places)?;
  let purchase_s = percent_cp_to_string(purchase_cp)?;

  conn.execute(
    r#"INSERT INTO "AccountOrder" (
         id, "orderNumber", name, "customerId", "currencyId", "orderDate",
         "originalAmount", "purchaseDeductionPercent", status, notes,
         "createdById", deletedAt, "createdAt", "updatedAt"
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, NULL, ?12, ?12)"#,
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
      actor.id,
      now,
    ],
  )?;

  map_detail(&conn, &id)
}

#[tauri::command]
pub fn update_account_order(
  state: State<'_, AppState>,
  input: UpdateAccountOrderInput,
) -> Result<AccountOrderDetail, AppError> {
  let conn = state.db.lock();
  let _actor = require_screen_write(&state, &conn, SCREEN)?;

  let id = require_nonempty(&input.id, "Order id")?;
  let existing = map_detail(&conn, &id)?;

  let name = input
    .name
    .as_deref()
    .map(|s| require_nonempty(s, "Order name"))
    .transpose()?
    .unwrap_or(existing.name.clone());
  let order_date = input
    .order_date
    .as_deref()
    .map(|s| require_nonempty(s, "Order date"))
    .transpose()?
    .unwrap_or_else(|| existing.order_date.chars().take(10).collect());

  let (currency_id, _code, places) = if let Some(ref code) = input.currency_code {
    find_currency_by_code(&conn, code)?
  } else {
    (
      existing.currency_id.clone(),
      existing.currency_code.clone(),
      existing.currency_decimal_places,
    )
  };

  let original_minor = if let Some(ref amt) = input.original_amount {
    let m = money_from_major_units_allow_zero(amt.trim(), places)?;
    if m <= 0 {
      return Err(AppError::Validation(
        "Original amount must be greater than zero.".into(),
      ));
    }
    m
  } else {
    money_from_major_units_allow_zero(&existing.original_amount, places)?
  };

  let (_, distributed_minor, _) = load_order_amounts(&conn, &id, None)?;
  if distributed_minor > original_minor {
    return Err(AppError::Validation(
      "Original amount cannot be less than total distributed.".into(),
    ));
  }

  let purchase_cp = if let Some(ref p) = input.purchase_deduction_percent {
    parse_percent_cp(p, "Purchase deduction percent")?
  } else {
    parse_percent_cp(
      &existing.purchase_deduction_percent,
      "Purchase deduction percent",
    )?
  };

  let status = if let Some(ref s) = input.status {
    normalize_status(s, ORDER_STATUSES, "Status")?
  } else {
    existing.status.clone()
  };

  let customer_id = if input.clear_customer.unwrap_or(false) {
    None
  } else if let Some(ref cid) = input.customer_id {
    let t = cid.trim();
    if t.is_empty() {
      None
    } else {
      ensure_customer_exists(&conn, t)?;
      Some(t.to_string())
    }
  } else {
    existing.customer_id.clone()
  };

  let notes = if input.notes.is_some() {
    trim_opt(input.notes.clone())
  } else {
    existing.notes.clone()
  };

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

  map_detail(&conn, &id)
}

#[tauri::command]
pub fn archive_account_order(
  state: State<'_, AppState>,
  id: String,
) -> Result<(), AppError> {
  let conn = state.db.lock();
  let _actor = require_screen_write(&state, &conn, SCREEN)?;
  let id = require_nonempty(&id, "Order id")?;
  let now = now_sqlite();
  let n = conn.execute(
    r#"UPDATE "AccountOrder" SET deletedAt = ?1, "updatedAt" = ?1
       WHERE id = ?2 AND deletedAt IS NULL"#,
    params![now, id],
  )?;
  if n == 0 {
    return Err(AppError::NotFound("Account order was not found.".into()));
  }
  // Soft-delete recipients with the order for consistency.
  conn.execute(
    r#"UPDATE "AccountOrderRecipient" SET deletedAt = ?1, "updatedAt" = ?1
       WHERE "orderId" = ?2 AND deletedAt IS NULL"#,
    params![now, id],
  )?;
  Ok(())
}

#[tauri::command]
pub fn upsert_account_order_recipient(
  state: State<'_, AppState>,
  input: UpsertAccountOrderRecipientInput,
) -> Result<AccountOrderDetail, AppError> {
  let conn = state.db.lock();
  let _actor = require_screen_write(&state, &conn, SCREEN)?;

  let order_id = require_nonempty(&input.order_id, "Order id")?;
  let name = require_nonempty(&input.name, "Recipient name")?;
  let recipient_date = require_nonempty(&input.recipient_date, "Recipient date")?;
  let detail = map_detail(&conn, &order_id)?;
  if detail.status.eq_ignore_ascii_case("CANCELLED") {
    return Err(AppError::Validation(
      "Cannot edit recipients on a cancelled order.".into(),
    ));
  }

  let places = detail.currency_decimal_places;
  let amount_minor = money_from_major_units_allow_zero(input.amount.trim(), places)?;
  if amount_minor <= 0 {
    return Err(AppError::Validation(
      "Recipient amount must be greater than zero.".into(),
    ));
  }
  let fee_cp = parse_percent_cp(
    input
      .distribution_fee_percent
      .as_deref()
      .unwrap_or("0"),
    "Distribution fee percent",
  )?;
  // Recipients are completed as soon as they are saved — no pending step.
  let status = normalize_status(
    input.status.as_deref().unwrap_or("COMPLETED"),
    RECIPIENT_STATUSES,
    "Recipient status",
  )?;
  let detail_text = trim_opt(input.detail);
  let notes = trim_opt(input.notes);
  let now = now_sqlite();
  let amount_s = money_to_major_unit_string(amount_minor, places)?;
  let fee_s = percent_cp_to_string(fee_cp)?;

  if let Some(ref rid) = input.id {
    let rid = require_nonempty(rid, "Recipient id")?;
    let (original_minor, distributed_minor, _) =
      load_order_amounts(&conn, &order_id, Some(&rid))?;
    assert_distribution_fits(original_minor, distributed_minor, amount_minor)?;

    let n = conn.execute(
      r#"UPDATE "AccountOrderRecipient" SET
           name = ?1,
           detail = ?2,
           "recipientDate" = ?3,
           amount = ?4,
           "distributionFeePercent" = ?5,
           status = ?6,
           notes = ?7,
           "updatedAt" = ?8
         WHERE id = ?9 AND "orderId" = ?10 AND deletedAt IS NULL"#,
      params![
        name,
        detail_text,
        recipient_date,
        amount_s,
        fee_s,
        status,
        notes,
        now,
        rid,
        order_id,
      ],
    )?;
    if n == 0 {
      return Err(AppError::NotFound("Recipient was not found.".into()));
    }
  } else {
    let (original_minor, distributed_minor, _) = load_order_amounts(&conn, &order_id, None)?;
    assert_distribution_fits(original_minor, distributed_minor, amount_minor)?;
    let id = uuid::Uuid::new_v4().to_string();
    let recipient_number = next_recipient_number(&conn)?;
    conn.execute(
      r#"INSERT INTO "AccountOrderRecipient" (
           id, "orderId", "recipientNumber", name, detail, "recipientDate",
           amount, "distributionFeePercent", status, notes,
           deletedAt, "createdAt", "updatedAt"
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, NULL, ?11, ?11)"#,
      params![
        id,
        order_id,
        recipient_number,
        name,
        detail_text,
        recipient_date,
        amount_s,
        fee_s,
        status,
        notes,
        now,
      ],
    )?;
  }

  map_detail(&conn, &order_id)
}

#[tauri::command]
pub fn set_account_order_recipient_status(
  state: State<'_, AppState>,
  input: SetRecipientStatusInput,
) -> Result<AccountOrderDetail, AppError> {
  let conn = state.db.lock();
  let _actor = require_screen_write(&state, &conn, SCREEN)?;
  let id = require_nonempty(&input.id, "Recipient id")?;
  let status = normalize_status(&input.status, RECIPIENT_STATUSES, "Recipient status")?;
  let now = now_sqlite();

  let order_id: String = conn
    .query_row(
      r#"SELECT "orderId" FROM "AccountOrderRecipient"
         WHERE id = ?1 AND deletedAt IS NULL"#,
      [&id],
      |row| row.get(0),
    )
    .map_err(|_| AppError::NotFound("Recipient was not found.".into()))?;

  conn.execute(
    r#"UPDATE "AccountOrderRecipient" SET status = ?1, "updatedAt" = ?2
       WHERE id = ?3 AND deletedAt IS NULL"#,
    params![status, now, id],
  )?;

  map_detail(&conn, &order_id)
}

#[tauri::command]
pub fn delete_account_order_recipient(
  state: State<'_, AppState>,
  id: String,
) -> Result<AccountOrderDetail, AppError> {
  let conn = state.db.lock();
  let _actor = require_screen_write(&state, &conn, SCREEN)?;
  let id = require_nonempty(&id, "Recipient id")?;
  let now = now_sqlite();

  let order_id: String = conn
    .query_row(
      r#"SELECT "orderId" FROM "AccountOrderRecipient"
         WHERE id = ?1 AND deletedAt IS NULL"#,
      [&id],
      |row| row.get(0),
    )
    .map_err(|_| AppError::NotFound("Recipient was not found.".into()))?;

  conn.execute(
    r#"UPDATE "AccountOrderRecipient" SET deletedAt = ?1, "updatedAt" = ?1
       WHERE id = ?2 AND deletedAt IS NULL"#,
    params![now, id],
  )?;

  map_detail(&conn, &order_id)
}
