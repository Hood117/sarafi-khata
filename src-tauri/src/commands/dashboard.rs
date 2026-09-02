//! Desk dashboard snapshot — SQL aggregates + recent lists (read-only).

use chrono::{Datelike, Local, NaiveDate};
use serde::Serialize;
use tauri::State;

use crate::commands::cash::{query_cash_balances, CashBalanceRow};
use crate::commands::desks::{ExchangeRateItem, HawalaListItem};
use crate::commands::transactions::TransactionListItem;
use crate::error::AppError;
use crate::state::AppState;
use crate::commands::authorize::{require_screen};

const RECENT_TX_LIMIT: i64 = 10;
const RECENT_HAWALA_LIMIT: i64 = 5;
const RATES_LIMIT: i64 = 8;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardMonthCounts {
  pub transactions: i64,
  pub deposits: i64,
  pub withdrawals: i64,
  pub exchanges: i64,
  pub hawala: i64,
  pub transfers: i64,
  pub trade_buys: i64,
  pub trade_sells: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardCustomerCounts {
  pub active: i64,
  pub total: i64,
  /// Customers whose `createdAt` falls in the current calendar month.
  pub new_this_month: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardSnapshot {
  pub as_of_month: String,
  pub month_key: String,
  pub month: DashboardMonthCounts,
  pub customers: DashboardCustomerCounts,
  pub cash: Vec<CashBalanceRow>,
  pub recent_transactions: Vec<TransactionListItem>,
  pub recent_hawala: Vec<HawalaListItem>,
  pub rates: Vec<ExchangeRateItem>,
}

fn local_month_bounds(
  now: chrono::DateTime<Local>,
) -> Result<(String, String, String, String), AppError> {
  let year = now.year();
  let month = now.month();
  let start = NaiveDate::from_ymd_opt(year, month, 1)
    .ok_or_else(|| AppError::Internal("invalid month start".into()))?;
  let end = if month == 12 {
    NaiveDate::from_ymd_opt(year + 1, 1, 1)
  } else {
    NaiveDate::from_ymd_opt(year, month + 1, 1)
  }
  .ok_or_else(|| AppError::Internal("invalid month end".into()))?;

  Ok((
    start.format("%Y-%m-%d").to_string(),
    end.format("%Y-%m-%d").to_string(),
    format!("{year}-{:02}", month),
    now.format("%B %Y").to_string(),
  ))
}

fn count_month_by_type(
  conn: &rusqlite::Connection,
  start: &str,
  end: &str,
) -> Result<DashboardMonthCounts, AppError> {
  let mut stmt = conn.prepare(
    "SELECT type, COUNT(*) FROM \"Transaction\"
     WHERE deletedAt IS NULL
       AND status = 'POSTED'
       AND valueDate >= ?
       AND valueDate < ?
     GROUP BY type",
  )?;
  let rows = stmt
    .query_map(rusqlite::params![start, end], |row| {
      Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
    })?
    .collect::<Result<Vec<_>, _>>()?;

  let mut month = DashboardMonthCounts {
    transactions: 0,
    deposits: 0,
    withdrawals: 0,
    exchanges: 0,
    hawala: 0,
    transfers: 0,
    trade_buys: 0,
    trade_sells: 0,
  };
  for (tx_type, count) in rows {
    month.transactions += count;
    match tx_type.as_str() {
      "DEPOSIT" => month.deposits += count,
      "WITHDRAWAL" => month.withdrawals += count,
      "EXCHANGE" => month.exchanges += count,
      "HAWALA" => month.hawala += count,
      "TRANSFER" => month.transfers += count,
      "TRADE_BUY" => month.trade_buys += count,
      "TRADE_SELL" => month.trade_sells += count,
      _ => {}
    }
  }
  Ok(month)
}

fn customer_counts(
  conn: &rusqlite::Connection,
  start: &str,
  end: &str,
) -> Result<DashboardCustomerCounts, AppError> {
  let total: i64 = conn.query_row("SELECT COUNT(*) FROM Customer", [], |row| row.get(0))?;
  let active: i64 = conn.query_row(
    "SELECT COUNT(*) FROM Customer WHERE deletedAt IS NULL AND isActive = 1",
    [],
    |row| row.get(0),
  )?;
  let new_this_month: i64 = conn.query_row(
    "SELECT COUNT(*) FROM Customer
     WHERE createdAt >= ?1 AND createdAt < ?2",
    rusqlite::params![start, end],
    |row| row.get(0),
  )?;
  Ok(DashboardCustomerCounts {
    active,
    total,
    new_this_month,
  })
}

fn recent_transactions(
  conn: &rusqlite::Connection,
) -> Result<Vec<TransactionListItem>, AppError> {
  let mut stmt = conn.prepare(
    "SELECT t.id, t.reference, IFNULL(t.displayRef,''), t.type, t.status, c.fullName, t.description, t.valueDate, t.createdAt
     FROM \"Transaction\" t
     LEFT JOIN Customer c ON c.id = t.customerId
     WHERE t.deletedAt IS NULL
     ORDER BY t.valueDate DESC, t.createdAt DESC
     LIMIT ?",
  )?;
  let mut items = stmt
    .query_map(rusqlite::params![RECENT_TX_LIMIT], |row| {
      Ok(TransactionListItem {
        id: row.get(0)?,
        reference: row.get(1)?,
        display_ref: row.get(2)?,
        r#type: row.get(3)?,
        status: row.get(4)?,
        customer_name: row.get(5)?,
        description: row.get(6)?,
        value_date: row.get(7)?,
        created_at: row.get(8)?,
        amount_summary: String::new(),
        sender_name: None,
        receiver_name: None,
      })
    })?
    .collect::<Result<Vec<_>, _>>()?;

  if !items.is_empty() {
    let ids: Vec<String> = items.iter().map(|i| i.id.clone()).collect();
    let by_tx = crate::ledger::fill_customer_facing_amount_summaries(conn, &ids)?;
    let transfer_ids: Vec<String> = items
      .iter()
      .filter(|i| i.r#type.eq_ignore_ascii_case("TRANSFER"))
      .map(|i| i.id.clone())
      .collect();
    let mut descs = std::collections::HashMap::new();
    for i in &items {
      if i.r#type.eq_ignore_ascii_case("TRANSFER") {
        descs.insert(i.id.clone(), i.description.clone());
      }
    }
    let parties = crate::ledger::fill_transfer_parties(conn, &transfer_ids, &descs)?;
    for item in &mut items {
      item.amount_summary = by_tx
        .get(&item.id)
        .cloned()
        .unwrap_or_else(|| "—".into());
      if let Some(p) = parties.get(&item.id) {
        item.sender_name = p.sender_name.clone();
        item.receiver_name = p.receiver_name.clone();
        if let Some(summary) = crate::ledger::transfer_amount_summary(p) {
          item.amount_summary = summary;
        }
      }
    }
  }

  Ok(items)
}

fn recent_hawala(conn: &rusqlite::Connection) -> Result<Vec<HawalaListItem>, AppError> {
  let mut stmt = conn.prepare(
    "SELECT h.id, h.reference, h.direction, h.status,
            h.senderName, h.receiverName, h.partnerSarafi,
            CAST(h.amount AS TEXT), c.code, h.valueDate, IFNULL(t.displayRef,'')
     FROM HawalaTransfer h
     INNER JOIN Currency c ON c.id = h.currencyId
     LEFT JOIN \"Transaction\" t ON t.id = h.transactionId
     WHERE h.deletedAt IS NULL
     ORDER BY h.valueDate DESC, h.createdAt DESC
     LIMIT ?",
  )?;
  let items = stmt
    .query_map(rusqlite::params![RECENT_HAWALA_LIMIT], |row| {
      Ok(HawalaListItem {
        id: row.get(0)?,
        reference: row.get(1)?,
        display_ref: row.get(10)?,
        direction: row.get(2)?,
        status: row.get(3)?,
        sender_name: row.get(4)?,
        receiver_name: row.get(5)?,
        partner_sarafi: row.get(6)?,
        amount: row.get(7)?,
        currency_code: row.get(8)?,
        value_date: row.get(9)?,
      })
    })?
    .collect::<Result<Vec<_>, _>>()?;
  Ok(items)
}

fn latest_rates(conn: &rusqlite::Connection) -> Result<Vec<ExchangeRateItem>, AppError> {
  let mut stmt = conn.prepare(
    "SELECT er.id, bc.code, qc.code, CAST(er.rate AS TEXT), er.effectiveAt
     FROM ExchangeRate er
     INNER JOIN Currency bc ON bc.id = er.baseCurrencyId
     INNER JOIN Currency qc ON qc.id = er.quoteCurrencyId
     INNER JOIN (
       SELECT baseCurrencyId, quoteCurrencyId, MAX(effectiveAt) AS maxEffective
       FROM ExchangeRate
       WHERE deletedAt IS NULL
       GROUP BY baseCurrencyId, quoteCurrencyId
     ) latest
       ON latest.baseCurrencyId = er.baseCurrencyId
      AND latest.quoteCurrencyId = er.quoteCurrencyId
      AND latest.maxEffective = er.effectiveAt
     WHERE er.deletedAt IS NULL
     ORDER BY bc.code ASC, qc.code ASC
     LIMIT ?",
  )?;
  let items = stmt
    .query_map(rusqlite::params![RATES_LIMIT], |row| {
      Ok(ExchangeRateItem {
        id: row.get(0)?,
        base_code: row.get(1)?,
        quote_code: row.get(2)?,
        rate: row.get(3)?,
        effective_at: row.get(4)?,
      })
    })?
    .collect::<Result<Vec<_>, _>>()?;
  Ok(items)
}

#[tauri::command]
pub fn get_dashboard_snapshot(
  state: State<'_, AppState>,
) -> Result<DashboardSnapshot, AppError> {
  let (start, end, month_key, as_of_month) = local_month_bounds(Local::now())?;
  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "dashboard")?;

  Ok(DashboardSnapshot {
    as_of_month,
    month_key,
    month: count_month_by_type(&conn, &start, &end)?,
    customers: customer_counts(&conn, &start, &end)?,
    cash: query_cash_balances(&conn)?,
    recent_transactions: recent_transactions(&conn)?,
    recent_hawala: recent_hawala(&conn)?,
    rates: latest_rates(&conn)?,
  })
}
