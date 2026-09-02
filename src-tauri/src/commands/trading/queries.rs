use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::AppError;
use crate::state::AppState;
use crate::commands::authorize::{require_screen};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TradingInventoryRow {
  pub currency_id: String,
  pub currency_code: String,
  pub currency_symbol: Option<String>,
  pub quantity: String,
  pub avg_cost: String,
  pub avg_cost_currency_code: String,
  pub cost_value: String,
  pub market_rate: Option<String>,
  pub market_value: Option<String>,
  pub unrealized_pnl: Option<String>,
  pub last_purchase_at: Option<String>,
  pub last_sale_at: Option<String>,
}

#[tauri::command]
pub fn list_trading_inventory(
  state: State<'_, AppState>,
) -> Result<Vec<TradingInventoryRow>, AppError> {
  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "trading")?;
  if !trading_trade_table_exists(&conn)? {
    return Ok(Vec::new());
  }
  let mut stmt = conn.prepare(
    "SELECT ti.currencyId, c.code, c.symbol,
            CAST(ti.quantity AS TEXT), CAST(ti.avgCost AS TEXT), pc.code,
            CAST(ti.costValue AS TEXT), ti.lastPurchaseAt, ti.lastSaleAt,
            (
              SELECT CAST(tm.marketRate AS TEXT) FROM TradingMarketRate tm
              WHERE tm.currencyId = ti.currencyId AND tm.deletedAt IS NULL
              ORDER BY tm.effectiveAt DESC LIMIT 1
            )
     FROM TradingInventory ti
     INNER JOIN Currency c ON c.id = ti.currencyId
     INNER JOIN Currency pc ON pc.id = ti.avgCostCurrencyId
     WHERE ABS(CAST(ti.quantity AS REAL)) > 0
     ORDER BY c.code ASC",
  )?;
  let rows = stmt
    .query_map([], |row| {
      Ok((
        row.get::<_, String>(0)?,
        row.get::<_, String>(1)?,
        row.get::<_, Option<String>>(2)?,
        row.get::<_, String>(3)?,
        row.get::<_, String>(4)?,
        row.get::<_, String>(5)?,
        row.get::<_, String>(6)?,
        row.get::<_, Option<String>>(7)?,
        row.get::<_, Option<String>>(8)?,
        row.get::<_, Option<String>>(9)?,
      ))
    })?
    .collect::<Result<Vec<_>, _>>()?;

  Ok(rows
    .into_iter()
    .map(
      |(cid, code, symbol, qty, avg, avg_ccy, cost, last_p, last_s, mkt)| {
        let (market_value, unrealized) = match mkt.as_ref() {
          Some(rate) => {
            let ur = match (qty.parse::<f64>(), avg.parse::<f64>(), rate.parse::<f64>()) {
              (Ok(q), Ok(a), Ok(r)) => Some(format!("{:.4}", q * (r - a))),
              _ => None,
            };
            (Some(format!("{qty} × {rate}")), ur)
          }
          None => (None, None),
        };
        TradingInventoryRow {
          currency_id: cid,
          currency_code: code,
          currency_symbol: symbol,
          quantity: qty,
          avg_cost: avg,
          avg_cost_currency_code: avg_ccy,
          cost_value: cost,
          market_rate: mkt,
          market_value,
          unrealized_pnl: unrealized,
          last_purchase_at: last_p,
          last_sale_at: last_s,
        }
      },
    )
    .collect())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListTradesInput {
  pub direction: Option<String>,
  pub page: Option<i64>,
  pub page_size: Option<i64>,
  pub search: Option<String>,
  pub currency_code: Option<String>,
  pub date_from: Option<String>,
  pub date_to: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TradingTradeRow {
  pub id: String,
  pub reference: String,
  pub direction: String,
  pub inventory_currency_code: String,
  pub quantity: String,
  pub rate: String,
  pub payment_currency_code: String,
  pub payment_amount: String,
  pub counterparty_type: String,
  pub counterparty_name: Option<String>,
  pub avg_cost_at_post: Option<String>,
  pub cogs_amount: Option<String>,
  pub gross_profit: Option<String>,
  pub value_date: String,
  pub transaction_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TradingTradePage {
  pub items: Vec<TradingTradeRow>,
  pub total: i64,
  pub page: i64,
  pub page_size: i64,
}

fn trading_trade_table_exists(conn: &Connection) -> Result<bool, AppError> {
  let exists: bool = conn.query_row(
    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='TradingTrade')",
    [],
    |row| row.get(0),
  )?;
  Ok(exists)
}

pub fn query_trades(
  conn: &Connection,
  input: &ListTradesInput,
) -> Result<TradingTradePage, AppError> {
  let page_size = input.page_size.unwrap_or(25).clamp(1, 100);
  let mut page = input.page.unwrap_or(1).max(1);
  if !trading_trade_table_exists(conn)? {
    return Ok(TradingTradePage {
      items: Vec::new(),
      total: 0,
      page,
      page_size,
    });
  }
  let mut where_sql = String::from("WHERE t.deletedAt IS NULL");
  let mut params_v: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

  if let Some(ref d) = input.direction {
    let d = d.trim().to_ascii_uppercase();
    if d == "BUY" || d == "SELL" {
      where_sql.push_str(" AND t.direction = ?");
      params_v.push(Box::new(d));
    }
  }
  if let Some(ref q) = input.search {
    let q = q.trim();
    if !q.is_empty() {
      where_sql.push_str(
        " AND (t.reference LIKE ? OR IFNULL(t.counterpartyName,'') LIKE ? OR ic.code LIKE ? OR pc.code LIKE ?)",
      );
      let like = format!("%{q}%");
      params_v.push(Box::new(like.clone()));
      params_v.push(Box::new(like.clone()));
      params_v.push(Box::new(like.clone()));
      params_v.push(Box::new(like));
    }
  }
  if let Some(ref code) = input.currency_code {
    let code = code.trim().to_ascii_uppercase();
    if !code.is_empty() {
      where_sql.push_str(" AND (ic.code = ? OR pc.code = ?)");
      params_v.push(Box::new(code.clone()));
      params_v.push(Box::new(code));
    }
  }
  if let Some(ref from) = input.date_from {
    let from = from.trim();
    if !from.is_empty() {
      where_sql.push_str(" AND t.valueDate >= ?");
      params_v.push(Box::new(from.to_string()));
    }
  }
  if let Some(ref to) = input.date_to {
    let to = to.trim();
    if !to.is_empty() {
      where_sql.push_str(" AND t.valueDate < date(?, '+1 day')");
      params_v.push(Box::new(to.to_string()));
    }
  }

  let count_sql = format!(
    "SELECT COUNT(*) FROM TradingTrade t
     INNER JOIN Currency ic ON ic.id = t.inventoryCurrencyId
     INNER JOIN Currency pc ON pc.id = t.paymentCurrencyId
     {where_sql}"
  );
  let refs: Vec<&dyn rusqlite::types::ToSql> = params_v.iter().map(|p| p.as_ref()).collect();
  let total: i64 = conn.query_row(&count_sql, refs.as_slice(), |row| row.get(0))?;
  let total_pages = if total == 0 {
    1
  } else {
    (total + page_size - 1) / page_size
  };
  if page > total_pages {
    page = total_pages;
  }
  let offset = (page - 1) * page_size;

  let list_sql = format!(
    "SELECT t.id, t.reference, t.direction, ic.code, CAST(t.quantity AS TEXT), CAST(t.rate AS TEXT),
            pc.code, CAST(t.paymentAmount AS TEXT), t.counterpartyType, t.counterpartyName,
            CAST(t.avgCostAtPost AS TEXT), CAST(t.cogsAmount AS TEXT), CAST(t.grossProfit AS TEXT),
            t.valueDate, t.transactionId
     FROM TradingTrade t
     INNER JOIN Currency ic ON ic.id = t.inventoryCurrencyId
     INNER JOIN Currency pc ON pc.id = t.paymentCurrencyId
     {where_sql}
     ORDER BY t.valueDate DESC, t.createdAt DESC
     LIMIT ? OFFSET ?"
  );
  let mut list_params = params_v;
  list_params.push(Box::new(page_size));
  list_params.push(Box::new(offset));
  let list_refs: Vec<&dyn rusqlite::types::ToSql> =
    list_params.iter().map(|p| p.as_ref()).collect();
  let mut stmt = conn.prepare(&list_sql)?;
  let items = stmt
    .query_map(list_refs.as_slice(), |row| {
      Ok(TradingTradeRow {
        id: row.get(0)?,
        reference: row.get(1)?,
        direction: row.get(2)?,
        inventory_currency_code: row.get(3)?,
        quantity: row.get(4)?,
        rate: row.get(5)?,
        payment_currency_code: row.get(6)?,
        payment_amount: row.get(7)?,
        counterparty_type: row.get(8)?,
        counterparty_name: row.get(9)?,
        avg_cost_at_post: row.get(10)?,
        cogs_amount: row.get(11)?,
        gross_profit: row.get(12)?,
        value_date: row.get(13)?,
        transaction_id: row.get(14)?,
      })
    })?
    .collect::<Result<Vec<_>, _>>()?;

  Ok(TradingTradePage {
    items,
    total,
    page,
    page_size,
  })
}

#[tauri::command]
pub fn list_trading_trades(
  state: State<'_, AppState>,
  input: ListTradesInput,
) -> Result<TradingTradePage, AppError> {
  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "trading")?;
  query_trades(&conn, &input)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TradingDashboard {
  pub profit_today: String,
  pub profit_month: String,
  pub open_positions: i64,
  pub buys_today: i64,
  pub sales_today: i64,
  pub closed_trades_month: i64,
  pub inventory_cost_value: String,
  pub recent_trades: Vec<TradingTradeRow>,
}

fn sum_profit(conn: &Connection, from: &str, to: &str) -> Result<String, AppError> {
  if !trading_trade_table_exists(conn)? {
    return Ok("0".into());
  }
  let v: String = conn.query_row(
    "SELECT CAST(COALESCE(SUM(CAST(grossProfit AS REAL)), 0) AS TEXT)
     FROM TradingTrade
     WHERE deletedAt IS NULL AND direction = 'SELL'
       AND valueDate >= ? AND valueDate < date(?, '+1 day')",
    params![from, to],
    |row| row.get(0),
  )?;
  Ok(v)
}

#[tauri::command]
pub fn get_trading_dashboard(
  state: State<'_, AppState>,
) -> Result<TradingDashboard, AppError> {
  let today = chrono::Local::now().format("%Y-%m-%d").to_string();
  let month_start = chrono::Local::now().format("%Y-%m-01").to_string();
  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "trading")?;

  if !trading_trade_table_exists(&conn)? {
    return Ok(TradingDashboard {
      profit_today: "0".into(),
      profit_month: "0".into(),
      open_positions: 0,
      buys_today: 0,
      sales_today: 0,
      closed_trades_month: 0,
      inventory_cost_value: "0".into(),
      recent_trades: Vec::new(),
    });
  }

  let recent = query_trades(
    &conn,
    &ListTradesInput {
      direction: None,
      page: Some(1),
      page_size: Some(8),
      search: None,
      currency_code: None,
      date_from: None,
      date_to: None,
    },
  )?;

  Ok(TradingDashboard {
    profit_today: sum_profit(&conn, &today, &today)?,
    profit_month: sum_profit(&conn, &month_start, &today)?,
    open_positions: conn.query_row(
      "SELECT COUNT(*) FROM TradingInventory WHERE ABS(CAST(quantity AS REAL)) > 0",
      [],
      |row| row.get(0),
    )?,
    buys_today: conn.query_row(
      "SELECT COUNT(*) FROM TradingTrade
       WHERE deletedAt IS NULL AND direction='BUY' AND date(valueDate)=date(?)",
      [&today],
      |row| row.get(0),
    )?,
    sales_today: conn.query_row(
      "SELECT COUNT(*) FROM TradingTrade
       WHERE deletedAt IS NULL AND direction='SELL' AND date(valueDate)=date(?)",
      [&today],
      |row| row.get(0),
    )?,
    closed_trades_month: conn.query_row(
      "SELECT COUNT(*) FROM TradingTrade
       WHERE deletedAt IS NULL AND direction='SELL'
         AND valueDate >= ? AND valueDate < date(?, '+1 day')",
      params![month_start, today],
      |row| row.get(0),
    )?,
    inventory_cost_value: conn.query_row(
      "SELECT CAST(COALESCE(SUM(CAST(costValue AS REAL)), 0) AS TEXT) FROM TradingInventory",
      [],
      |row| row.get(0),
    )?,
    recent_trades: recent.items,
  })
}
