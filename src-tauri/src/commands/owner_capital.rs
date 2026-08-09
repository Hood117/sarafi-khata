//! Owner Capital — calculated from ledger; inject/withdraw posts via Opening Equity.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::AppError;
use crate::ledger::{
  find_currency_by_code, money_from_major_units, money_to_major_unit_string, post_transaction,
  PostTransactionInput, PostingLineDto,
};
use crate::state::AppState;
use crate::util::{now_sqlite, format_f64};

const OPENING_EQUITY: &str = "Opening Equity";

fn trim_opt(v: Option<String>) -> Option<String> {
  v.map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

fn ensure_opening_equity(conn: &Connection) -> Result<String, AppError> {
  let existing: Option<String> = conn
    .query_row(
      "SELECT id FROM Wallet
       WHERE name = ?1 AND type = 'SYSTEM' AND deletedAt IS NULL AND isActive = 1
       LIMIT 1",
      [OPENING_EQUITY],
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
    params![id, OPENING_EQUITY, now],
  )?;
  Ok(id)
}

fn assert_cash_wallet(conn: &Connection, id: &str) -> Result<(), AppError> {
  let row: Option<(String, i64)> = conn
    .query_row(
      "SELECT type, isActive FROM Wallet WHERE id = ?1 AND deletedAt IS NULL",
      [id],
      |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .optional()?;
  let (t, active) = row.ok_or_else(|| AppError::NotFound("Cash wallet not found.".into()))?;
  if active != 1 || (t != "VAULT" && t != "TILL") {
    return Err(AppError::Validation(
      "Cash wallet must be an active vault or till.".into(),
    ));
  }
  Ok(())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapitalCurrencyBreakdown {
  pub currency_id: String,
  pub currency_code: String,
  pub currency_name: String,
  pub currency_symbol: Option<String>,
  pub cash: String,
  pub customer_funds: String,
  pub partner_payable: String,
  pub partner_receivable: String,
  pub pending_hawala: String,
  pub trading_inventory_cost: String,
  pub commission_income: String,
  pub owner_capital: String,
  pub percent_of_total: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OwnerCapitalSnapshot {
  pub as_of: String,
  pub total_cash: String,
  pub total_customer_funds: String,
  pub total_partner_payable: String,
  pub total_partner_receivable: String,
  pub total_pending_hawala: String,
  pub total_trading_inventory: String,
  pub total_commission_income: String,
  pub total_owner_capital: String,
  pub profit_today: String,
  pub profit_month: String,
  pub trading_profit_month: String,
  pub exchange_count_month: i64,
  pub hawala_commission_month: String,
  pub by_currency: Vec<CapitalCurrencyBreakdown>,
}

fn wallet_type_sums(
  conn: &Connection,
  wallet_type: &str,
) -> Result<Vec<(String, String, String, Option<String>, f64)>, AppError> {
  let mut stmt = conn.prepare(
    r#"SELECT c.id, c.code, c.name, c.symbol,
              COALESCE(SUM(CASE WHEN le.direction='DEBIT' THEN CAST(le.amount AS REAL)
                                ELSE -CAST(le.amount AS REAL) END), 0)
       FROM Wallet w
       INNER JOIN LedgerEntry le ON le.walletId = w.id
       INNER JOIN "Transaction" t ON t.id = le.transactionId AND t.deletedAt IS NULL
       INNER JOIN Currency c ON c.id = le.currencyId AND c.deletedAt IS NULL
       WHERE w.type = ?1 AND w.deletedAt IS NULL AND w.isActive = 1
       GROUP BY c.id, c.code, c.name, c.symbol
       ORDER BY c.code"#,
  )?;
  let rows = stmt
    .query_map([wallet_type], |row| {
      Ok((
        row.get::<_, String>(0)?,
        row.get::<_, String>(1)?,
        row.get::<_, String>(2)?,
        row.get::<_, Option<String>>(3)?,
        row.get::<_, f64>(4)?,
      ))
    })?
    .collect::<Result<Vec<_>, _>>()?;
  Ok(rows)
}

fn named_system_sums(
  conn: &Connection,
  name: &str,
) -> Result<std::collections::HashMap<String, f64>, AppError> {
  let mut map = std::collections::HashMap::new();
  let mut stmt = conn.prepare(
    r#"SELECT c.id,
              COALESCE(SUM(CASE WHEN le.direction='DEBIT' THEN CAST(le.amount AS REAL)
                                ELSE -CAST(le.amount AS REAL) END), 0)
       FROM Wallet w
       INNER JOIN LedgerEntry le ON le.walletId = w.id
       INNER JOIN "Transaction" t ON t.id = le.transactionId AND t.deletedAt IS NULL
       INNER JOIN Currency c ON c.id = le.currencyId
       WHERE w.name = ?1 AND w.type = 'SYSTEM' AND w.deletedAt IS NULL
       GROUP BY c.id"#,
  )?;
  let rows = stmt
    .query_map([name], |row| Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?)))?
    .collect::<Result<Vec<_>, _>>()?;
  for (cid, v) in rows {
    map.insert(cid, v);
  }
  Ok(map)
}

fn partner_commission_maps(
  conn: &Connection,
) -> Result<(std::collections::HashMap<String, f64>, std::collections::HashMap<String, f64>), AppError>
{
  let mut payable = std::collections::HashMap::new();
  let mut receivable = std::collections::HashMap::new();
  let mut stmt = conn.prepare(
    r#"SELECT COALESCE(h.commissionCurrencyId, h.currencyId),
              h.commissionSide,
              COALESCE(SUM(CAST(h.commissionAmount AS REAL)), 0)
       FROM HawalaTransfer h
       WHERE h.deletedAt IS NULL AND h.status = 'COMPLETED'
         AND h.commissionAmount IS NOT NULL
         AND CAST(h.commissionAmount AS REAL) > 0
       GROUP BY COALESCE(h.commissionCurrencyId, h.currencyId), h.commissionSide"#,
  )?;
  let rows = stmt
    .query_map([], |row| {
      Ok((
        row.get::<_, String>(0)?,
        row.get::<_, Option<String>>(1)?,
        row.get::<_, f64>(2)?,
      ))
    })?
    .collect::<Result<Vec<_>, _>>()?;
  for (cid, side, amt) in rows {
    match side.as_deref() {
      Some("PAYABLE") => *payable.entry(cid).or_insert(0.0) += amt,
      Some("RECEIVABLE") => *receivable.entry(cid).or_insert(0.0) += amt,
      _ => {}
    }
  }
  // Subtract settlements if present
  if let Ok(mut s) = conn.prepare(
    r#"SELECT currencyId, kind, COALESCE(SUM(CAST(amount AS REAL)),0)
       FROM PartnerCommissionSettlement GROUP BY currencyId, kind"#,
  ) {
    if let Ok(mapped) = s.query_map([], |row| {
      Ok((
        row.get::<_, String>(0)?,
        row.get::<_, String>(1)?,
        row.get::<_, f64>(2)?,
      ))
    }) {
      for item in mapped.flatten() {
        let (cid, kind, amt) = item;
        let k = kind.to_ascii_uppercase();
        if k.contains("PAY") {
          *payable.entry(cid).or_insert(0.0) -= amt;
        } else {
          *receivable.entry(cid).or_insert(0.0) -= amt;
        }
      }
    }
  }
  Ok((payable, receivable))
}

fn pending_hawala_by_currency(
  conn: &Connection,
) -> Result<std::collections::HashMap<String, f64>, AppError> {
  let mut map = std::collections::HashMap::new();
  let mut stmt = conn.prepare(
    r#"SELECT currencyId, COALESCE(SUM(CAST(amount AS REAL)),0)
       FROM HawalaTransfer
       WHERE deletedAt IS NULL AND status IN ('PENDING','SENT','RECEIVED')
       GROUP BY currencyId"#,
  )?;
  for row in stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?)))? {
    let (cid, v) = row?;
    map.insert(cid, v);
  }
  Ok(map)
}

fn trading_cost_by_currency(
  conn: &Connection,
) -> Result<std::collections::HashMap<String, f64>, AppError> {
  let mut map = std::collections::HashMap::new();
  let exists: bool = conn.query_row(
    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='TradingInventory')",
    [],
    |row| row.get(0),
  )?;
  if !exists {
    return Ok(map);
  }
  let mut stmt = conn.prepare(
    r#"SELECT avgCostCurrencyId, COALESCE(SUM(CAST(costValue AS REAL)),0)
       FROM TradingInventory
       WHERE ABS(CAST(quantity AS REAL)) > 0
       GROUP BY avgCostCurrencyId"#,
  )?;
  for row in stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?)))? {
    let (cid, v) = row?;
    map.insert(cid, v);
  }
  Ok(map)
}

fn trading_profit_range(conn: &Connection, from: &str, to: &str) -> Result<f64, AppError> {
  let exists: bool = conn.query_row(
    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='TradingTrade')",
    [],
    |row| row.get(0),
  )?;
  if !exists {
    return Ok(0.0);
  }
  Ok(conn.query_row(
    r#"SELECT COALESCE(SUM(CAST(grossProfit AS REAL)),0)
       FROM TradingTrade
       WHERE deletedAt IS NULL AND direction='SELL'
         AND valueDate >= ?1 AND valueDate < date(?2, '+1 day')"#,
    params![from, to],
    |row| row.get(0),
  )?)
}

fn hawala_own_commission_range(conn: &Connection, from: &str, to: &str) -> Result<f64, AppError> {
  Ok(conn.query_row(
    r#"SELECT COALESCE(SUM(CAST(ownCommissionAmount AS REAL)),0)
       FROM HawalaTransfer
       WHERE deletedAt IS NULL AND status IN ('SENT','RECEIVED','COMPLETED')
         AND valueDate >= ?1 AND valueDate < date(?2, '+1 day')"#,
    params![from, to],
    |row| row.get(0),
  )?)
}

pub fn compute_owner_capital_snapshot(conn: &Connection) -> Result<OwnerCapitalSnapshot, AppError> {
  let today = chrono::Local::now().format("%Y-%m-%d").to_string();
  let month_start = chrono::Local::now().format("%Y-%m-01").to_string();

  let mut by_ccy: std::collections::HashMap<String, CapitalCurrencyBreakdown> =
    std::collections::HashMap::new();

  let ensure_row = |map: &mut std::collections::HashMap<String, CapitalCurrencyBreakdown>,
                    cid: &str,
                    code: &str,
                    name: &str,
                    symbol: Option<String>| {
    map.entry(cid.to_string()).or_insert_with(|| CapitalCurrencyBreakdown {
      currency_id: cid.to_string(),
      currency_code: code.to_string(),
      currency_name: name.to_string(),
      currency_symbol: symbol,
      cash: "0".into(),
      customer_funds: "0".into(),
      partner_payable: "0".into(),
      partner_receivable: "0".into(),
      pending_hawala: "0".into(),
      trading_inventory_cost: "0".into(),
      commission_income: "0".into(),
      owner_capital: "0".into(),
      percent_of_total: "0".into(),
    });
  };

  // Cash = VAULT + TILL
  let mut cash_map: std::collections::HashMap<String, f64> = std::collections::HashMap::new();
  for (cid, code, name, symbol, v) in wallet_type_sums(conn, "VAULT")? {
    ensure_row(&mut by_ccy, &cid, &code, &name, symbol);
    *cash_map.entry(cid).or_insert(0.0) += v;
  }
  for (cid, code, name, symbol, v) in wallet_type_sums(conn, "TILL")? {
    ensure_row(&mut by_ccy, &cid, &code, &name, symbol);
    *cash_map.entry(cid).or_insert(0.0) += v;
  }

  // Customer funds: positive CUSTOMER wallet balances (deposit posts DEBIT to customer)
  let mut customer_map: std::collections::HashMap<String, f64> = std::collections::HashMap::new();
  for (cid, code, name, symbol, v) in wallet_type_sums(conn, "CUSTOMER")? {
    ensure_row(&mut by_ccy, &cid, &code, &name, symbol);
    if v > 0.0 {
      customer_map.insert(cid, v);
    }
  }

  let (payable_map, receivable_map) = partner_commission_maps(conn)?;
  for (cid, v) in &payable_map {
    if let Ok((code, name, symbol)) = conn.query_row(
      "SELECT code, name, symbol FROM Currency WHERE id=?1",
      [cid],
      |row| {
        Ok((
          row.get::<_, String>(0)?,
          row.get::<_, String>(1)?,
          row.get::<_, Option<String>>(2)?,
        ))
      },
    ) {
      ensure_row(&mut by_ccy, cid, &code, &name, symbol);
    }
    let _ = v;
  }
  for cid in receivable_map.keys() {
    if let Ok((code, name, symbol)) = conn.query_row(
      "SELECT code, name, symbol FROM Currency WHERE id=?1",
      [cid],
      |row| {
        Ok((
          row.get::<_, String>(0)?,
          row.get::<_, String>(1)?,
          row.get::<_, Option<String>>(2)?,
        ))
      },
    ) {
      ensure_row(&mut by_ccy, cid, &code, &name, symbol);
    }
  }

  let pending_map = pending_hawala_by_currency(conn)?;
  for cid in pending_map.keys() {
    if let Ok((code, name, symbol)) = conn.query_row(
      "SELECT code, name, symbol FROM Currency WHERE id=?1",
      [cid],
      |row| {
        Ok((
          row.get::<_, String>(0)?,
          row.get::<_, String>(1)?,
          row.get::<_, Option<String>>(2)?,
        ))
      },
    ) {
      ensure_row(&mut by_ccy, cid, &code, &name, symbol);
    }
  }

  let trading_map = trading_cost_by_currency(conn)?;
  for cid in trading_map.keys() {
    if let Ok((code, name, symbol)) = conn.query_row(
      "SELECT code, name, symbol FROM Currency WHERE id=?1",
      [cid],
      |row| {
        Ok((
          row.get::<_, String>(0)?,
          row.get::<_, String>(1)?,
          row.get::<_, Option<String>>(2)?,
        ))
      },
    ) {
      ensure_row(&mut by_ccy, cid, &code, &name, symbol);
    }
  }

  let income_map = named_system_sums(conn, "Hawala Commission Income")?;
  // Income wallet: CREDIT increases equity-like; balance DEBIT-CREDIT is typically negative for income.
  // Display commission income as abs of credit balance.
  for (cid, v) in &income_map {
    if let Ok((code, name, symbol)) = conn.query_row(
      "SELECT code, name, symbol FROM Currency WHERE id=?1",
      [cid],
      |row| {
        Ok((
          row.get::<_, String>(0)?,
          row.get::<_, String>(1)?,
          row.get::<_, Option<String>>(2)?,
        ))
      },
    ) {
      ensure_row(&mut by_ccy, cid, &code, &name, symbol);
    }
    let _ = v;
  }

  let mut total_cash = 0.0;
  let mut total_customer = 0.0;
  let mut total_pay = 0.0;
  let mut total_recv = 0.0;
  let mut total_pending = 0.0;
  let mut total_trading = 0.0;
  let mut total_income = 0.0;
  let mut total_owner = 0.0;

  let mut rows: Vec<CapitalCurrencyBreakdown> = by_ccy.into_values().collect();
  rows.sort_by(|a, b| a.currency_code.cmp(&b.currency_code));

  for row in &mut rows {
    let cid = row.currency_id.clone();
    let cash = cash_map.get(&cid).copied().unwrap_or(0.0);
    let customer = customer_map.get(&cid).copied().unwrap_or(0.0).max(0.0);
    let payable = payable_map.get(&cid).copied().unwrap_or(0.0).max(0.0);
    let receivable = receivable_map.get(&cid).copied().unwrap_or(0.0).max(0.0);
    let pending = pending_map.get(&cid).copied().unwrap_or(0.0).max(0.0);
    let trading = trading_map.get(&cid).copied().unwrap_or(0.0).max(0.0);
    // Commission income credit balance → negative asset sum; use -min(0,v)
    let income_raw = income_map.get(&cid).copied().unwrap_or(0.0);
    let income = (-income_raw).max(0.0);

    // Owner capital identity (per currency):
    // cash - customer money - partner payables - pending hawala + receivables + trading stock
    let owner = cash - customer - payable - pending + receivable + trading;

    row.cash = format_f64(cash);
    row.customer_funds = format_f64(customer);
    row.partner_payable = format_f64(payable);
    row.partner_receivable = format_f64(receivable);
    row.pending_hawala = format_f64(pending);
    row.trading_inventory_cost = format_f64(trading);
    row.commission_income = format_f64(income);
    row.owner_capital = format_f64(owner);

    total_cash += cash;
    total_customer += customer;
    total_pay += payable;
    total_recv += receivable;
    total_pending += pending;
    total_trading += trading;
    total_income += income;
    total_owner += owner;
  }

  for row in &mut rows {
    let owner = row.owner_capital.parse::<f64>().unwrap_or(0.0);
    let pct = if total_owner.abs() < 1e-9 {
      0.0
    } else {
      (owner / total_owner) * 100.0
    };
    row.percent_of_total = format!("{pct:.1}");
  }

  let profit_today = trading_profit_range(conn, &today, &today)?
    + hawala_own_commission_range(conn, &today, &today)?;
  let trading_month = trading_profit_range(conn, &month_start, &today)?;
  let hawala_comm_month = hawala_own_commission_range(conn, &month_start, &today)?;
  let exchange_count_month: i64 = conn.query_row(
    r#"SELECT COUNT(*) FROM "Transaction"
       WHERE deletedAt IS NULL AND type='EXCHANGE'
         AND valueDate >= ?1 AND valueDate < date(?2, '+1 day')"#,
    params![month_start, today],
    |row| row.get(0),
  )?;

  Ok(OwnerCapitalSnapshot {
    as_of: today,
    total_cash: format_f64(total_cash),
    total_customer_funds: format_f64(total_customer),
    total_partner_payable: format_f64(total_pay),
    total_partner_receivable: format_f64(total_recv),
    total_pending_hawala: format_f64(total_pending),
    total_trading_inventory: format_f64(total_trading),
    total_commission_income: format_f64(total_income),
    total_owner_capital: format_f64(total_owner),
    profit_today: format_f64(profit_today),
    profit_month: format_f64(trading_month + hawala_comm_month),
    trading_profit_month: format_f64(trading_month),
    exchange_count_month,
    hawala_commission_month: format_f64(hawala_comm_month),
    by_currency: rows,
  })
}

#[tauri::command]
pub fn get_owner_capital_snapshot(
  state: State<'_, AppState>,
) -> Result<OwnerCapitalSnapshot, AppError> {
  let conn = state.db.lock();
  compute_owner_capital_snapshot(&conn)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OwnerCapitalMoveInput {
  pub kind: String, // INVEST | WITHDRAW
  pub currency_code: String,
  pub amount: String,
  pub cash_wallet_id: String,
  pub notes: Option<String>,
  pub reason: Option<String>,
  pub value_date: Option<String>,
  pub created_by_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OwnerCapitalMoveResult {
  pub id: String,
  pub kind: String,
  pub transaction_id: String,
  pub amount: String,
  pub currency_code: String,
}

#[tauri::command]
pub fn post_owner_capital_move(
  state: State<'_, AppState>,
  input: OwnerCapitalMoveInput,
) -> Result<OwnerCapitalMoveResult, AppError> {
  let kind = input.kind.trim().to_ascii_uppercase();
  if kind != "INVEST" && kind != "WITHDRAW" {
    return Err(AppError::Validation(
      "kind must be INVEST or WITHDRAW.".into(),
    ));
  }
  let created_by = input.created_by_id.trim().to_string();
  if created_by.is_empty() {
    return Err(AppError::Validation("createdById is required.".into()));
  }
  let cash_wallet_id = input.cash_wallet_id.trim().to_string();
  if cash_wallet_id.is_empty() {
    return Err(AppError::Validation("cashWalletId is required.".into()));
  }

  let conn = state.db.lock();
  assert_cash_wallet(&conn, &cash_wallet_id)?;
  let equity_id = ensure_opening_equity(&conn)?;
  let (_cid, code, places) = find_currency_by_code(&conn, &input.currency_code)?;
  let minor = money_from_major_units(input.amount.trim(), places)?;
  if minor <= 0 {
    return Err(AppError::Validation("Amount must be positive.".into()));
  }
  let amount_major = money_to_major_unit_string(minor, places)?;
  let value_date = input
    .value_date
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(|s| s.to_string())
    .unwrap_or_else(now_sqlite);
  let notes = trim_opt(input.notes);
  let reason = trim_opt(input.reason);
  let currency_id = _cid;

  let (cash_dir, equity_dir, memo) = if kind == "INVEST" {
    ("DEBIT", "CREDIT", "Owner capital investment")
  } else {
    ("CREDIT", "DEBIT", "Owner capital withdrawal")
  };

  let reference = format!(
    "CAP-{}-{}",
    kind,
    chrono::Utc::now().timestamp_millis()
  );
  let description = notes
    .clone()
    .or_else(|| reason.clone())
    .unwrap_or_else(|| memo.to_string());

  let posted = post_transaction(
    &conn,
    PostTransactionInput {
      reference: reference.clone(),
      r#type: "ADJUSTMENT".into(),
      value_date: value_date.clone(),
      customer_id: None,
      walk_in_name: None,
      walk_in_phone: None,
      description: Some(description),
      created_by_id: Some(created_by.clone()),
      entries: vec![
        PostingLineDto {
          wallet_id: cash_wallet_id.clone(),
          currency: code.clone(),
          direction: cash_dir.into(),
          amount_minor: minor.to_string(),
          exchange_rate_id: None,
          memo: Some(memo.into()),
        },
        PostingLineDto {
          wallet_id: equity_id,
          currency: code.clone(),
          direction: equity_dir.into(),
          amount_minor: minor.to_string(),
          exchange_rate_id: None,
          memo: Some(memo.into()),
        },
      ],
    },
  )?;

  let event_id = uuid::Uuid::new_v4().to_string();
  let now = now_sqlite();
  let table_exists: bool = conn.query_row(
    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='OwnerCapitalEvent')",
    [],
    |row| row.get(0),
  )?;
  if table_exists {
    conn.execute(
      r#"INSERT INTO OwnerCapitalEvent (
           id, kind, currencyId, amount, cashWalletId, transactionId, notes, reason,
           createdById, valueDate, deletedAt, createdAt, updatedAt
         ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,NULL,?11,?11)"#,
      params![
        event_id,
        kind,
        currency_id,
        amount_major,
        cash_wallet_id,
        posted.id,
        notes,
        reason,
        created_by,
        value_date,
        now,
      ],
    )?;
  }

  Ok(OwnerCapitalMoveResult {
    id: event_id,
    kind,
    transaction_id: posted.id,
    amount: amount_major,
    currency_code: code,
  })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListCapitalEventsInput {
  pub page: Option<i64>,
  pub page_size: Option<i64>,
  pub kind: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OwnerCapitalEventRow {
  pub id: String,
  pub kind: String,
  pub currency_code: String,
  pub amount: String,
  pub notes: Option<String>,
  pub reason: Option<String>,
  pub created_by_name: Option<String>,
  pub value_date: String,
  pub transaction_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OwnerCapitalEventPage {
  pub items: Vec<OwnerCapitalEventRow>,
  pub total: i64,
  pub page: i64,
  pub page_size: i64,
}

#[tauri::command]
pub fn list_owner_capital_events(
  state: State<'_, AppState>,
  input: ListCapitalEventsInput,
) -> Result<OwnerCapitalEventPage, AppError> {
  let page_size = input.page_size.unwrap_or(25).clamp(1, 100);
  let mut page = input.page.unwrap_or(1).max(1);
  let conn = state.db.lock();
  let exists: bool = conn.query_row(
    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='OwnerCapitalEvent')",
    [],
    |row| row.get(0),
  )?;
  if !exists {
    return Ok(OwnerCapitalEventPage {
      items: vec![],
      total: 0,
      page: 1,
      page_size,
    });
  }

  let mut where_sql = String::from("WHERE e.deletedAt IS NULL");
  let mut params_v: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
  if let Some(ref k) = input.kind {
    let k = k.trim().to_ascii_uppercase();
    if !k.is_empty() && k != "ALL" {
      where_sql.push_str(" AND e.kind = ?");
      params_v.push(Box::new(k));
    }
  }

  let count_sql = format!("SELECT COUNT(*) FROM OwnerCapitalEvent e {where_sql}");
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
    r#"SELECT e.id, e.kind, c.code, CAST(e.amount AS TEXT), e.notes, e.reason,
              u.fullName, e.valueDate, e.transactionId
       FROM OwnerCapitalEvent e
       INNER JOIN Currency c ON c.id = e.currencyId
       LEFT JOIN User u ON u.id = e.createdById
       {where_sql}
       ORDER BY e.valueDate DESC, e.createdAt DESC
       LIMIT ? OFFSET ?"#
  );
  let mut list_params = params_v;
  list_params.push(Box::new(page_size));
  list_params.push(Box::new(offset));
  let list_refs: Vec<&dyn rusqlite::types::ToSql> =
    list_params.iter().map(|p| p.as_ref()).collect();
  let mut stmt = conn.prepare(&list_sql)?;
  let items = stmt
    .query_map(list_refs.as_slice(), |row| {
      Ok(OwnerCapitalEventRow {
        id: row.get(0)?,
        kind: row.get(1)?,
        currency_code: row.get(2)?,
        amount: row.get(3)?,
        notes: row.get(4)?,
        reason: row.get(5)?,
        created_by_name: row.get(6)?,
        value_date: row.get(7)?,
        transaction_id: row.get(8)?,
      })
    })?
    .collect::<Result<Vec<_>, _>>()?;

  Ok(OwnerCapitalEventPage {
    items,
    total,
    page,
    page_size,
  })
}
