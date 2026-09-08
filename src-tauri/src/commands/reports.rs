//! Report Center — read-only aggregates from ledger / hawala / trading (no duplicate stores).

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;
use chrono::Datelike;

use crate::commands::owner_capital::{compute_owner_capital_snapshot, CapitalCurrencyBreakdown};
use crate::error::AppError;
use crate::ledger::{
  find_currency_by_code, money_from_major_units, post_transaction, PostTransactionInput,
  PostedTransaction, PostingLineDto,
};
use crate::state::AppState;
use crate::util::format_f64;
use crate::commands::authorize::{require_screen};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BusinessPositionReport {
  pub as_of: String,
  pub total_cash: String,
  pub customer_money: String,
  pub partner_money: String,
  pub owner_money: String,
  pub pending_hawalas: String,
  pub receivables: String,
  pub payables: String,
  pub net_business_worth: String,
  pub trading_inventory: String,
  pub by_currency: Vec<CapitalCurrencyBreakdown>,
}

#[tauri::command]
pub fn get_business_position_report(
  state: State<'_, AppState>,
) -> Result<BusinessPositionReport, AppError> {
  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "reports")?;
  let snap = compute_owner_capital_snapshot(&conn, None)?;
  Ok(BusinessPositionReport {
    as_of: snap.as_of,
    total_cash: snap.total_cash.clone(),
    customer_money: snap.total_customer_funds.clone(),
    partner_money: snap.total_partner_payable.clone(),
    owner_money: snap.total_owner_capital.clone(),
    pending_hawalas: snap.total_pending_hawala.clone(),
    receivables: snap.total_partner_receivable.clone(),
    payables: snap.total_partner_payable.clone(),
    net_business_worth: snap.total_owner_capital.clone(),
    trading_inventory: snap.total_trading_inventory.clone(),
    by_currency: snap.by_currency,
  })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CurrencyOwnershipRow {
  pub currency_code: String,
  pub currency_symbol: Option<String>,
  pub cash_in_vault: String,
  pub customer_funds: String,
  pub partner_funds: String,
  pub owner_funds: String,
  pub pending_hawala: String,
  pub receivable: String,
  pub payable: String,
  pub available_balance: String,
}

#[tauri::command]
pub fn get_currency_ownership_report(
  state: State<'_, AppState>,
) -> Result<Vec<CurrencyOwnershipRow>, AppError> {
  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "reports")?;
  let snap = compute_owner_capital_snapshot(&conn, None)?;
  Ok(
    snap
      .by_currency
      .into_iter()
      .map(|r| {
        let cash: f64 = r
          .main_vault_cash
          .parse()
          .ok()
          .or_else(|| r.cash.parse().ok())
          .unwrap_or(0.0);
        let customer: f64 = r.customer_funds.parse().unwrap_or(0.0);
        let payable: f64 = r.partner_payable.parse().unwrap_or(0.0);
        let pending: f64 = r.pending_hawala.parse().unwrap_or(0.0);
        let available = cash - customer - payable - pending;
        CurrencyOwnershipRow {
          currency_code: r.currency_code,
          currency_symbol: r.currency_symbol,
          cash_in_vault: r.main_vault_cash,
          customer_funds: r.customer_funds,
          partner_funds: r.partner_payable.clone(),
          owner_funds: r.owner_capital,
          pending_hawala: r.pending_hawala,
          receivable: r.partner_receivable,
          payable: r.partner_payable,
          available_balance: format_f64(available),
        }
      })
      .collect(),
  )
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportFilterInput {
  pub date_from: Option<String>,
  pub date_to: Option<String>,
  pub currency_code: Option<String>,
  pub customer_id: Option<String>,
  pub partner_id: Option<String>,
  #[allow(dead_code)]
  pub user_id: Option<String>,
  pub search: Option<String>,
  pub page: Option<i64>,
  pub page_size: Option<i64>,
  /// Partner Sarafi report: page for the by-partner table.
  pub partners_page: Option<i64>,
  /// Partner Sarafi report: page for open-commission rows.
  pub commission_page: Option<i64>,
  /// Hawala: SEND | RECEIVE
  pub direction: Option<String>,
  /// Exact/partial reference number filter
  pub reference: Option<String>,
  /// Exchange: currency given (from)
  pub from_currency_code: Option<String>,
  /// Exchange: currency received (to)
  pub to_currency_code: Option<String>,
  /// Transaction status filter (e.g. POSTED)
  pub status: Option<String>,
  /// Match ledger amount (major units), e.g. "100" or "100.50"
  pub amount: Option<String>,
}

fn clamp_page(page: Option<i64>, page_size: Option<i64>, total: i64) -> (i64, i64, i64) {
  let page_size = page_size.unwrap_or(20).clamp(1, 200);
  let mut page = page.unwrap_or(1).max(1);
  let total_pages = if total <= 0 {
    1
  } else {
    (total + page_size - 1) / page_size
  };
  if page > total_pages {
    page = total_pages;
  }
  let offset = (page - 1) * page_size;
  (page, page_size, offset)
}

fn date_bounds(input: &ReportFilterInput) -> (String, String) {
  let from = input
    .date_from
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .unwrap_or("1970-01-01")
    .to_string();
  let to = input
    .date_to
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(|s| s.to_string())
    .unwrap_or_else(|| chrono::Local::now().format("%Y-%m-%d").to_string());
  (from, to)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PeriodSummaryReport {
  pub date_from: String,
  pub date_to: String,
  pub deposits: i64,
  pub withdrawals: i64,
  pub transfers: i64,
  pub exchanges: i64,
  pub hawalas: i64,
  pub trades: i64,
  pub adjustments: i64,
  pub total_transactions: i64,
  pub trading_profit: String,
  pub hawala_own_commission: String,
}

#[tauri::command]
pub fn get_period_summary_report(
  state: State<'_, AppState>,
  input: ReportFilterInput,
) -> Result<PeriodSummaryReport, AppError> {
  let (from, to) = date_bounds(&input);
  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "reports")?;

  let count_type = |conn: &Connection, ty: &str| -> Result<i64, AppError> {
    Ok(conn.query_row(
      r#"SELECT COUNT(*) FROM "Transaction"
         WHERE deletedAt IS NULL AND type = ?1
           AND valueDate >= ?2 AND valueDate < date(?3, '+1 day')"#,
      params![ty, from, to],
      |row| row.get(0),
    )?)
  };

  let deposits = count_type(&conn, "DEPOSIT")?;
  let withdrawals = count_type(&conn, "WITHDRAWAL")?;
  let transfers = count_type(&conn, "TRANSFER")?;
  let exchanges = count_type(&conn, "EXCHANGE")?;
  let hawalas = count_type(&conn, "HAWALA")?;
  let adjustments = count_type(&conn, "ADJUSTMENT")?;
  let trade_buy = count_type(&conn, "TRADE_BUY")?;
  let trade_sell = count_type(&conn, "TRADE_SELL")?;
  let trades = trade_buy + trade_sell;
  let total = deposits + withdrawals + transfers + exchanges + hawalas + adjustments + trades;

  let trading_profit: f64 = {
    let exists: bool = conn.query_row(
      "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='TradingTrade')",
      [],
      |row| row.get(0),
    )?;
    if exists {
      conn.query_row(
        r#"SELECT COALESCE(SUM(CAST(grossProfit AS REAL)),0)
           FROM TradingTrade
           WHERE deletedAt IS NULL AND direction='SELL'
             AND valueDate >= ?1 AND valueDate < date(?2, '+1 day')"#,
        params![from, to],
        |row| row.get(0),
      )?
    } else {
      0.0
    }
  };

  let hawala_own: f64 = conn.query_row(
    r#"SELECT COALESCE(SUM(CAST(ownCommissionAmount AS REAL)),0)
       FROM HawalaTransfer
       WHERE deletedAt IS NULL
         AND valueDate >= ?1 AND valueDate < date(?2, '+1 day')"#,
    params![from, to],
    |row| row.get(0),
  )?;

  Ok(PeriodSummaryReport {
    date_from: from,
    date_to: to,
    deposits,
    withdrawals,
    transfers,
    exchanges,
    hawalas,
    trades,
    adjustments,
    total_transactions: total,
    trading_profit: format_f64(trading_profit),
    hawala_own_commission: format_f64(hawala_own),
  })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfitLossReport {
  pub date_from: String,
  pub date_to: String,
  pub exchange_count: i64,
  pub trading_sell_count: i64,
  pub hawala_count: i64,
  pub expense_count: i64,
  pub employee_salary_count: i64,
  pub exchange_profit: Vec<ReportCurrencyAmount>,
  pub trading_profit: Vec<ReportCurrencyAmount>,
  pub hawala_commission: Vec<ReportCurrencyAmount>,
  pub employee_salary: Vec<ReportCurrencyAmount>,
  pub other_expenses: Vec<ReportCurrencyAmount>,
  pub expenses: Vec<ReportCurrencyAmount>,
  pub income_total: Vec<ReportCurrencyAmount>,
  pub net_profit: Vec<ReportCurrencyAmount>,
}

fn currency_amounts_from_map(
  conn: &Connection,
  map: &std::collections::HashMap<String, f64>,
) -> Result<Vec<ReportCurrencyAmount>, AppError> {
  let mut rows = Vec::new();
  for (cid, amt) in map {
    if amt.abs() <= 1e-9 {
      continue;
    }
    let (code, symbol): (String, Option<String>) = conn.query_row(
      "SELECT code, symbol FROM Currency WHERE id=?1",
      [cid],
      |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    rows.push((code, symbol, *amt));
  }
  rows.sort_by(|a, b| a.0.cmp(&b.0));
  Ok(
    rows
      .into_iter()
      .map(|(currency_code, currency_symbol, amount)| ReportCurrencyAmount {
        currency_code,
        currency_symbol,
        amount: format_f64(amount),
      })
      .collect(),
  )
}

fn filter_report_currency(
  rows: Vec<ReportCurrencyAmount>,
  code: &Option<String>,
) -> Vec<ReportCurrencyAmount> {
  let needle = code
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(|s| s.to_ascii_uppercase());
  match needle {
    None => rows,
    Some(code) => rows
      .into_iter()
      .filter(|r| r.currency_code.eq_ignore_ascii_case(&code))
      .collect(),
  }
}

fn add_currency_amounts(
  into: &mut std::collections::HashMap<String, f64>,
  rows: &[(String, f64)],
) {
  for (cid, amt) in rows {
    *into.entry(cid.clone()).or_insert(0.0) += *amt;
  }
}

#[tauri::command]
pub fn get_profit_loss_report(
  state: State<'_, AppState>,
  input: ReportFilterInput,
) -> Result<ProfitLossReport, AppError> {
  let (from, to) = date_bounds(&input);
  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "reports")?;

  let (exchange_count, exchange_profit) = exchange_profit_by_currency(&conn, &from, &to)?;

  let mut trading_map: std::collections::HashMap<String, f64> = std::collections::HashMap::new();
  let mut trading_sell_count: i64 = 0;
  let trade_exists: bool = conn.query_row(
    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='TradingTrade')",
    [],
    |row| row.get(0),
  )?;
  if trade_exists {
    trading_sell_count = conn.query_row(
      r#"SELECT COUNT(*) FROM TradingTrade
         WHERE deletedAt IS NULL AND direction='SELL'
           AND valueDate >= ?1 AND valueDate < date(?2, '+1 day')"#,
      params![from, to],
      |row| row.get(0),
    )?;
    let mut stmt = conn.prepare(
      r#"SELECT paymentCurrencyId, COALESCE(SUM(CAST(grossProfit AS REAL)), 0)
         FROM TradingTrade
         WHERE deletedAt IS NULL AND direction='SELL'
           AND valueDate >= ?1 AND valueDate < date(?2, '+1 day')
         GROUP BY paymentCurrencyId"#,
    )?;
    for row in stmt.query_map(params![from, to], |row| {
      Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
    })? {
      let (cid, amt) = row?;
      if amt.abs() > 1e-9 {
        trading_map.insert(cid, amt);
      }
    }
  }

  let mut commission_map: std::collections::HashMap<String, f64> = std::collections::HashMap::new();
  let hawala_count: i64 = conn.query_row(
    r#"SELECT COUNT(*) FROM HawalaTransfer
       WHERE deletedAt IS NULL
         AND valueDate >= ?1 AND valueDate < date(?2, '+1 day')
         AND CAST(COALESCE(ownCommissionAmount, 0) AS REAL) != 0"#,
    params![from, to],
    |row| row.get(0),
  )?;
  {
    let mut stmt = conn.prepare(
      r#"SELECT currencyId, COALESCE(SUM(CAST(ownCommissionAmount AS REAL)), 0)
         FROM HawalaTransfer
         WHERE deletedAt IS NULL
           AND valueDate >= ?1 AND valueDate < date(?2, '+1 day')
         GROUP BY currencyId"#,
    )?;
    for row in stmt.query_map(params![from, to], |row| {
      Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
    })? {
      let (cid, amt) = row?;
      if amt.abs() > 1e-9 {
        commission_map.insert(cid, amt);
      }
    }
  }

  let mut expense_map: std::collections::HashMap<String, f64> = std::collections::HashMap::new();
  let expense_count: i64 = conn.query_row(
    r#"SELECT COUNT(DISTINCT t.id)
       FROM Wallet w
       INNER JOIN LedgerEntry le ON le.walletId = w.id
       INNER JOIN "Transaction" t ON t.id = le.transactionId AND t.deletedAt IS NULL
       WHERE w.type = 'SYSTEM' AND w.deletedAt IS NULL
         AND t.valueDate >= ?1 AND t.valueDate < date(?2, '+1 day')
         AND (t.type = 'EXPENSE' OR t.type = 'ADJUSTMENT')
         AND (
           LOWER(w.name) LIKE '%expense%'
           OR LOWER(w.name) LIKE '%rent%'
           OR LOWER(w.name) LIKE '%salary%'
           OR LOWER(w.name) LIKE '%utility%'
           OR LOWER(w.name) LIKE '%transport%'
           OR LOWER(w.name) LIKE '%office%'
         )"#,
    params![from, to],
    |row| row.get(0),
  )?;
  {
    let mut stmt = conn.prepare(
      r#"SELECT c.id,
                COALESCE(SUM(CAST(le.amount AS REAL)), 0)
         FROM Wallet w
         INNER JOIN LedgerEntry le ON le.walletId = w.id
         INNER JOIN "Transaction" t ON t.id = le.transactionId AND t.deletedAt IS NULL
         INNER JOIN Currency c ON c.id = le.currencyId
         WHERE w.type = 'SYSTEM' AND w.deletedAt IS NULL
           AND t.valueDate >= ?1 AND t.valueDate < date(?2, '+1 day')
           AND (t.type = 'EXPENSE' OR t.type = 'ADJUSTMENT')
           AND (
             LOWER(w.name) LIKE '%expense%'
             OR LOWER(w.name) LIKE '%rent%'
             OR LOWER(w.name) LIKE '%salary%'
             OR LOWER(w.name) LIKE '%utility%'
             OR LOWER(w.name) LIKE '%transport%'
             OR LOWER(w.name) LIKE '%office%'
           )
         GROUP BY c.id"#,
    )?;
    for row in stmt.query_map(params![from, to], |row| {
      Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
    })? {
      let (cid, amt) = row?;
      let amt = amt.abs();
      if amt > 1e-9 {
        expense_map.insert(cid, amt);
      }
    }
  }

  let mut salary_map: std::collections::HashMap<String, f64> = std::collections::HashMap::new();
  let mut employee_salary_count: i64 = 0;
  let salary_table: bool = conn.query_row(
    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='EmployeeSalaryPayment')",
    [],
    |row| row.get(0),
  )?;
  if salary_table {
    employee_salary_count = conn.query_row(
      r#"SELECT COUNT(*) FROM EmployeeSalaryPayment
         WHERE valueDate >= ?1 AND valueDate < date(?2, '+1 day')"#,
      params![from, to],
      |row| row.get(0),
    )?;
    let mut stmt = conn.prepare(
      r#"SELECT currencyId, COALESCE(SUM(CAST(amount AS REAL)), 0)
         FROM EmployeeSalaryPayment
         WHERE valueDate >= ?1 AND valueDate < date(?2, '+1 day')
         GROUP BY currencyId"#,
    )?;
    for row in stmt.query_map(params![from, to], |row| {
      Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
    })? {
      let (cid, amt) = row?;
      if amt.abs() > 1e-9 {
        salary_map.insert(cid, amt);
      }
    }
  }

  let mut other_expense_map = expense_map.clone();
  for (cid, sal) in &salary_map {
    let entry = other_expense_map.entry(cid.clone()).or_insert(0.0);
    *entry = (*entry - sal).max(0.0);
    if entry.abs() <= 1e-9 {
      other_expense_map.remove(cid);
    }
  }

  // Build income / net maps keyed by currency id. Exchange profit uses currency codes already —
  // convert exchange_profit list into a temp map via code lookup.
  let mut income_map: std::collections::HashMap<String, f64> = std::collections::HashMap::new();
  let mut exchange_pairs: Vec<(String, f64)> = Vec::new();
  for row in &exchange_profit {
    let cid: Option<String> = conn
      .query_row(
        "SELECT id FROM Currency WHERE code = ?1 AND deletedAt IS NULL LIMIT 1",
        [&row.currency_code],
        |r| r.get(0),
      )
      .optional()?;
    let Some(cid) = cid else { continue };
    let amt = row.amount.replace(',', "").parse::<f64>().unwrap_or(0.0);
    exchange_pairs.push((cid, amt));
  }
  add_currency_amounts(&mut income_map, &exchange_pairs);
  add_currency_amounts(
    &mut income_map,
    &trading_map
      .iter()
      .map(|(k, v)| (k.clone(), *v))
      .collect::<Vec<_>>(),
  );
  add_currency_amounts(
    &mut income_map,
    &commission_map
      .iter()
      .map(|(k, v)| (k.clone(), *v))
      .collect::<Vec<_>>(),
  );

  let mut net_map = income_map.clone();
  for (cid, exp) in &expense_map {
    *net_map.entry(cid.clone()).or_insert(0.0) -= *exp;
  }

  let trading_profit = filter_report_currency(
    currency_amounts_from_map(&conn, &trading_map)?,
    &input.currency_code,
  );
  let hawala_commission = filter_report_currency(
    currency_amounts_from_map(&conn, &commission_map)?,
    &input.currency_code,
  );
  let employee_salary = filter_report_currency(
    currency_amounts_from_map(&conn, &salary_map)?,
    &input.currency_code,
  );
  let other_expenses = filter_report_currency(
    currency_amounts_from_map(&conn, &other_expense_map)?,
    &input.currency_code,
  );
  let expenses = filter_report_currency(
    currency_amounts_from_map(&conn, &expense_map)?,
    &input.currency_code,
  );
  let income_total = filter_report_currency(
    currency_amounts_from_map(&conn, &income_map)?,
    &input.currency_code,
  );
  let net_profit = filter_report_currency(
    currency_amounts_from_map(&conn, &net_map)?,
    &input.currency_code,
  );
  let exchange_profit = filter_report_currency(exchange_profit, &input.currency_code);

  Ok(ProfitLossReport {
    date_from: from,
    date_to: to,
    exchange_count,
    trading_sell_count,
    hawala_count,
    expense_count,
    employee_salary_count,
    exchange_profit,
    trading_profit,
    hawala_commission,
    employee_salary,
    other_expenses,
    expenses,
    income_total,
    net_profit,
  })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CashByCurrencyRow {
  pub currency_code: String,
  pub currency_symbol: Option<String>,
  pub balance: String,
  pub vault_balance: String,
  pub till_balance: String,
}

#[tauri::command]
pub fn get_cash_by_currency_report(
  state: State<'_, AppState>,
) -> Result<Vec<CashByCurrencyRow>, AppError> {
  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "reports")?;
  cash_balances_now(&conn)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerBalanceReportRow {
  pub customer_id: String,
  pub customer_code: Option<String>,
  pub customer_name: String,
  pub phone: Option<String>,
  pub currency_code: String,
  pub balance: String,
}

#[tauri::command]
pub fn get_customer_balance_report(
  state: State<'_, AppState>,
  input: ReportFilterInput,
) -> Result<Vec<CustomerBalanceReportRow>, AppError> {
  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "reports")?;
  let search = input
    .search
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(|s| format!("%{s}%"));
  let currency = input
    .currency_code
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(|s| s.to_ascii_uppercase());

  let mut sql = String::from(
    r#"SELECT c.id, c.code, c.fullName, c.phone, cur.code,
              CAST(COALESCE(SUM(CASE WHEN le.direction='DEBIT' THEN CAST(le.amount AS REAL)
                                     ELSE -CAST(le.amount AS REAL) END), 0) AS TEXT)
       FROM Customer c
       INNER JOIN Wallet w ON w.customerId = c.id AND w.type='CUSTOMER'
         AND w.deletedAt IS NULL AND w.isActive = 1
       INNER JOIN LedgerEntry le ON le.walletId = w.id
       INNER JOIN "Transaction" t ON t.id = le.transactionId AND t.deletedAt IS NULL
       INNER JOIN Currency cur ON cur.id = le.currencyId AND cur.deletedAt IS NULL
       WHERE c.deletedAt IS NULL"#,
  );
  let mut params_v: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
  if let Some(ref s) = search {
    sql.push_str(" AND (c.fullName LIKE ? OR IFNULL(c.code,'') LIKE ? OR IFNULL(c.phone,'') LIKE ?)");
    params_v.push(Box::new(s.clone()));
    params_v.push(Box::new(s.clone()));
    params_v.push(Box::new(s.clone()));
  }
  if let Some(ref code) = currency {
    sql.push_str(" AND cur.code = ?");
    params_v.push(Box::new(code.clone()));
  }
  if let Some(ref cid) = input.customer_id {
    let cid = cid.trim();
    if !cid.is_empty() {
      sql.push_str(" AND c.id = ?");
      params_v.push(Box::new(cid.to_string()));
    }
  }
  sql.push_str(
    r#" GROUP BY c.id, c.code, c.fullName, c.phone, cur.code
        HAVING ABS(COALESCE(SUM(CASE WHEN le.direction='DEBIT' THEN CAST(le.amount AS REAL)
                                     ELSE -CAST(le.amount AS REAL) END), 0)) > 1e-9
        ORDER BY c.fullName, cur.code
        LIMIT 500"#,
  );
  let refs: Vec<&dyn rusqlite::types::ToSql> = params_v.iter().map(|p| p.as_ref()).collect();
  let mut stmt = conn.prepare(&sql)?;
  let rows = stmt
    .query_map(refs.as_slice(), |row| {
      Ok(CustomerBalanceReportRow {
        customer_id: row.get(0)?,
        customer_code: row.get(1)?,
        customer_name: row.get(2)?,
        phone: row.get(3)?,
        currency_code: row.get(4)?,
        balance: row.get(5)?,
      })
    })?
    .collect::<Result<Vec<_>, _>>()?;
  Ok(rows)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HawalaReportRow {
  pub id: String,
  pub transaction_id: Option<String>,
  pub reference: String,
  pub display_ref: String,
  pub direction: String,
  pub status: String,
  pub amount: String,
  pub currency_code: String,
  pub customer_id: Option<String>,
  pub customer_name: Option<String>,
  pub sender_name: Option<String>,
  pub receiver_name: Option<String>,
  pub partner_name: Option<String>,
  pub destination_city: Option<String>,
  pub destination_country: Option<String>,
  pub own_commission: Option<String>,
  pub partner_commission: Option<String>,
  pub value_date: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HawalaReportPage {
  pub items: Vec<HawalaReportRow>,
  pub total: i64,
  pub page: i64,
  pub page_size: i64,
  pub sent_count: i64,
  pub received_count: i64,
  pub totals_by_currency: Vec<ReportCurrencyAmount>,
  pub sent_totals: Vec<ReportCurrencyAmount>,
  pub received_totals: Vec<ReportCurrencyAmount>,
}

fn hawala_amount_totals(
  conn: &Connection,
  where_sql: &str,
  base_params: &[String],
  direction: Option<&str>,
) -> Result<(i64, Vec<ReportCurrencyAmount>), AppError> {
  let mut count_sql = format!(
    r#"SELECT COUNT(*) FROM HawalaTransfer h
       INNER JOIN Currency cur ON cur.id = h.currencyId
       LEFT JOIN Customer cust ON cust.id = h.customerId
       LEFT JOIN PartnerSarafi p ON p.id = h.partnerSarafiId
       LEFT JOIN "Transaction" t ON t.id = h.transactionId
       {where_sql}"#
  );
  let mut params: Vec<String> = base_params.to_vec();
  if let Some(d) = direction {
    count_sql.push_str(" AND h.direction = ?");
    params.push(d.to_string());
  }
  let count_refs: Vec<&dyn rusqlite::types::ToSql> = params
    .iter()
    .map(|p| p as &dyn rusqlite::types::ToSql)
    .collect();
  let count: i64 = conn.query_row(&count_sql, count_refs.as_slice(), |row| row.get(0))?;

  let mut sum_sql = format!(
    r#"SELECT c.code, c.symbol, COALESCE(SUM(CAST(h.amount AS REAL)), 0)
       FROM HawalaTransfer h
       INNER JOIN Currency c ON c.id = h.currencyId
       LEFT JOIN Customer cust ON cust.id = h.customerId
       LEFT JOIN PartnerSarafi p ON p.id = h.partnerSarafiId
       LEFT JOIN "Transaction" t ON t.id = h.transactionId
       {where_sql}"#
  );
  let mut sum_params: Vec<String> = base_params.to_vec();
  if let Some(d) = direction {
    sum_sql.push_str(" AND h.direction = ?");
    sum_params.push(d.to_string());
  }
  sum_sql.push_str(
    " GROUP BY c.code, c.symbol HAVING ABS(COALESCE(SUM(CAST(h.amount AS REAL)), 0)) > 1e-9 ORDER BY c.code",
  );
  let sum_refs: Vec<&dyn rusqlite::types::ToSql> = sum_params
    .iter()
    .map(|p| p as &dyn rusqlite::types::ToSql)
    .collect();
  let mut stmt = conn.prepare(&sum_sql)?;
  let amounts = stmt
    .query_map(sum_refs.as_slice(), |row| {
      Ok(ReportCurrencyAmount {
        currency_code: row.get(0)?,
        currency_symbol: row.get(1)?,
        amount: format_f64(row.get::<_, f64>(2)?),
      })
    })?
    .collect::<Result<Vec<_>, _>>()?;
  Ok((count, amounts))
}

#[tauri::command]
pub fn get_hawala_status_report(
  state: State<'_, AppState>,
  input: ReportFilterInput,
  status: Option<String>,
) -> Result<HawalaReportPage, AppError> {
  let (from, to) = date_bounds(&input);
  let page_size = input.page_size.unwrap_or(50).clamp(1, 200);
  let mut page = input.page.unwrap_or(1).max(1);
  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "reports")?;

  let mut where_sql = String::from(
    "WHERE h.deletedAt IS NULL AND h.valueDate >= ?1 AND h.valueDate < date(?2, '+1 day')",
  );
  let mut params_s: Vec<String> = vec![from.clone(), to.clone()];

  if let Some(ref st) = status {
    let st = st.trim().to_ascii_uppercase();
    if !st.is_empty() && st != "ALL" {
      where_sql.push_str(" AND h.status = ?");
      params_s.push(st);
    }
  }
  if let Some(ref dir) = input.direction {
    let dir = dir.trim().to_ascii_uppercase();
    if dir == "SEND" || dir == "RECEIVE" {
      where_sql.push_str(" AND h.direction = ?");
      params_s.push(dir);
    }
  }
  if let Some(ref code) = input.currency_code {
    let code = code.trim().to_ascii_uppercase();
    if !code.is_empty() && code != "ALL" {
      where_sql.push_str(" AND cur.code = ?");
      params_s.push(code);
    }
  }
  if let Some(ref cid) = input.customer_id {
    let cid = cid.trim();
    if !cid.is_empty() {
      where_sql.push_str(
        " AND (h.customerId = ? OR h.senderCustomerId = ? OR h.receiverCustomerId = ?)",
      );
      params_s.push(cid.to_string());
      params_s.push(cid.to_string());
      params_s.push(cid.to_string());
    }
  }
  if let Some(ref pid) = input.partner_id {
    let pid = pid.trim().to_string();
    if !pid.is_empty() {
      where_sql.push_str(" AND h.partnerSarafiId = ?");
      params_s.push(pid);
    }
  }
  if let Some(ref reference) = input.reference {
    let reference = reference.trim();
    if !reference.is_empty() {
      where_sql.push_str(" AND (h.reference LIKE ? OR IFNULL(t.displayRef,'') LIKE ? OR IFNULL(t.reference,'') LIKE ?)");
      params_s.push(format!("%{reference}%"));
      params_s.push(format!("%{reference}%"));
      params_s.push(format!("%{reference}%"));
    }
  }
  if let Some(ref q) = input.search {
    let q = q.trim();
    if !q.is_empty() {
      let like = format!("%{q}%");
      where_sql.push_str(
        " AND (h.reference LIKE ? OR IFNULL(t.displayRef,'') LIKE ? OR IFNULL(t.reference,'') LIKE ? OR IFNULL(h.senderName,'') LIKE ? OR IFNULL(h.receiverName,'') LIKE ? OR IFNULL(cust.fullName,'') LIKE ?)",
      );
      params_s.push(like.clone());
      params_s.push(like.clone());
      params_s.push(like.clone());
      params_s.push(like.clone());
      params_s.push(like.clone());
      params_s.push(like);
    }
  }

  let count_sql = format!(
    "SELECT COUNT(*) FROM HawalaTransfer h
     INNER JOIN Currency cur ON cur.id = h.currencyId
     LEFT JOIN Customer cust ON cust.id = h.customerId
     LEFT JOIN PartnerSarafi p ON p.id = h.partnerSarafiId
     LEFT JOIN \"Transaction\" t ON t.id = h.transactionId
     {where_sql}"
  );
  let count_refs: Vec<&dyn rusqlite::types::ToSql> = params_s
    .iter()
    .map(|p| p as &dyn rusqlite::types::ToSql)
    .collect();
  let total: i64 = conn.query_row(&count_sql, count_refs.as_slice(), |row| row.get(0))?;
  let total_pages = if total == 0 {
    1
  } else {
    (total + page_size - 1) / page_size
  };
  if page > total_pages {
    page = total_pages;
  }
  let offset = (page - 1) * page_size;

  let (sent_count, sent_totals) =
    hawala_amount_totals(&conn, &where_sql, &params_s, Some("SEND"))?;
  let (received_count, received_totals) =
    hawala_amount_totals(&conn, &where_sql, &params_s, Some("RECEIVE"))?;
  let (_all_count, totals_by_currency) =
    hawala_amount_totals(&conn, &where_sql, &params_s, None)?;

  let hawala_chrono = crate::ledger::HAWALA_CHRONO_ASC;
  let list_sql = format!(
    r#"SELECT h.id, h.transactionId, h.reference, IFNULL(t.displayRef,''), h.direction, h.status, CAST(h.amount AS TEXT), cur.code,
              h.customerId, cust.fullName, h.senderName, h.receiverName,
              COALESCE(p.name, h.partnerSarafi), h.destinationCity, h.destinationCountry,
              CAST(h.ownCommissionAmount AS TEXT), CAST(h.commissionAmount AS TEXT), h.valueDate
       FROM HawalaTransfer h
       INNER JOIN Currency cur ON cur.id = h.currencyId
       LEFT JOIN Customer cust ON cust.id = h.customerId
       LEFT JOIN PartnerSarafi p ON p.id = h.partnerSarafiId
       LEFT JOIN "Transaction" t ON t.id = h.transactionId
       {where_sql}
       ORDER BY {hawala_chrono}
       LIMIT ? OFFSET ?"#
  );
  let mut list_params: Vec<Box<dyn rusqlite::types::ToSql>> = params_s
    .iter()
    .map(|s| Box::new(s.clone()) as Box<dyn rusqlite::types::ToSql>)
    .collect();
  list_params.push(Box::new(page_size));
  list_params.push(Box::new(offset));
  let list_refs: Vec<&dyn rusqlite::types::ToSql> =
    list_params.iter().map(|p| p.as_ref()).collect();
  let mut stmt = conn.prepare(&list_sql)?;
  let items = stmt
    .query_map(list_refs.as_slice(), |row| {
      Ok(HawalaReportRow {
        id: row.get(0)?,
        transaction_id: row.get(1)?,
        reference: row.get(2)?,
        display_ref: row.get(3)?,
        direction: row.get(4)?,
        status: row.get(5)?,
        amount: row.get(6)?,
        currency_code: row.get(7)?,
        customer_id: row.get(8)?,
        customer_name: row.get(9)?,
        sender_name: row.get(10)?,
        receiver_name: row.get(11)?,
        partner_name: row.get(12)?,
        destination_city: row.get(13)?,
        destination_country: row.get(14)?,
        own_commission: row.get(15)?,
        partner_commission: row.get(16)?,
        value_date: row.get(17)?,
      })
    })?
    .collect::<Result<Vec<_>, _>>()?;

  Ok(HawalaReportPage {
    items,
    total,
    page,
    page_size,
    sent_count,
    received_count,
    totals_by_currency,
    sent_totals,
    received_totals,
  })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TradingPerformanceReport {
  pub date_from: String,
  pub date_to: String,
  pub buys: i64,
  pub sells: i64,
  pub gross_profit: String,
  pub inventory_positions: i64,
  pub inventory_cost_value: String,
}

#[tauri::command]
pub fn get_trading_performance_report(
  state: State<'_, AppState>,
  input: ReportFilterInput,
) -> Result<TradingPerformanceReport, AppError> {
  let (from, to) = date_bounds(&input);
  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "reports")?;
  let exists: bool = conn.query_row(
    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='TradingTrade')",
    [],
    |row| row.get(0),
  )?;
  if !exists {
    return Ok(TradingPerformanceReport {
      date_from: from,
      date_to: to,
      buys: 0,
      sells: 0,
      gross_profit: "0".into(),
      inventory_positions: 0,
      inventory_cost_value: "0".into(),
    });
  }
  let buys: i64 = conn.query_row(
    r#"SELECT COUNT(*) FROM TradingTrade
       WHERE deletedAt IS NULL AND direction='BUY'
         AND valueDate >= ?1 AND valueDate < date(?2, '+1 day')"#,
    params![from, to],
    |row| row.get(0),
  )?;
  let sells: i64 = conn.query_row(
    r#"SELECT COUNT(*) FROM TradingTrade
       WHERE deletedAt IS NULL AND direction='SELL'
         AND valueDate >= ?1 AND valueDate < date(?2, '+1 day')"#,
    params![from, to],
    |row| row.get(0),
  )?;
  let profit: f64 = conn.query_row(
    r#"SELECT COALESCE(SUM(CAST(grossProfit AS REAL)),0) FROM TradingTrade
       WHERE deletedAt IS NULL AND direction='SELL'
         AND valueDate >= ?1 AND valueDate < date(?2, '+1 day')"#,
    params![from, to],
    |row| row.get(0),
  )?;
  let positions: i64 = conn.query_row(
    r#"SELECT COUNT(*) FROM TradingInventory WHERE ABS(CAST(quantity AS REAL)) > 0"#,
    [],
    |row| row.get(0),
  )?;
  let cost: f64 = conn.query_row(
    r#"SELECT COALESCE(SUM(CAST(costValue AS REAL)),0) FROM TradingInventory
       WHERE ABS(CAST(quantity AS REAL)) > 0"#,
    [],
    |row| row.get(0),
  )?;
  Ok(TradingPerformanceReport {
    date_from: from,
    date_to: to,
    buys,
    sells,
    gross_profit: format_f64(profit),
    inventory_positions: positions,
    inventory_cost_value: format_f64(cost),
  })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PartnerBalanceReportRow {
  pub partner_id: String,
  pub partner_name: String,
  pub currency_code: String,
  pub payable: String,
  pub receivable: String,
  pub net: String,
}

#[tauri::command]
pub fn get_partner_balance_report(
  state: State<'_, AppState>,
) -> Result<Vec<PartnerBalanceReportRow>, AppError> {
  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "reports")?;
  partner_open_commission_rows(&conn, None)
}

fn partner_open_commission_rows(
  conn: &Connection,
  partner_filter: Option<&str>,
) -> Result<Vec<PartnerBalanceReportRow>, AppError> {
  let pid = partner_filter.unwrap_or("").to_string();
  let mut stmt = conn.prepare(
    r#"SELECT p.id, p.name, cur.id, cur.code,
              COALESCE(SUM(CASE WHEN h.commissionSide='PAYABLE'
                THEN CAST(h.commissionAmount AS REAL) ELSE 0 END), 0),
              COALESCE(SUM(CASE WHEN h.commissionSide='RECEIVABLE'
                THEN CAST(h.commissionAmount AS REAL) ELSE 0 END), 0)
       FROM PartnerSarafi p
       INNER JOIN HawalaTransfer h ON h.partnerSarafiId = p.id AND h.deletedAt IS NULL
         AND h.status IN ('SENT','RECEIVED','COMPLETED','PENDING') AND h.commissionAmount IS NOT NULL
       INNER JOIN Currency cur ON cur.id = COALESCE(h.commissionCurrencyId, h.currencyId)
       WHERE p.deletedAt IS NULL
         AND (?1 = '' OR p.id = ?1)
       GROUP BY p.id, p.name, cur.id, cur.code
       ORDER BY p.name, cur.code
       LIMIT 2000"#,
  )?;
  let gross: Vec<(String, String, String, String, f64, f64)> = stmt
    .query_map(params![pid], |row| {
      Ok((
        row.get::<_, String>(0)?,
        row.get::<_, String>(1)?,
        row.get::<_, String>(2)?,
        row.get::<_, String>(3)?,
        row.get::<_, f64>(4)?,
        row.get::<_, f64>(5)?,
      ))
    })?
    .collect::<Result<Vec<_>, _>>()?;

  let mut settled_pay: std::collections::HashMap<(String, String), f64> =
    std::collections::HashMap::new();
  let mut settled_recv: std::collections::HashMap<(String, String), f64> =
    std::collections::HashMap::new();
  let mut sstmt = conn.prepare(
    r#"SELECT partnerSarafiId, currencyId, kind,
              CAST(COALESCE(SUM(CAST(amount AS REAL)), 0) AS REAL)
       FROM PartnerCommissionSettlement
       WHERE deletedAt IS NULL
         AND UPPER(COALESCE(balanceType, 'COMMISSION')) = 'COMMISSION'
         AND (?1 = '' OR partnerSarafiId = ?1)
       GROUP BY partnerSarafiId, currencyId, kind"#,
  )?;
  let settled_rows = sstmt.query_map(params![pid], |row| {
    Ok((
      row.get::<_, String>(0)?,
      row.get::<_, String>(1)?,
      row.get::<_, String>(2)?,
      row.get::<_, f64>(3)?,
    ))
  })?;
  for item in settled_rows.flatten() {
    let (partner_id, currency_id, kind, amt) = item;
    let key = (partner_id, currency_id);
    let kind_u = kind.to_ascii_uppercase();
    if kind_u.contains("PAY") {
      *settled_pay.entry(key).or_insert(0.0) += amt;
    } else if kind_u.contains("COLLECT") {
      *settled_recv.entry(key).or_insert(0.0) += amt;
    }
  }

  let mut out = Vec::new();
  for (partner_id, partner_name, currency_id, currency_code, payable, receivable) in gross {
    let key = (partner_id.clone(), currency_id);
    let mut p = payable - settled_pay.get(&key).copied().unwrap_or(0.0);
    let mut r = receivable - settled_recv.get(&key).copied().unwrap_or(0.0);
    // Tit-for-tat netting (same as partner desk).
    if r < -1e-9 {
      p -= r;
      r = 0.0;
    }
    if p < -1e-9 {
      r -= p;
      p = 0.0;
    }
    p = p.max(0.0);
    r = r.max(0.0);
    let cleared = p.min(r);
    if cleared > 1e-9 {
      p -= cleared;
      r -= cleared;
    }
    if p.abs() <= 1e-9 && r.abs() <= 1e-9 {
      continue;
    }
    out.push(PartnerBalanceReportRow {
      partner_id,
      partner_name,
      currency_code,
      payable: format_f64(p),
      receivable: format_f64(r),
      net: format_f64(r - p),
    });
  }
  Ok(out)
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PartnerSarafiCurrencyBucket {
  pub currency_code: String,
  pub currency_symbol: Option<String>,
  pub amount: String,
  pub count: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PartnerSarafiPartnerRow {
  pub partner_id: String,
  pub partner_name: String,
  pub send_count: i64,
  pub receive_count: i64,
  pub send_totals: Vec<PartnerSarafiCurrencyBucket>,
  pub receive_totals: Vec<PartnerSarafiCurrencyBucket>,
  pub payment_totals: Vec<PartnerSarafiCurrencyBucket>,
  pub collection_totals: Vec<PartnerSarafiCurrencyBucket>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PartnerSarafiHawalaLine {
  pub id: String,
  pub partner_id: String,
  pub partner_name: String,
  pub reference: String,
  pub display_ref: String,
  pub direction: String,
  pub status: String,
  pub amount: String,
  pub currency_code: String,
  pub commission_amount: Option<String>,
  pub commission_side: Option<String>,
  pub value_date: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PartnerSarafiReport {
  pub date_from: String,
  pub date_to: String,
  pub partner_count: i64,
  pub send_count: i64,
  pub receive_count: i64,
  pub send_totals: Vec<PartnerSarafiCurrencyBucket>,
  pub receive_totals: Vec<PartnerSarafiCurrencyBucket>,
  pub payment_totals: Vec<PartnerSarafiCurrencyBucket>,
  pub collection_totals: Vec<PartnerSarafiCurrencyBucket>,
  /// Open commission balances (all-time, not date-filtered) — current page only.
  pub open_commission: Vec<PartnerBalanceReportRow>,
  pub open_commission_total: i64,
  pub open_commission_page: i64,
  /// By-partner activity rows — current page only.
  pub partners: Vec<PartnerSarafiPartnerRow>,
  pub partners_total: i64,
  pub partners_page: i64,
  pub hawalas: Vec<PartnerSarafiHawalaLine>,
  pub total_hawalas: i64,
  pub page: i64,
  pub page_size: i64,
}

fn partner_currency_buckets(
  conn: &Connection,
  sql: &str,
  params_s: &[&dyn rusqlite::types::ToSql],
) -> Result<Vec<PartnerSarafiCurrencyBucket>, AppError> {
  let mut stmt = conn.prepare(sql)?;
  let rows = stmt
    .query_map(params_s, |row| {
      Ok(PartnerSarafiCurrencyBucket {
        currency_code: row.get(0)?,
        currency_symbol: row.get(1)?,
        amount: format_f64(row.get::<_, f64>(2)?),
        count: row.get(3)?,
      })
    })?
    .collect::<Result<Vec<_>, _>>()?;
  Ok(rows)
}

#[tauri::command]
pub fn get_partner_sarafi_report(
  state: State<'_, AppState>,
  input: ReportFilterInput,
) -> Result<PartnerSarafiReport, AppError> {
  let (from, to) = date_bounds(&input);
  let page_size = input.page_size.unwrap_or(20).clamp(1, 200);
  let mut page = input.page.unwrap_or(1).max(1);
  let partners_page_req = input.partners_page;
  let commission_page_req = input.commission_page;
  let partner_filter = input
    .partner_id
    .as_ref()
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty());

  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "reports")?;

  // Global currency totals — one query per bucket (not per partner).
  let send_totals = {
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> =
      vec![Box::new("SEND".to_string()), Box::new(from.clone()), Box::new(to.clone())];
    let mut sql = String::from(
      r#"SELECT cur.code, cur.symbol,
                COALESCE(SUM(CAST(h.amount AS REAL)), 0),
                COUNT(*)
         FROM HawalaTransfer h
         INNER JOIN Currency cur ON cur.id = h.currencyId
         WHERE h.deletedAt IS NULL
           AND h.partnerSarafiId IS NOT NULL
           AND h.direction = ?1
           AND h.status NOT IN ('CANCELLED','RETURNED')
           AND h.valueDate >= ?2 AND h.valueDate < date(?3, '+1 day')"#,
    );
    if let Some(ref pid) = partner_filter {
      sql.push_str(" AND h.partnerSarafiId = ?4");
      params.push(Box::new(pid.clone()));
    }
    sql.push_str(
      " GROUP BY cur.code, cur.symbol
        HAVING ABS(COALESCE(SUM(CAST(h.amount AS REAL)), 0)) > 1e-9
        ORDER BY cur.code",
    );
    let refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    partner_currency_buckets(&conn, &sql, refs.as_slice())?
  };
  let receive_totals = {
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> =
      vec![Box::new("RECEIVE".to_string()), Box::new(from.clone()), Box::new(to.clone())];
    let mut sql = String::from(
      r#"SELECT cur.code, cur.symbol,
                COALESCE(SUM(CAST(h.amount AS REAL)), 0),
                COUNT(*)
         FROM HawalaTransfer h
         INNER JOIN Currency cur ON cur.id = h.currencyId
         WHERE h.deletedAt IS NULL
           AND h.partnerSarafiId IS NOT NULL
           AND h.direction = ?1
           AND h.status NOT IN ('CANCELLED','RETURNED')
           AND h.valueDate >= ?2 AND h.valueDate < date(?3, '+1 day')"#,
    );
    if let Some(ref pid) = partner_filter {
      sql.push_str(" AND h.partnerSarafiId = ?4");
      params.push(Box::new(pid.clone()));
    }
    sql.push_str(
      " GROUP BY cur.code, cur.symbol
        HAVING ABS(COALESCE(SUM(CAST(h.amount AS REAL)), 0)) > 1e-9
        ORDER BY cur.code",
    );
    let refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    partner_currency_buckets(&conn, &sql, refs.as_slice())?
  };
  let payment_totals = {
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> =
      vec![Box::new("%PAY%".to_string()), Box::new(from.clone()), Box::new(to.clone())];
    let mut sql = String::from(
      r#"SELECT cur.code, cur.symbol,
                COALESCE(SUM(CAST(s.amount AS REAL)), 0),
                COUNT(*)
         FROM PartnerCommissionSettlement s
         INNER JOIN Currency cur ON cur.id = s.currencyId
         WHERE s.deletedAt IS NULL
           AND UPPER(s.kind) LIKE ?1
           AND s.valueDate >= ?2 AND s.valueDate < date(?3, '+1 day')"#,
    );
    if let Some(ref pid) = partner_filter {
      sql.push_str(" AND s.partnerSarafiId = ?4");
      params.push(Box::new(pid.clone()));
    }
    sql.push_str(
      " GROUP BY cur.code, cur.symbol
        HAVING ABS(COALESCE(SUM(CAST(s.amount AS REAL)), 0)) > 1e-9
        ORDER BY cur.code",
    );
    let refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    partner_currency_buckets(&conn, &sql, refs.as_slice())?
  };
  let collection_totals = {
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> =
      vec![Box::new("%COLLECT%".to_string()), Box::new(from.clone()), Box::new(to.clone())];
    let mut sql = String::from(
      r#"SELECT cur.code, cur.symbol,
                COALESCE(SUM(CAST(s.amount AS REAL)), 0),
                COUNT(*)
         FROM PartnerCommissionSettlement s
         INNER JOIN Currency cur ON cur.id = s.currencyId
         WHERE s.deletedAt IS NULL
           AND UPPER(s.kind) LIKE ?1
           AND s.valueDate >= ?2 AND s.valueDate < date(?3, '+1 day')"#,
    );
    if let Some(ref pid) = partner_filter {
      sql.push_str(" AND s.partnerSarafiId = ?4");
      params.push(Box::new(pid.clone()));
    }
    sql.push_str(
      " GROUP BY cur.code, cur.symbol
        HAVING ABS(COALESCE(SUM(CAST(s.amount AS REAL)), 0)) > 1e-9
        ORDER BY cur.code",
    );
    let refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    partner_currency_buckets(&conn, &sql, refs.as_slice())?
  };

  let send_count_total: i64 = send_totals.iter().map(|b| b.count).sum();
  let receive_count_total: i64 = receive_totals.iter().map(|b| b.count).sum();

  // Partners with activity in the period — count then page.
  let mut active_where = String::from(
    r#"WHERE p.deletedAt IS NULL
         AND (
           EXISTS (
             SELECT 1 FROM HawalaTransfer h
             WHERE h.deletedAt IS NULL
               AND h.partnerSarafiId = p.id
               AND h.status NOT IN ('CANCELLED','RETURNED')
               AND h.valueDate >= ?1 AND h.valueDate < date(?2, '+1 day')
           )
           OR EXISTS (
             SELECT 1 FROM PartnerCommissionSettlement s
             WHERE s.deletedAt IS NULL
               AND s.partnerSarafiId = p.id
               AND s.valueDate >= ?1 AND s.valueDate < date(?2, '+1 day')
           )
         )"#,
  );
  let mut active_params: Vec<Box<dyn rusqlite::types::ToSql>> =
    vec![Box::new(from.clone()), Box::new(to.clone())];
  if let Some(ref pid) = partner_filter {
    active_where.push_str(" AND p.id = ?3");
    active_params.push(Box::new(pid.clone()));
  }

  let count_partners_sql = format!("SELECT COUNT(*) FROM PartnerSarafi p {active_where}");
  let count_refs: Vec<&dyn rusqlite::types::ToSql> =
    active_params.iter().map(|p| p.as_ref()).collect();
  let partners_total: i64 =
    conn.query_row(&count_partners_sql, count_refs.as_slice(), |row| row.get(0))?;
  let (partners_page, _, partners_offset) =
    clamp_page(partners_page_req, Some(page_size), partners_total);

  let list_partners_sql = format!(
    r#"SELECT p.id, p.name FROM PartnerSarafi p {active_where}
       ORDER BY p.name COLLATE NOCASE
       LIMIT ? OFFSET ?"#,
  );
  let mut list_partner_params = active_params;
  list_partner_params.push(Box::new(page_size));
  list_partner_params.push(Box::new(partners_offset));
  let list_partner_refs: Vec<&dyn rusqlite::types::ToSql> =
    list_partner_params.iter().map(|p| p.as_ref()).collect();
  let mut pstmt = conn.prepare(&list_partners_sql)?;
  let partner_page_list = pstmt
    .query_map(list_partner_refs.as_slice(), |row| {
      Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?
    .collect::<Result<Vec<_>, _>>()?;

  let hawala_totals_sql = r#"
    SELECT cur.code, cur.symbol,
           COALESCE(SUM(CAST(h.amount AS REAL)), 0),
           COUNT(*)
    FROM HawalaTransfer h
    INNER JOIN Currency cur ON cur.id = h.currencyId
    WHERE h.deletedAt IS NULL
      AND h.partnerSarafiId = ?1
      AND h.direction = ?2
      AND h.status NOT IN ('CANCELLED','RETURNED')
      AND h.valueDate >= ?3 AND h.valueDate < date(?4, '+1 day')
    GROUP BY cur.code, cur.symbol
    HAVING ABS(COALESCE(SUM(CAST(h.amount AS REAL)), 0)) > 1e-9
    ORDER BY cur.code"#;

  let settlement_sql = r#"
    SELECT cur.code, cur.symbol,
           COALESCE(SUM(CAST(s.amount AS REAL)), 0),
           COUNT(*)
    FROM PartnerCommissionSettlement s
    INNER JOIN Currency cur ON cur.id = s.currencyId
    WHERE s.deletedAt IS NULL
      AND s.partnerSarafiId = ?1
      AND UPPER(s.kind) LIKE ?2
      AND s.valueDate >= ?3 AND s.valueDate < date(?4, '+1 day')
    GROUP BY cur.code, cur.symbol
    HAVING ABS(COALESCE(SUM(CAST(s.amount AS REAL)), 0)) > 1e-9
    ORDER BY cur.code"#;

  let mut partners_out = Vec::new();
  for (pid, pname) in &partner_page_list {
    let send_row = partner_currency_buckets(
      &conn,
      hawala_totals_sql,
      &[pid, &"SEND", &from, &to],
    )?;
    let receive_row = partner_currency_buckets(
      &conn,
      hawala_totals_sql,
      &[pid, &"RECEIVE", &from, &to],
    )?;
    let payment_row = partner_currency_buckets(
      &conn,
      settlement_sql,
      &[pid, &"%PAY%", &from, &to],
    )?;
    let collection_row = partner_currency_buckets(
      &conn,
      settlement_sql,
      &[pid, &"%COLLECT%", &from, &to],
    )?;
    let send_count: i64 = send_row.iter().map(|b| b.count).sum();
    let receive_count: i64 = receive_row.iter().map(|b| b.count).sum();
    partners_out.push(PartnerSarafiPartnerRow {
      partner_id: pid.clone(),
      partner_name: pname.clone(),
      send_count,
      receive_count,
      send_totals: send_row,
      receive_totals: receive_row,
      payment_totals: payment_row,
      collection_totals: collection_row,
    });
  }

  let open_all = partner_open_commission_rows(&conn, partner_filter.as_deref())?;
  let open_commission_total = open_all.len() as i64;
  let (open_commission_page, _, open_offset) =
    clamp_page(commission_page_req, Some(page_size), open_commission_total);
  let open_commission: Vec<PartnerBalanceReportRow> = open_all
    .into_iter()
    .skip(open_offset as usize)
    .take(page_size as usize)
    .collect();

  let mut hawala_where = String::from(
    r#"WHERE h.deletedAt IS NULL
         AND h.partnerSarafiId IS NOT NULL
         AND h.valueDate >= ?1 AND h.valueDate < date(?2, '+1 day')"#,
  );
  let mut hawala_params: Vec<Box<dyn rusqlite::types::ToSql>> =
    vec![Box::new(from.clone()), Box::new(to.clone())];
  if let Some(ref pid) = partner_filter {
    hawala_where.push_str(" AND h.partnerSarafiId = ?");
    hawala_params.push(Box::new(pid.clone()));
  }

  let count_sql = format!(r#"SELECT COUNT(*) FROM HawalaTransfer h {hawala_where}"#);
  let count_refs: Vec<&dyn rusqlite::types::ToSql> =
    hawala_params.iter().map(|p| p.as_ref()).collect();
  let total_hawalas: i64 = conn.query_row(&count_sql, count_refs.as_slice(), |row| row.get(0))?;
  let total_pages = if total_hawalas == 0 {
    1
  } else {
    (total_hawalas + page_size - 1) / page_size
  };
  if page > total_pages {
    page = total_pages;
  }
  let offset = (page - 1) * page_size;

  let hawala_chrono = crate::ledger::HAWALA_CHRONO_ASC;
  let list_hawala_sql = format!(
    r#"SELECT h.id, h.partnerSarafiId, COALESCE(p.name, ''), h.reference,
              IFNULL(t.displayRef, ''), h.direction, h.status,
              CAST(h.amount AS TEXT), cur.code,
              CAST(h.commissionAmount AS TEXT), h.commissionSide, h.valueDate
       FROM HawalaTransfer h
       INNER JOIN Currency cur ON cur.id = h.currencyId
       LEFT JOIN PartnerSarafi p ON p.id = h.partnerSarafiId
       LEFT JOIN "Transaction" t ON t.id = h.transactionId
       {hawala_where}
       ORDER BY {hawala_chrono}
       LIMIT ? OFFSET ?"#,
  );
  let mut list_params = hawala_params;
  list_params.push(Box::new(page_size));
  list_params.push(Box::new(offset));
  let list_refs: Vec<&dyn rusqlite::types::ToSql> =
    list_params.iter().map(|p| p.as_ref()).collect();
  let mut hstmt = conn.prepare(&list_hawala_sql)?;
  let hawalas = hstmt
    .query_map(list_refs.as_slice(), |row| {
      Ok(PartnerSarafiHawalaLine {
        id: row.get(0)?,
        partner_id: row.get(1)?,
        partner_name: row.get(2)?,
        reference: row.get(3)?,
        display_ref: row.get(4)?,
        direction: row.get(5)?,
        status: row.get(6)?,
        amount: row.get(7)?,
        currency_code: row.get(8)?,
        commission_amount: row.get(9)?,
        commission_side: row.get(10)?,
        value_date: row.get(11)?,
      })
    })?
    .collect::<Result<Vec<_>, _>>()?;

  Ok(PartnerSarafiReport {
    date_from: from,
    date_to: to,
    partner_count: partners_total,
    send_count: send_count_total,
    receive_count: receive_count_total,
    send_totals,
    receive_totals,
    payment_totals,
    collection_totals,
    open_commission,
    open_commission_total,
    open_commission_page,
    partners: partners_out,
    partners_total,
    partners_page,
    hawalas,
    total_hawalas,
    page,
    page_size,
  })
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReportCurrencyAmount {
  pub currency_code: String,
  pub currency_symbol: Option<String>,
  pub amount: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportsOverview {
  pub date_from: String,
  pub date_to: String,
  pub total_transactions: i64,
  pub deposits: i64,
  pub withdrawals: i64,
  pub transfers: i64,
  pub exchanges: i64,
  pub hawalas: i64,
  pub trades: i64,
  pub adjustments: i64,
  pub expenses: i64,
  pub money_in: Vec<ReportCurrencyAmount>,
  pub money_out: Vec<ReportCurrencyAmount>,
  pub net_movement: Vec<ReportCurrencyAmount>,
  pub hawala_sent_count: i64,
  pub hawala_received_count: i64,
  pub hawala_sent: Vec<ReportCurrencyAmount>,
  pub hawala_received: Vec<ReportCurrencyAmount>,
  pub exchange_count: i64,
  pub exchange_profit: Vec<ReportCurrencyAmount>,
  pub balances_by_currency: Vec<CashByCurrencyRow>,
  pub balances_total: i64,
  pub balances_page: i64,
  pub balances_page_size: i64,
}

fn count_tx_type(conn: &Connection, ty: &str, from: &str, to: &str) -> Result<i64, AppError> {
  Ok(conn.query_row(
    r#"SELECT COUNT(*) FROM "Transaction"
       WHERE deletedAt IS NULL AND type = ?1
         AND valueDate >= ?2 AND valueDate < date(?3, '+1 day')"#,
    params![ty, from, to],
    |row| row.get(0),
  )?)
}

fn cash_flows_by_currency(
  conn: &Connection,
  from: &str,
  to: &str,
) -> Result<(Vec<ReportCurrencyAmount>, Vec<ReportCurrencyAmount>, Vec<ReportCurrencyAmount>), AppError>
{
  let mut stmt = conn.prepare(
    r#"SELECT c.code, c.symbol,
              COALESCE(SUM(CASE WHEN le.direction='DEBIT' THEN CAST(le.amount AS REAL) ELSE 0 END), 0),
              COALESCE(SUM(CASE WHEN le.direction='CREDIT' THEN CAST(le.amount AS REAL) ELSE 0 END), 0)
       FROM Wallet w
       INNER JOIN LedgerEntry le ON le.walletId = w.id
       INNER JOIN "Transaction" t ON t.id = le.transactionId AND t.deletedAt IS NULL
       INNER JOIN Currency c ON c.id = le.currencyId AND c.deletedAt IS NULL
       WHERE w.deletedAt IS NULL AND w.isActive = 1
         AND ((w.type = 'VAULT' AND w.name = 'Main Vault') OR w.type = 'TILL')
         AND t.valueDate >= ?1 AND t.valueDate < date(?2, '+1 day')
       GROUP BY c.code, c.symbol
       ORDER BY c.code"#,
  )?;
  let mut money_in = Vec::new();
  let mut money_out = Vec::new();
  let mut net = Vec::new();
  for row in stmt.query_map(params![from, to], |row| {
    Ok((
      row.get::<_, String>(0)?,
      row.get::<_, Option<String>>(1)?,
      row.get::<_, f64>(2)?,
      row.get::<_, f64>(3)?,
    ))
  })? {
    let (code, symbol, debits, credits) = row?;
    if debits.abs() > 1e-9 {
      money_in.push(ReportCurrencyAmount {
        currency_code: code.clone(),
        currency_symbol: symbol.clone(),
        amount: format_f64(debits),
      });
    }
    if credits.abs() > 1e-9 {
      money_out.push(ReportCurrencyAmount {
        currency_code: code.clone(),
        currency_symbol: symbol.clone(),
        amount: format_f64(credits),
      });
    }
    let n = debits - credits;
    if n.abs() > 1e-9 {
      net.push(ReportCurrencyAmount {
        currency_code: code,
        currency_symbol: symbol,
        amount: format_f64(n),
      });
    }
  }
  Ok((money_in, money_out, net))
}

fn hawala_totals_by_direction(
  conn: &Connection,
  from: &str,
  to: &str,
  direction: &str,
) -> Result<(i64, Vec<ReportCurrencyAmount>), AppError> {
  let count: i64 = conn.query_row(
    r#"SELECT COUNT(*) FROM HawalaTransfer
       WHERE deletedAt IS NULL AND direction = ?1
         AND valueDate >= ?2 AND valueDate < date(?3, '+1 day')"#,
    params![direction, from, to],
    |row| row.get(0),
  )?;
  let mut stmt = conn.prepare(
    r#"SELECT c.code, c.symbol, COALESCE(SUM(CAST(h.amount AS REAL)), 0)
       FROM HawalaTransfer h
       INNER JOIN Currency c ON c.id = h.currencyId
       WHERE h.deletedAt IS NULL AND h.direction = ?1
         AND h.valueDate >= ?2 AND h.valueDate < date(?3, '+1 day')
       GROUP BY c.code, c.symbol
       HAVING ABS(COALESCE(SUM(CAST(h.amount AS REAL)), 0)) > 1e-9
       ORDER BY c.code"#,
  )?;
  let amounts = stmt
    .query_map(params![direction, from, to], |row| {
      Ok(ReportCurrencyAmount {
        currency_code: row.get(0)?,
        currency_symbol: row.get(1)?,
        amount: format_f64(row.get::<_, f64>(2)?),
      })
    })?
    .collect::<Result<Vec<_>, _>>()?;
  Ok((count, amounts))
}

fn exchange_profit_by_currency(
  conn: &Connection,
  from: &str,
  to: &str,
) -> Result<(i64, Vec<ReportCurrencyAmount>), AppError> {
  let has_deal: bool = conn.query_row(
    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='ExchangeDeal')",
    [],
    |row| row.get(0),
  )?;
  if !has_deal {
    return Ok((0, Vec::new()));
  }
  let count: i64 = conn.query_row(
    r#"SELECT COUNT(*) FROM ExchangeDeal
       WHERE deletedAt IS NULL
         AND valueDate >= ?1 AND valueDate < date(?2, '+1 day')"#,
    params![from, to],
    |row| row.get(0),
  )?;
  let mut stmt = conn.prepare(
    r#"SELECT c.code, c.symbol, COALESCE(SUM(CAST(d.profitAmount AS REAL)), 0)
       FROM ExchangeDeal d
       INNER JOIN Currency c ON c.id = d.profitCurrencyId
       WHERE d.deletedAt IS NULL
         AND d.valueDate >= ?1 AND d.valueDate < date(?2, '+1 day')
       GROUP BY c.code, c.symbol
       HAVING ABS(COALESCE(SUM(CAST(d.profitAmount AS REAL)), 0)) > 1e-9
       ORDER BY c.code"#,
  )?;
  let amounts = stmt
    .query_map(params![from, to], |row| {
      Ok(ReportCurrencyAmount {
        currency_code: row.get(0)?,
        currency_symbol: row.get(1)?,
        amount: format_f64(row.get::<_, f64>(2)?),
      })
    })?
    .collect::<Result<Vec<_>, _>>()?;
  Ok((count, amounts))
}

fn cash_balances_now(conn: &Connection) -> Result<Vec<CashByCurrencyRow>, AppError> {
  let mut stmt = conn.prepare(
    r#"SELECT c.code, c.symbol,
              COALESCE(SUM(b.balance), 0) AS bal,
              COALESCE(SUM(CASE WHEN w.type='VAULT' THEN b.balance ELSE 0 END), 0),
              COALESCE(SUM(CASE WHEN w.type='TILL' THEN b.balance ELSE 0 END), 0)
       FROM WalletCurrencyBalance b
       INNER JOIN Wallet w ON w.id = b.walletId
         AND w.deletedAt IS NULL AND w.isActive = 1
         AND ((w.type = 'VAULT' AND w.name = 'Main Vault') OR w.type = 'TILL')
       INNER JOIN Currency c ON c.id = b.currencyId AND c.deletedAt IS NULL
       WHERE ABS(b.balance) > 1e-12
       GROUP BY c.code, c.symbol
       HAVING ABS(COALESCE(SUM(b.balance), 0)) > 1e-9
       ORDER BY c.code"#,
  )?;
  let rows = stmt
    .query_map([], |row| {
      Ok(CashByCurrencyRow {
        currency_code: row.get(0)?,
        currency_symbol: row.get(1)?,
        balance: format_f64(row.get::<_, f64>(2)?),
        vault_balance: format_f64(row.get::<_, f64>(3)?),
        till_balance: format_f64(row.get::<_, f64>(4)?),
      })
    })?
    .collect::<Result<Vec<_>, _>>()?;
  Ok(rows)
}

#[tauri::command]
pub fn get_reports_overview(
  state: State<'_, AppState>,
  input: ReportFilterInput,
) -> Result<ReportsOverview, AppError> {
  let (from, to) = date_bounds(&input);
  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "reports")?;

  let deposits = count_tx_type(&conn, "DEPOSIT", &from, &to)?;
  let withdrawals = count_tx_type(&conn, "WITHDRAWAL", &from, &to)?;
  let transfers = count_tx_type(&conn, "TRANSFER", &from, &to)?;
  let exchanges = count_tx_type(&conn, "EXCHANGE", &from, &to)?;
  let hawalas = count_tx_type(&conn, "HAWALA", &from, &to)?;
  let adjustments = count_tx_type(&conn, "ADJUSTMENT", &from, &to)?;
  let expenses = count_tx_type(&conn, "EXPENSE", &from, &to)?;
  let trade_buy = count_tx_type(&conn, "TRADE_BUY", &from, &to)?;
  let trade_sell = count_tx_type(&conn, "TRADE_SELL", &from, &to)?;
  let trades = trade_buy + trade_sell;
  let total = deposits
    + withdrawals
    + transfers
    + exchanges
    + hawalas
    + adjustments
    + expenses
    + trades;

  let (money_in, money_out, net_movement) = cash_flows_by_currency(&conn, &from, &to)?;
  let (hawala_sent_count, hawala_sent) =
    hawala_totals_by_direction(&conn, &from, &to, "SEND")?;
  let (hawala_received_count, hawala_received) =
    hawala_totals_by_direction(&conn, &from, &to, "RECEIVE")?;
  let (exchange_count, exchange_profit) = exchange_profit_by_currency(&conn, &from, &to)?;
  let all_balances = cash_balances_now(&conn)?;
  let balances_total = all_balances.len() as i64;
  let (balances_page, balances_page_size, bal_offset) =
    clamp_page(input.page, input.page_size, balances_total);
  let balances_by_currency: Vec<CashByCurrencyRow> = all_balances
    .into_iter()
    .skip(bal_offset as usize)
    .take(balances_page_size as usize)
    .collect();

  Ok(ReportsOverview {
    date_from: from,
    date_to: to,
    total_transactions: total,
    deposits,
    withdrawals,
    transfers,
    exchanges,
    hawalas,
    trades,
    adjustments,
    expenses,
    money_in,
    money_out,
    net_movement,
    hawala_sent_count,
    hawala_received_count,
    hawala_sent,
    hawala_received,
    exchange_count,
    exchange_profit,
    balances_by_currency,
    balances_total,
    balances_page,
    balances_page_size,
  })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CashFlowTypeRow {
  pub tx_type: String,
  pub currency_code: String,
  pub currency_symbol: Option<String>,
  pub money_in: String,
  pub money_out: String,
  pub net: String,
  pub count: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CashFlowReport {
  pub date_from: String,
  pub date_to: String,
  pub by_currency: Vec<ReportCurrencyAmount>,
  pub money_in: Vec<ReportCurrencyAmount>,
  pub money_out: Vec<ReportCurrencyAmount>,
  pub by_type: Vec<CashFlowTypeRow>,
  pub by_type_total: i64,
  pub page: i64,
  pub page_size: i64,
}

#[tauri::command]
pub fn get_cash_flow_report(
  state: State<'_, AppState>,
  input: ReportFilterInput,
) -> Result<CashFlowReport, AppError> {
  let (from, to) = date_bounds(&input);
  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "reports")?;
  let (money_in, money_out, net) = cash_flows_by_currency(&conn, &from, &to)?;

  let total: i64 = conn.query_row(
    r#"SELECT COUNT(*) FROM (
         SELECT t.type, c.code
         FROM Wallet w
         INNER JOIN LedgerEntry le ON le.walletId = w.id
         INNER JOIN "Transaction" t ON t.id = le.transactionId AND t.deletedAt IS NULL
         INNER JOIN Currency c ON c.id = le.currencyId AND c.deletedAt IS NULL
         WHERE w.deletedAt IS NULL AND w.isActive = 1
           AND ((w.type = 'VAULT' AND w.name = 'Main Vault') OR w.type = 'TILL')
           AND t.valueDate >= ?1 AND t.valueDate < date(?2, '+1 day')
         GROUP BY t.type, c.code
       )"#,
    params![from, to],
    |row| row.get(0),
  )?;
  let (page, page_size, offset) = clamp_page(input.page, input.page_size, total);

  let mut stmt = conn.prepare(
    r#"SELECT t.type, c.code, c.symbol, COUNT(DISTINCT t.id),
              COALESCE(SUM(CASE WHEN le.direction='DEBIT' THEN CAST(le.amount AS REAL) ELSE 0 END), 0),
              COALESCE(SUM(CASE WHEN le.direction='CREDIT' THEN CAST(le.amount AS REAL) ELSE 0 END), 0)
       FROM Wallet w
       INNER JOIN LedgerEntry le ON le.walletId = w.id
       INNER JOIN "Transaction" t ON t.id = le.transactionId AND t.deletedAt IS NULL
       INNER JOIN Currency c ON c.id = le.currencyId AND c.deletedAt IS NULL
       WHERE w.deletedAt IS NULL AND w.isActive = 1
         AND ((w.type = 'VAULT' AND w.name = 'Main Vault') OR w.type = 'TILL')
         AND t.valueDate >= ?1 AND t.valueDate < date(?2, '+1 day')
       GROUP BY t.type, c.code, c.symbol
       ORDER BY t.type, c.code
       LIMIT ?3 OFFSET ?4"#,
  )?;
  let by_type = stmt
    .query_map(params![from, to, page_size, offset], |row| {
      let inn: f64 = row.get(4)?;
      let out: f64 = row.get(5)?;
      Ok(CashFlowTypeRow {
        tx_type: row.get(0)?,
        currency_code: row.get(1)?,
        currency_symbol: row.get(2)?,
        count: row.get(3)?,
        money_in: format_f64(inn),
        money_out: format_f64(out),
        net: format_f64(inn - out),
      })
    })?
    .collect::<Result<Vec<_>, _>>()?;

  Ok(CashFlowReport {
    date_from: from,
    date_to: to,
    by_currency: net,
    money_in,
    money_out,
    by_type,
    by_type_total: total,
    page,
    page_size,
  })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MovementBucketTotals {
  pub count: i64,
  pub totals: Vec<ReportCurrencyAmount>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MovementSumReport {
  pub date_from: String,
  pub date_to: String,
  pub deposit: MovementBucketTotals,
  pub withdrawal: MovementBucketTotals,
  pub transfer: MovementBucketTotals,
  pub exchange_given: MovementBucketTotals,
  pub exchange_received: MovementBucketTotals,
  pub exchange_profit: MovementBucketTotals,
}

/// Sum customer-wallet lines for a transaction type (one direction to avoid double-counting).
fn customer_tx_type_totals(
  conn: &Connection,
  from: &str,
  to: &str,
  tx_type: &str,
  entry_direction: &str,
) -> Result<MovementBucketTotals, AppError> {
  let count: i64 = conn.query_row(
    r#"SELECT COUNT(*) FROM "Transaction" t
       WHERE t.deletedAt IS NULL AND t.type = ?1
         AND t.valueDate >= ?2 AND t.valueDate < date(?3, '+1 day')"#,
    params![tx_type, from, to],
    |row| row.get(0),
  )?;
  let mut stmt = conn.prepare(
    r#"SELECT c.code, c.symbol, COALESCE(SUM(CAST(le.amount AS REAL)), 0)
       FROM "Transaction" t
       INNER JOIN LedgerEntry le ON le.transactionId = t.id
       INNER JOIN Wallet w ON w.id = le.walletId AND w.deletedAt IS NULL AND w.type = 'CUSTOMER'
       INNER JOIN Currency c ON c.id = le.currencyId AND c.deletedAt IS NULL
       WHERE t.deletedAt IS NULL AND t.type = ?1
         AND le.direction = ?2
         AND t.valueDate >= ?3 AND t.valueDate < date(?4, '+1 day')
       GROUP BY c.code, c.symbol
       HAVING ABS(COALESCE(SUM(CAST(le.amount AS REAL)), 0)) > 1e-9
       ORDER BY c.code"#,
  )?;
  let totals = stmt
    .query_map(params![tx_type, entry_direction, from, to], |row| {
      Ok(ReportCurrencyAmount {
        currency_code: row.get(0)?,
        currency_symbol: row.get(1)?,
        amount: format_f64(row.get::<_, f64>(2)?),
      })
    })?
    .collect::<Result<Vec<_>, _>>()?;
  Ok(MovementBucketTotals { count, totals })
}

fn exchange_deal_side_totals(
  conn: &Connection,
  from: &str,
  to: &str,
) -> Result<(MovementBucketTotals, MovementBucketTotals, MovementBucketTotals), AppError> {
  let has_deal: bool = conn.query_row(
    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='ExchangeDeal')",
    [],
    |row| row.get(0),
  )?;
  if !has_deal {
    let empty = MovementBucketTotals {
      count: 0,
      totals: Vec::new(),
    };
    return Ok((empty.clone(), empty.clone(), empty));
  }

  let count: i64 = conn.query_row(
    r#"SELECT COUNT(*) FROM ExchangeDeal d
       WHERE d.deletedAt IS NULL
         AND d.valueDate >= ?1 AND d.valueDate < date(?2, '+1 day')"#,
    params![from, to],
    |row| row.get(0),
  )?;

  let mut given_stmt = conn.prepare(
    r#"SELECT c.code, c.symbol, COALESCE(SUM(CAST(d.fromAmount AS REAL)), 0)
       FROM ExchangeDeal d
       INNER JOIN Currency c ON c.id = d.fromCurrencyId
       WHERE d.deletedAt IS NULL
         AND d.valueDate >= ?1 AND d.valueDate < date(?2, '+1 day')
       GROUP BY c.code, c.symbol
       HAVING ABS(COALESCE(SUM(CAST(d.fromAmount AS REAL)), 0)) > 1e-9
       ORDER BY c.code"#,
  )?;
  let given = given_stmt
    .query_map(params![from, to], |row| {
      Ok(ReportCurrencyAmount {
        currency_code: row.get(0)?,
        currency_symbol: row.get(1)?,
        amount: format_f64(row.get::<_, f64>(2)?),
      })
    })?
    .collect::<Result<Vec<_>, _>>()?;

  let mut recv_stmt = conn.prepare(
    r#"SELECT c.code, c.symbol, COALESCE(SUM(CAST(d.toAmount AS REAL)), 0)
       FROM ExchangeDeal d
       INNER JOIN Currency c ON c.id = d.toCurrencyId
       WHERE d.deletedAt IS NULL
         AND d.valueDate >= ?1 AND d.valueDate < date(?2, '+1 day')
       GROUP BY c.code, c.symbol
       HAVING ABS(COALESCE(SUM(CAST(d.toAmount AS REAL)), 0)) > 1e-9
       ORDER BY c.code"#,
  )?;
  let received = recv_stmt
    .query_map(params![from, to], |row| {
      Ok(ReportCurrencyAmount {
        currency_code: row.get(0)?,
        currency_symbol: row.get(1)?,
        amount: format_f64(row.get::<_, f64>(2)?),
      })
    })?
    .collect::<Result<Vec<_>, _>>()?;

  let mut profit_stmt = conn.prepare(
    r#"SELECT c.code, c.symbol, COALESCE(SUM(CAST(d.profitAmount AS REAL)), 0)
       FROM ExchangeDeal d
       INNER JOIN Currency c ON c.id = d.profitCurrencyId
       WHERE d.deletedAt IS NULL
         AND d.valueDate >= ?1 AND d.valueDate < date(?2, '+1 day')
       GROUP BY c.code, c.symbol
       HAVING ABS(COALESCE(SUM(CAST(d.profitAmount AS REAL)), 0)) > 1e-9
       ORDER BY c.code"#,
  )?;
  let profit = profit_stmt
    .query_map(params![from, to], |row| {
      Ok(ReportCurrencyAmount {
        currency_code: row.get(0)?,
        currency_symbol: row.get(1)?,
        amount: format_f64(row.get::<_, f64>(2)?),
      })
    })?
    .collect::<Result<Vec<_>, _>>()?;

  Ok((
    MovementBucketTotals {
      count,
      totals: given,
    },
    MovementBucketTotals {
      count,
      totals: received,
    },
    MovementBucketTotals {
      count,
      totals: profit,
    },
  ))
}

#[tauri::command]
pub fn get_movement_sum_report(
  state: State<'_, AppState>,
  input: ReportFilterInput,
) -> Result<MovementSumReport, AppError> {
  let (from, to) = date_bounds(&input);
  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "reports")?;

  let deposit = customer_tx_type_totals(&conn, &from, &to, "DEPOSIT", "CREDIT")?;
  let withdrawal = customer_tx_type_totals(&conn, &from, &to, "WITHDRAWAL", "DEBIT")?;
  let transfer = customer_tx_type_totals(&conn, &from, &to, "TRANSFER", "DEBIT")?;
  let (exchange_given, exchange_received, exchange_profit) =
    exchange_deal_side_totals(&conn, &from, &to)?;

  Ok(MovementSumReport {
    date_from: from,
    date_to: to,
    deposit,
    withdrawal,
    transfer,
    exchange_given,
    exchange_received,
    exchange_profit,
  })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExchangeReportRow {
  pub id: String,
  pub transaction_id: String,
  pub reference: String,
  pub display_ref: String,
  pub side: String,
  pub from_amount: String,
  pub from_currency: String,
  pub to_amount: String,
  pub to_currency: String,
  /// Deal rate recorded on the exchange at posting time (immutable history).
  pub deal_rate: String,
  /// Board/market rate recorded on the exchange at posting time, if any.
  pub board_rate: Option<String>,
  pub profit_amount: String,
  pub profit_currency: String,
  pub value_date: String,
  pub customer_id: Option<String>,
  pub customer_name: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExchangePeriodReport {
  pub date_from: String,
  pub date_to: String,
  pub total_deals: i64,
  pub profit_by_currency: Vec<ReportCurrencyAmount>,
  pub given_totals: Vec<ReportCurrencyAmount>,
  pub received_totals: Vec<ReportCurrencyAmount>,
  pub items: Vec<ExchangeReportRow>,
  pub total: i64,
  pub page: i64,
  pub page_size: i64,
}

#[tauri::command]
pub fn get_exchange_period_report(
  state: State<'_, AppState>,
  input: ReportFilterInput,
) -> Result<ExchangePeriodReport, AppError> {
  let (from, to) = date_bounds(&input);
  let page_size = input.page_size.unwrap_or(50).clamp(1, 200);
  let mut page = input.page.unwrap_or(1).max(1);
  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "reports")?;

  let has_deal: bool = conn.query_row(
    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='ExchangeDeal')",
    [],
    |row| row.get(0),
  )?;
  if !has_deal {
    return Ok(ExchangePeriodReport {
      date_from: from,
      date_to: to,
      total_deals: 0,
      profit_by_currency: Vec::new(),
      given_totals: Vec::new(),
      received_totals: Vec::new(),
      items: Vec::new(),
      total: 0,
      page: 1,
      page_size,
    });
  }

  let mut where_sql = String::from(
    "WHERE d.deletedAt IS NULL AND d.valueDate >= ?1 AND d.valueDate < date(?2, '+1 day')",
  );
  let mut params_s: Vec<String> = vec![from.clone(), to.clone()];

  if let Some(ref code) = input.from_currency_code {
    let code = code.trim().to_ascii_uppercase();
    if !code.is_empty() && code != "ALL" {
      where_sql.push_str(" AND cf.code = ?");
      params_s.push(code);
    }
  }
  if let Some(ref code) = input.to_currency_code {
    let code = code.trim().to_ascii_uppercase();
    if !code.is_empty() && code != "ALL" {
      where_sql.push_str(" AND ct.code = ?");
      params_s.push(code);
    }
  }
  if let Some(ref code) = input.currency_code {
    let code = code.trim().to_ascii_uppercase();
    if !code.is_empty() && code != "ALL" {
      where_sql.push_str(" AND (cf.code = ? OR ct.code = ?)");
      params_s.push(code.clone());
      params_s.push(code);
    }
  }
  if let Some(ref cid) = input.customer_id {
    let cid = cid.trim();
    if !cid.is_empty() {
      where_sql.push_str(" AND t.customerId = ?");
      params_s.push(cid.to_string());
    }
  }
  if let Some(ref reference) = input.reference {
    let reference = reference.trim();
    if !reference.is_empty() {
      where_sql.push_str(" AND (t.reference LIKE ? OR IFNULL(t.displayRef,'') LIKE ?)");
      params_s.push(format!("%{reference}%"));
      params_s.push(format!("%{reference}%"));
    }
  }
  if let Some(ref q) = input.search {
    let q = q.trim();
    if !q.is_empty() {
      let like = format!("%{q}%");
      where_sql.push_str(
        " AND (t.reference LIKE ? OR IFNULL(t.displayRef,'') LIKE ? OR IFNULL(c.fullName,'') LIKE ?)",
      );
      params_s.push(like.clone());
      params_s.push(like.clone());
      params_s.push(like);
    }
  }

  let join_sql = r#"FROM ExchangeDeal d
       INNER JOIN "Transaction" t ON t.id = d.transactionId
       INNER JOIN Currency cf ON cf.id = d.fromCurrencyId
       INNER JOIN Currency ct ON ct.id = d.toCurrencyId
       INNER JOIN Currency cp ON cp.id = d.profitCurrencyId
       LEFT JOIN Customer c ON c.id = t.customerId"#;

  let count_sql = format!("SELECT COUNT(*) {join_sql} {where_sql}");
  let count_refs: Vec<&dyn rusqlite::types::ToSql> = params_s
    .iter()
    .map(|p| p as &dyn rusqlite::types::ToSql)
    .collect();
  let total: i64 = conn.query_row(&count_sql, count_refs.as_slice(), |row| row.get(0))?;
  let total_deals = total;
  let total_pages = if total == 0 {
    1
  } else {
    (total + page_size - 1) / page_size
  };
  if page > total_pages {
    page = total_pages;
  }
  let offset = (page - 1) * page_size;

  // Totals use recorded deal amounts (historical), not live rates.
  let given_sql = format!(
    r#"SELECT cf.code, cf.symbol, COALESCE(SUM(CAST(d.fromAmount AS REAL)), 0)
       {join_sql} {where_sql}
       GROUP BY cf.code, cf.symbol
       HAVING ABS(COALESCE(SUM(CAST(d.fromAmount AS REAL)), 0)) > 1e-9
       ORDER BY cf.code"#
  );
  let given_refs: Vec<&dyn rusqlite::types::ToSql> = params_s
    .iter()
    .map(|p| p as &dyn rusqlite::types::ToSql)
    .collect();
  let mut given_stmt = conn.prepare(&given_sql)?;
  let given_totals = given_stmt
    .query_map(given_refs.as_slice(), |row| {
      Ok(ReportCurrencyAmount {
        currency_code: row.get(0)?,
        currency_symbol: row.get(1)?,
        amount: format_f64(row.get::<_, f64>(2)?),
      })
    })?
    .collect::<Result<Vec<_>, _>>()?;

  let received_sql = format!(
    r#"SELECT ct.code, ct.symbol, COALESCE(SUM(CAST(d.toAmount AS REAL)), 0)
       {join_sql} {where_sql}
       GROUP BY ct.code, ct.symbol
       HAVING ABS(COALESCE(SUM(CAST(d.toAmount AS REAL)), 0)) > 1e-9
       ORDER BY ct.code"#
  );
  let received_refs: Vec<&dyn rusqlite::types::ToSql> = params_s
    .iter()
    .map(|p| p as &dyn rusqlite::types::ToSql)
    .collect();
  let mut received_stmt = conn.prepare(&received_sql)?;
  let received_totals = received_stmt
    .query_map(received_refs.as_slice(), |row| {
      Ok(ReportCurrencyAmount {
        currency_code: row.get(0)?,
        currency_symbol: row.get(1)?,
        amount: format_f64(row.get::<_, f64>(2)?),
      })
    })?
    .collect::<Result<Vec<_>, _>>()?;

  let profit_sql = format!(
    r#"SELECT cp.code, cp.symbol, COALESCE(SUM(CAST(d.profitAmount AS REAL)), 0)
       {join_sql} {where_sql}
       GROUP BY cp.code, cp.symbol
       HAVING ABS(COALESCE(SUM(CAST(d.profitAmount AS REAL)), 0)) > 1e-9
       ORDER BY cp.code"#
  );
  let profit_refs: Vec<&dyn rusqlite::types::ToSql> = params_s
    .iter()
    .map(|p| p as &dyn rusqlite::types::ToSql)
    .collect();
  let mut profit_stmt = conn.prepare(&profit_sql)?;
  let profit_by_currency = profit_stmt
    .query_map(profit_refs.as_slice(), |row| {
      Ok(ReportCurrencyAmount {
        currency_code: row.get(0)?,
        currency_symbol: row.get(1)?,
        amount: format_f64(row.get::<_, f64>(2)?),
      })
    })?
    .collect::<Result<Vec<_>, _>>()?;

  let chrono = crate::ledger::TX_CHRONO_ASC;
  let list_sql = format!(
    r#"SELECT d.id, d.transactionId, t.reference, IFNULL(t.displayRef,''), d.side, CAST(d.fromAmount AS TEXT), cf.code,
              CAST(d.toAmount AS TEXT), ct.code, CAST(d.dealRate AS TEXT),
              CAST(d.boardRate AS TEXT), CAST(d.profitAmount AS TEXT), cp.code,
              d.valueDate, t.customerId, c.fullName
       {join_sql}
       {where_sql}
       ORDER BY {chrono}
       LIMIT ? OFFSET ?"#
  );
  let mut list_params: Vec<Box<dyn rusqlite::types::ToSql>> = params_s
    .iter()
    .map(|s| Box::new(s.clone()) as Box<dyn rusqlite::types::ToSql>)
    .collect();
  list_params.push(Box::new(page_size));
  list_params.push(Box::new(offset));
  let list_refs: Vec<&dyn rusqlite::types::ToSql> =
    list_params.iter().map(|p| p.as_ref()).collect();
  let mut stmt = conn.prepare(&list_sql)?;
  let items = stmt
    .query_map(list_refs.as_slice(), |row| {
      Ok(ExchangeReportRow {
        id: row.get(0)?,
        transaction_id: row.get(1)?,
        reference: row.get(2)?,
        display_ref: row.get(3)?,
        side: row.get(4)?,
        from_amount: row.get(5)?,
        from_currency: row.get(6)?,
        to_amount: row.get(7)?,
        to_currency: row.get(8)?,
        deal_rate: row.get(9)?,
        board_rate: row.get(10)?,
        profit_amount: row.get(11)?,
        profit_currency: row.get(12)?,
        value_date: row.get(13)?,
        customer_id: row.get(14)?,
        customer_name: row.get(15)?,
      })
    })?
    .collect::<Result<Vec<_>, _>>()?;

  Ok(ExchangePeriodReport {
    date_from: from,
    date_to: to,
    total_deals,
    profit_by_currency,
    given_totals,
    received_totals,
    items,
    total,
    page,
    page_size,
  })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerStatementLine {
  pub id: String,
  pub reference: String,
  pub display_ref: String,
  pub r#type: String,
  pub status: String,
  pub description: Option<String>,
  pub value_date: String,
  pub debit: String,
  pub credit: String,
  pub currency_code: String,
  pub balance_after: String,
  pub sender_name: Option<String>,
  pub receiver_name: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerStatementBalance {
  pub currency_code: String,
  pub currency_symbol: Option<String>,
  pub opening: String,
  pub money_in: String,
  pub money_out: String,
  pub closing: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerStatementReport {
  pub customer_id: String,
  pub customer_name: String,
  pub customer_code: Option<String>,
  pub date_from: String,
  pub date_to: String,
  pub money_in: Vec<ReportCurrencyAmount>,
  pub money_out: Vec<ReportCurrencyAmount>,
  pub balances: Vec<CustomerStatementBalance>,
  pub lines: Vec<CustomerStatementLine>,
  pub lines_total: i64,
  pub page: i64,
  pub page_size: i64,
}

#[tauri::command]
pub fn get_customer_statement_report(
  state: State<'_, AppState>,
  input: ReportFilterInput,
) -> Result<CustomerStatementReport, AppError> {
  let customer_id = input
    .customer_id
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .ok_or_else(|| AppError::Validation("customerId is required.".into()))?
    .to_string();
  let (from, to) = date_bounds(&input);
  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "reports")?;

  let (customer_name, customer_code): (String, Option<String>) = conn.query_row(
    "SELECT fullName, code FROM Customer WHERE id=?1 AND deletedAt IS NULL",
    [&customer_id],
    |row| Ok((row.get(0)?, row.get(1)?)),
  )?;

  let currency_filter = input
    .currency_code
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(|s| s.to_ascii_uppercase());

  // Opening balances per currency (before dateFrom).
  let mut open_sql = String::from(
    r#"SELECT c.code, c.symbol,
              COALESCE(SUM(CASE WHEN le.direction='DEBIT' THEN CAST(le.amount AS REAL)
                                ELSE -CAST(le.amount AS REAL) END), 0)
       FROM Wallet w
       INNER JOIN LedgerEntry le ON le.walletId = w.id
       INNER JOIN "Transaction" t ON t.id = le.transactionId AND t.deletedAt IS NULL
       INNER JOIN Currency c ON c.id = le.currencyId AND c.deletedAt IS NULL
       WHERE w.customerId = ?1 AND w.type='CUSTOMER' AND w.deletedAt IS NULL
         AND t.valueDate < ?2"#,
  );
  let mut open_params: Vec<Box<dyn rusqlite::types::ToSql>> =
    vec![Box::new(customer_id.clone()), Box::new(from.clone())];
  if let Some(ref code) = currency_filter {
    open_sql.push_str(" AND c.code = ?");
    open_params.push(Box::new(code.clone()));
  }
  open_sql.push_str(" GROUP BY c.code, c.symbol ORDER BY c.code");
  let open_refs: Vec<&dyn rusqlite::types::ToSql> =
    open_params.iter().map(|p| p.as_ref()).collect();
  let mut open_stmt = conn.prepare(&open_sql)?;
  let mut running: std::collections::BTreeMap<String, (Option<String>, f64)> =
    std::collections::BTreeMap::new();
  for row in open_stmt.query_map(open_refs.as_slice(), |row| {
    Ok((
      row.get::<_, String>(0)?,
      row.get::<_, Option<String>>(1)?,
      row.get::<_, f64>(2)?,
    ))
  })? {
    let (code, symbol, bal) = row?;
    running.insert(code, (symbol, bal));
  }

  let opening_snapshot: std::collections::BTreeMap<String, (Option<String>, f64)> =
    running.clone();

  // Period money in/out via aggregates (not by walking up to 2000 lines).
  let mut period_sql = String::from(
    r#"SELECT c.code, c.symbol,
              COALESCE(SUM(CASE WHEN le.direction='DEBIT' THEN CAST(le.amount AS REAL) ELSE 0 END), 0),
              COALESCE(SUM(CASE WHEN le.direction='CREDIT' THEN CAST(le.amount AS REAL) ELSE 0 END), 0)
       FROM Wallet w
       INNER JOIN LedgerEntry le ON le.walletId = w.id
       INNER JOIN "Transaction" t ON t.id = le.transactionId AND t.deletedAt IS NULL
       INNER JOIN Currency c ON c.id = le.currencyId AND c.deletedAt IS NULL
       WHERE w.customerId = ?1 AND w.type='CUSTOMER' AND w.deletedAt IS NULL
         AND t.valueDate >= ?2 AND t.valueDate < date(?3, '+1 day')"#,
  );
  let mut period_params: Vec<Box<dyn rusqlite::types::ToSql>> = vec![
    Box::new(customer_id.clone()),
    Box::new(from.clone()),
    Box::new(to.clone()),
  ];
  if let Some(ref code) = currency_filter {
    period_sql.push_str(" AND c.code = ?");
    period_params.push(Box::new(code.clone()));
  }
  period_sql.push_str(" GROUP BY c.code, c.symbol ORDER BY c.code");
  let period_refs: Vec<&dyn rusqlite::types::ToSql> =
    period_params.iter().map(|p| p.as_ref()).collect();
  let mut period_stmt = conn.prepare(&period_sql)?;
  let mut period_in: std::collections::BTreeMap<String, (Option<String>, f64)> =
    std::collections::BTreeMap::new();
  let mut period_out: std::collections::BTreeMap<String, (Option<String>, f64)> =
    std::collections::BTreeMap::new();
  let mut closing_map: std::collections::BTreeMap<String, (Option<String>, f64)> =
    opening_snapshot.clone();
  for row in period_stmt.query_map(period_refs.as_slice(), |row| {
    Ok((
      row.get::<_, String>(0)?,
      row.get::<_, Option<String>>(1)?,
      row.get::<_, f64>(2)?,
      row.get::<_, f64>(3)?,
    ))
  })? {
    let (code, symbol, debit, credit) = row?;
    if debit.abs() >= 1e-12 {
      period_in.insert(code.clone(), (symbol.clone(), debit));
    }
    if credit.abs() >= 1e-12 {
      period_out.insert(code.clone(), (symbol.clone(), credit));
    }
    let entry = closing_map.entry(code).or_insert((symbol.clone(), 0.0));
    if entry.0.is_none() {
      entry.0 = symbol;
    }
    entry.1 += debit - credit;
  }

  let line_base = String::from(
    r#"SELECT t.id, t.reference, IFNULL(t.displayRef,''), t.type, t.status, t.description, t.valueDate, c.code, c.symbol,
              COALESCE(SUM(CASE WHEN le.direction='DEBIT' THEN CAST(le.amount AS REAL) ELSE 0 END), 0),
              COALESCE(SUM(CASE WHEN le.direction='CREDIT' THEN CAST(le.amount AS REAL) ELSE 0 END), 0)
       FROM Wallet w
       INNER JOIN LedgerEntry le ON le.walletId = w.id
       INNER JOIN "Transaction" t ON t.id = le.transactionId AND t.deletedAt IS NULL
       INNER JOIN Currency c ON c.id = le.currencyId AND c.deletedAt IS NULL
       WHERE w.customerId = ?1 AND w.type='CUSTOMER' AND w.deletedAt IS NULL
         AND t.valueDate >= ?2 AND t.valueDate < date(?3, '+1 day')"#,
  );
  let mut line_filter = String::new();
  let mut line_params: Vec<Box<dyn rusqlite::types::ToSql>> = vec![
    Box::new(customer_id.clone()),
    Box::new(from.clone()),
    Box::new(to.clone()),
  ];
  if let Some(ref code) = currency_filter {
    line_filter.push_str(" AND c.code = ?");
    line_params.push(Box::new(code.clone()));
  }
  let group_order = format!(
    " GROUP BY t.id, t.reference, t.displayRef, t.type, t.status, t.description, t.valueDate, c.code, c.symbol, t.createdAt, t.displaySeq
      ORDER BY {}, c.code ASC",
    crate::ledger::TX_CHRONO_ASC
  );

  let count_sql = format!(
    "SELECT COUNT(*) FROM ({line_base}{line_filter}{group_order})"
  );
  let count_refs: Vec<&dyn rusqlite::types::ToSql> =
    line_params.iter().map(|p| p.as_ref()).collect();
  let lines_total: i64 = conn.query_row(&count_sql, count_refs.as_slice(), |row| row.get(0))?;

  let page_size = input.page_size.unwrap_or(20).clamp(1, 200);
  let mut page = input.page.unwrap_or(1).max(1);
  let total_pages = if lines_total == 0 {
    1
  } else {
    (lines_total + page_size - 1) / page_size
  };
  if page > total_pages {
    page = total_pages;
  }
  let offset = (page - 1) * page_size;

  // Prefix nets before this page (for running balance_after).
  let mut running = opening_snapshot.clone();
  if offset > 0 {
    let prefix_sql = format!(
      "SELECT code, symbol, SUM(debit - credit) FROM (
         SELECT c.code AS code, c.symbol AS symbol,
                COALESCE(SUM(CASE WHEN le.direction='DEBIT' THEN CAST(le.amount AS REAL) ELSE 0 END), 0) AS debit,
                COALESCE(SUM(CASE WHEN le.direction='CREDIT' THEN CAST(le.amount AS REAL) ELSE 0 END), 0) AS credit
         FROM Wallet w
         INNER JOIN LedgerEntry le ON le.walletId = w.id
         INNER JOIN \"Transaction\" t ON t.id = le.transactionId AND t.deletedAt IS NULL
         INNER JOIN Currency c ON c.id = le.currencyId AND c.deletedAt IS NULL
         WHERE w.customerId = ?1 AND w.type='CUSTOMER' AND w.deletedAt IS NULL
           AND t.valueDate >= ?2 AND t.valueDate < date(?3, '+1 day'){line_filter}
         GROUP BY t.id, t.reference, t.displayRef, t.type, t.status, t.description, t.valueDate, c.code, c.symbol, t.createdAt, t.displaySeq
         ORDER BY t.displaySeq IS NULL, t.displaySeq ASC, t.createdAt ASC, t.rowid ASC, c.code ASC
         LIMIT ?
       ) GROUP BY code, symbol"
    );
    let mut prefix_params: Vec<Box<dyn rusqlite::types::ToSql>> = vec![
      Box::new(customer_id.clone()),
      Box::new(from.clone()),
      Box::new(to.clone()),
    ];
    if let Some(ref code) = currency_filter {
      prefix_params.push(Box::new(code.clone()));
    }
    prefix_params.push(Box::new(offset));
    let prefix_refs: Vec<&dyn rusqlite::types::ToSql> =
      prefix_params.iter().map(|p| p.as_ref()).collect();
    let mut prefix_stmt = conn.prepare(&prefix_sql)?;
    for row in prefix_stmt.query_map(prefix_refs.as_slice(), |row| {
      Ok((
        row.get::<_, String>(0)?,
        row.get::<_, Option<String>>(1)?,
        row.get::<_, f64>(2)?,
      ))
    })? {
      let (code, symbol, net) = row?;
      let entry = running.entry(code).or_insert((symbol.clone(), 0.0));
      if entry.0.is_none() {
        entry.0 = symbol;
      }
      entry.1 += net;
    }
  }

  let page_sql = format!(
    "{line_base}{line_filter}{group_order}
     LIMIT ? OFFSET ?"
  );
  let mut page_params = line_params;
  page_params.push(Box::new(page_size));
  page_params.push(Box::new(offset));
  let page_refs: Vec<&dyn rusqlite::types::ToSql> =
    page_params.iter().map(|p| p.as_ref()).collect();
  let mut line_stmt = conn.prepare(&page_sql)?;
  let mut lines = Vec::new();
  for row in line_stmt.query_map(page_refs.as_slice(), |row| {
    Ok((
      row.get::<_, String>(0)?,
      row.get::<_, String>(1)?,
      row.get::<_, String>(2)?,
      row.get::<_, String>(3)?,
      row.get::<_, String>(4)?,
      row.get::<_, Option<String>>(5)?,
      row.get::<_, String>(6)?,
      row.get::<_, String>(7)?,
      row.get::<_, Option<String>>(8)?,
      row.get::<_, f64>(9)?,
      row.get::<_, f64>(10)?,
    ))
  })? {
    let (id, reference, display_ref, ty, status, description, value_date, code, symbol, debit, credit) =
      row?;
    let entry = running.entry(code.clone()).or_insert((symbol.clone(), 0.0));
    if entry.0.is_none() {
      entry.0 = symbol.clone();
    }
    entry.1 += debit - credit;
    lines.push(CustomerStatementLine {
      id,
      reference,
      display_ref,
      r#type: ty,
      status,
      description,
      value_date,
      debit: format_f64(debit),
      credit: format_f64(credit),
      currency_code: code,
      balance_after: format_f64(entry.1),
      sender_name: None,
      receiver_name: None,
    });
  }

  let transfer_ids: Vec<String> = lines
    .iter()
    .filter(|l| l.r#type.eq_ignore_ascii_case("TRANSFER"))
    .map(|l| l.id.clone())
    .collect::<std::collections::BTreeSet<_>>()
    .into_iter()
    .collect();
  if !transfer_ids.is_empty() {
    let descs: std::collections::HashMap<String, Option<String>> = lines
      .iter()
      .filter(|l| l.r#type.eq_ignore_ascii_case("TRANSFER"))
      .map(|l| (l.id.clone(), l.description.clone()))
      .collect();
    let parties = crate::ledger::fill_transfer_parties(&conn, &transfer_ids, &descs)?;
    for line in &mut lines {
      if let Some(p) = parties.get(&line.id) {
        line.sender_name = p.sender_name.clone();
        line.receiver_name = p.receiver_name.clone();
      }
    }
  }

  // Present newest-first.
  lines.reverse();

  let mut balances = Vec::new();
  let mut codes: std::collections::BTreeSet<String> = std::collections::BTreeSet::new();
  codes.extend(opening_snapshot.keys().cloned());
  codes.extend(closing_map.keys().cloned());
  codes.extend(period_in.keys().cloned());
  codes.extend(period_out.keys().cloned());
  for code in codes {
    let (sym_open, open_bal) = opening_snapshot
      .get(&code)
      .cloned()
      .unwrap_or((None, 0.0));
    let (sym_close, close_bal) = closing_map
      .get(&code)
      .cloned()
      .unwrap_or((sym_open.clone(), open_bal));
    let (sym_in, inn) = period_in.get(&code).cloned().unwrap_or((None, 0.0));
    let (sym_out, out) = period_out.get(&code).cloned().unwrap_or((None, 0.0));
    if open_bal.abs() < 1e-9
      && close_bal.abs() < 1e-9
      && inn.abs() < 1e-9
      && out.abs() < 1e-9
    {
      continue;
    }
    balances.push(CustomerStatementBalance {
      currency_code: code,
      currency_symbol: sym_close.or(sym_in).or(sym_out).or(sym_open),
      opening: format_f64(open_bal),
      money_in: format_f64(inn),
      money_out: format_f64(out),
      closing: format_f64(close_bal),
    });
  }

  let money_in: Vec<ReportCurrencyAmount> = period_in
    .into_iter()
    .filter(|(_, (_, amt))| amt.abs() >= 1e-9)
    .map(|(code, (symbol, amt))| ReportCurrencyAmount {
      currency_code: code,
      currency_symbol: symbol,
      amount: format_f64(amt),
    })
    .collect();
  let money_out: Vec<ReportCurrencyAmount> = period_out
    .into_iter()
    .filter(|(_, (_, amt))| amt.abs() >= 1e-9)
    .map(|(code, (symbol, amt))| ReportCurrencyAmount {
      currency_code: code,
      currency_symbol: symbol,
      amount: format_f64(amt),
    })
    .collect();

  Ok(CustomerStatementReport {
    customer_id,
    customer_name,
    customer_code,
    date_from: from,
    date_to: to,
    money_in,
    money_out,
    balances,
    lines,
    lines_total,
    page,
    page_size,
  })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionsReportRow {
  pub id: String,
  pub reference: String,
  pub display_ref: String,
  pub r#type: String,
  pub status: String,
  pub customer_id: Option<String>,
  pub customer_name: Option<String>,
  pub description: Option<String>,
  pub value_date: String,
  pub amount_summary: String,
  pub sender_name: Option<String>,
  pub receiver_name: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionsReportPage {
  pub date_from: String,
  pub date_to: String,
  pub items: Vec<TransactionsReportRow>,
  pub total: i64,
  pub page: i64,
  pub page_size: i64,
}

#[tauri::command]
pub fn get_transactions_report(
  state: State<'_, AppState>,
  input: ReportFilterInput,
  tx_type: Option<String>,
) -> Result<TransactionsReportPage, AppError> {
  let (from, to) = date_bounds(&input);
  let page_size = input.page_size.unwrap_or(50).clamp(1, 200);
  let mut page = input.page.unwrap_or(1).max(1);
  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "reports")?;

  let mut where_sql = String::from(
    r#"WHERE t.deletedAt IS NULL
         AND t.valueDate >= ?1 AND t.valueDate < date(?2, '+1 day')"#,
  );
  let mut params_v: Vec<Box<dyn rusqlite::types::ToSql>> =
    vec![Box::new(from.clone()), Box::new(to.clone())];

  if let Some(ref t) = tx_type {
    let t = t.trim().to_ascii_uppercase();
    if !t.is_empty() && t != "ALL" {
      where_sql.push_str(" AND t.type = ?");
      params_v.push(Box::new(t));
    }
  }
  if let Some(ref cid) = input.customer_id {
    let cid = cid.trim();
    if !cid.is_empty() {
      where_sql.push_str(" AND t.customerId = ?");
      params_v.push(Box::new(cid.to_string()));
    }
  }
  if let Some(ref st) = input.status {
    let st = st.trim().to_ascii_uppercase();
    if !st.is_empty() && st != "ALL" {
      where_sql.push_str(" AND t.status = ?");
      params_v.push(Box::new(st));
    }
  }
  if let Some(ref reference) = input.reference {
    let reference = reference.trim();
    if !reference.is_empty() {
      where_sql.push_str(" AND (t.reference LIKE ? OR IFNULL(t.displayRef,'') LIKE ?)");
      params_v.push(Box::new(format!("%{reference}%")));
      params_v.push(Box::new(format!("%{reference}%")));
    }
  }
  if let Some(ref code) = input.currency_code {
    let code = code.trim().to_ascii_uppercase();
    if !code.is_empty() && code != "ALL" {
      where_sql.push_str(
        r#" AND EXISTS (
              SELECT 1 FROM LedgerEntry le
              INNER JOIN Currency cur ON cur.id = le.currencyId
              WHERE le.transactionId = t.id AND cur.code = ?
            )"#,
      );
      params_v.push(Box::new(code));
    }
  }
  if let Some(ref amount) = input.amount {
    let amount = amount.trim().replace(',', "");
    if !amount.is_empty() {
      if let Ok(amt) = amount.parse::<f64>() {
        where_sql.push_str(
          r#" AND EXISTS (
                SELECT 1 FROM LedgerEntry le
                WHERE le.transactionId = t.id
                  AND ABS(CAST(le.amount AS REAL) - ?) < 0.0005
              )"#,
        );
        params_v.push(Box::new(amt));
      } else {
        where_sql.push_str(
          r#" AND EXISTS (
                SELECT 1 FROM LedgerEntry le
                WHERE le.transactionId = t.id
                  AND CAST(le.amount AS TEXT) LIKE ?
              )"#,
        );
        params_v.push(Box::new(format!("%{amount}%")));
      }
    }
  }
  if let Some(ref q) = input.search {
    let q = q.trim();
    if !q.is_empty() {
      let like = format!("%{q}%");
      where_sql.push_str(
        " AND (t.reference LIKE ? OR IFNULL(t.displayRef,'') LIKE ? OR IFNULL(t.description,'') LIKE ? OR IFNULL(c.fullName,'') LIKE ?)",
      );
      params_v.push(Box::new(like.clone()));
      params_v.push(Box::new(like.clone()));
      params_v.push(Box::new(like.clone()));
      params_v.push(Box::new(like));
    }
  }

  let count_sql = format!(
    r#"SELECT COUNT(*) FROM "Transaction" t
       LEFT JOIN Customer c ON c.id = t.customerId
       {where_sql}"#
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

  let chrono = crate::ledger::TX_CHRONO_ASC;
  let list_sql = format!(
    r#"SELECT t.id, t.reference, IFNULL(t.displayRef,''), t.type, t.status, t.customerId, c.fullName, t.description, t.valueDate
       FROM "Transaction" t
       LEFT JOIN Customer c ON c.id = t.customerId
       {where_sql}
       ORDER BY {chrono}
       LIMIT ? OFFSET ?"#
  );
  let mut list_params = params_v;
  list_params.push(Box::new(page_size));
  list_params.push(Box::new(offset));
  let list_refs: Vec<&dyn rusqlite::types::ToSql> =
    list_params.iter().map(|p| p.as_ref()).collect();
  let mut stmt = conn.prepare(&list_sql)?;
  let mut items = stmt
    .query_map(list_refs.as_slice(), |row| {
      Ok(TransactionsReportRow {
        id: row.get(0)?,
        reference: row.get(1)?,
        display_ref: row.get(2)?,
        r#type: row.get(3)?,
        status: row.get(4)?,
        customer_id: row.get(5)?,
        customer_name: row.get(6)?,
        description: row.get(7)?,
        value_date: row.get(8)?,
        amount_summary: String::new(),
        sender_name: None,
        receiver_name: None,
      })
    })?
    .collect::<Result<Vec<_>, _>>()?;

  if !items.is_empty() {
    let ids: Vec<String> = items.iter().map(|i| i.id.clone()).collect();
    let by_tx = crate::ledger::fill_customer_facing_amount_summaries(&conn, &ids)?;
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
    let parties = crate::ledger::fill_transfer_parties(&conn, &transfer_ids, &descs)?;
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

  Ok(TransactionsReportPage {
    date_from: from,
    date_to: to,
    items,
    total,
    page,
    page_size,
  })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DayCurrencyPosition {
  pub currency_code: String,
  pub currency_symbol: Option<String>,
  pub opening: String,
  pub money_in: String,
  pub money_out: String,
  pub net: String,
  pub closing: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyReport {
  pub business_date: String,
  pub positions: Vec<DayCurrencyPosition>,
  pub money_in: Vec<ReportCurrencyAmount>,
  pub money_out: Vec<ReportCurrencyAmount>,
  pub net_movement: Vec<ReportCurrencyAmount>,
  pub deposits: i64,
  pub withdrawals: i64,
  pub transfers: i64,
  pub exchanges: i64,
  pub hawalas: i64,
  pub other_transactions: i64,
  pub total_transactions: i64,
  pub hawala_sent_count: i64,
  pub hawala_received_count: i64,
  pub hawala_sent: Vec<ReportCurrencyAmount>,
  pub hawala_received: Vec<ReportCurrencyAmount>,
  pub exchange_count: i64,
  pub exchange_profit: Vec<ReportCurrencyAmount>,
  pub transactions: Vec<TransactionsReportRow>,
  pub transactions_total: i64,
  pub page: i64,
  pub page_size: i64,
}

fn cash_balances_before(
  conn: &Connection,
  before_date: &str,
) -> Result<std::collections::BTreeMap<String, (Option<String>, f64)>, AppError> {
  let mut map = std::collections::BTreeMap::new();
  let mut stmt = conn.prepare(
    r#"SELECT c.code, c.symbol,
              COALESCE(SUM(CASE WHEN le.direction='DEBIT' THEN CAST(le.amount AS REAL)
                                ELSE -CAST(le.amount AS REAL) END), 0)
       FROM Wallet w
       INNER JOIN LedgerEntry le ON le.walletId = w.id
       INNER JOIN "Transaction" t ON t.id = le.transactionId AND t.deletedAt IS NULL
       INNER JOIN Currency c ON c.id = le.currencyId AND c.deletedAt IS NULL
       WHERE w.deletedAt IS NULL AND w.isActive = 1
         AND ((w.type = 'VAULT' AND w.name = 'Main Vault') OR w.type = 'TILL')
         AND t.valueDate < ?1
       GROUP BY c.code, c.symbol
       ORDER BY c.code"#,
  )?;
  for row in stmt.query_map([before_date], |row| {
    Ok((
      row.get::<_, String>(0)?,
      row.get::<_, Option<String>>(1)?,
      row.get::<_, f64>(2)?,
    ))
  })? {
    let (code, symbol, bal) = row?;
    map.insert(code, (symbol, bal));
  }
  Ok(map)
}

fn cash_flow_map(
  conn: &Connection,
  from: &str,
  to: &str,
) -> Result<std::collections::BTreeMap<String, (Option<String>, f64, f64)>, AppError> {
  let mut map = std::collections::BTreeMap::new();
  let mut stmt = conn.prepare(
    r#"SELECT c.code, c.symbol,
              COALESCE(SUM(CASE WHEN le.direction='DEBIT' THEN CAST(le.amount AS REAL) ELSE 0 END), 0),
              COALESCE(SUM(CASE WHEN le.direction='CREDIT' THEN CAST(le.amount AS REAL) ELSE 0 END), 0)
       FROM Wallet w
       INNER JOIN LedgerEntry le ON le.walletId = w.id
       INNER JOIN "Transaction" t ON t.id = le.transactionId AND t.deletedAt IS NULL
       INNER JOIN Currency c ON c.id = le.currencyId AND c.deletedAt IS NULL
       WHERE w.deletedAt IS NULL AND w.isActive = 1
         AND ((w.type = 'VAULT' AND w.name = 'Main Vault') OR w.type = 'TILL')
         AND t.valueDate >= ?1 AND t.valueDate < date(?2, '+1 day')
       GROUP BY c.code, c.symbol"#,
  )?;
  for row in stmt.query_map(params![from, to], |row| {
    Ok((
      row.get::<_, String>(0)?,
      row.get::<_, Option<String>>(1)?,
      row.get::<_, f64>(2)?,
      row.get::<_, f64>(3)?,
    ))
  })? {
    let (code, symbol, inn, out) = row?;
    map.insert(code, (symbol, inn, out));
  }
  Ok(map)
}

fn build_positions(
  opening: &std::collections::BTreeMap<String, (Option<String>, f64)>,
  flows: &std::collections::BTreeMap<String, (Option<String>, f64, f64)>,
) -> (
  Vec<DayCurrencyPosition>,
  Vec<ReportCurrencyAmount>,
  Vec<ReportCurrencyAmount>,
  Vec<ReportCurrencyAmount>,
) {
  let mut codes = std::collections::BTreeSet::new();
  codes.extend(opening.keys().cloned());
  codes.extend(flows.keys().cloned());

  let mut positions = Vec::new();
  let mut money_in = Vec::new();
  let mut money_out = Vec::new();
  let mut net_movement = Vec::new();

  for code in codes {
    let (sym_o, open) = opening.get(&code).cloned().unwrap_or((None, 0.0));
    let (sym_f, inn, out) = flows.get(&code).cloned().unwrap_or((sym_o.clone(), 0.0, 0.0));
    let symbol = sym_f.or(sym_o);
    let net = inn - out;
    let closing = open + net;
    if open.abs() < 1e-9 && inn.abs() < 1e-9 && out.abs() < 1e-9 {
      continue;
    }
    positions.push(DayCurrencyPosition {
      currency_code: code.clone(),
      currency_symbol: symbol.clone(),
      opening: format_f64(open),
      money_in: format_f64(inn),
      money_out: format_f64(out),
      net: format_f64(net),
      closing: format_f64(closing),
    });
    if inn.abs() > 1e-9 {
      money_in.push(ReportCurrencyAmount {
        currency_code: code.clone(),
        currency_symbol: symbol.clone(),
        amount: format_f64(inn),
      });
    }
    if out.abs() > 1e-9 {
      money_out.push(ReportCurrencyAmount {
        currency_code: code.clone(),
        currency_symbol: symbol.clone(),
        amount: format_f64(out),
      });
    }
    if net.abs() > 1e-9 {
      net_movement.push(ReportCurrencyAmount {
        currency_code: code,
        currency_symbol: symbol,
        amount: format_f64(net),
      });
    }
  }

  (positions, money_in, money_out, net_movement)
}

fn list_transactions_for_range(
  conn: &Connection,
  from: &str,
  to: &str,
  limit: i64,
  offset: i64,
) -> Result<Vec<TransactionsReportRow>, AppError> {
  let mut stmt = conn.prepare(&format!(
    r#"SELECT t.id, t.reference, IFNULL(t.displayRef,''), t.type, t.status, t.customerId, c.fullName, t.description, t.valueDate
       FROM "Transaction" t
       LEFT JOIN Customer c ON c.id = t.customerId
       WHERE t.deletedAt IS NULL
         AND t.valueDate >= ?1 AND t.valueDate < date(?2, '+1 day')
       ORDER BY {}
       LIMIT ?3 OFFSET ?4"#,
    crate::ledger::TX_CHRONO_ASC
  ))?;
  let mut items = stmt
    .query_map(params![from, to, limit, offset], |row| {
      Ok(TransactionsReportRow {
        id: row.get(0)?,
        reference: row.get(1)?,
        display_ref: row.get(2)?,
        r#type: row.get(3)?,
        status: row.get(4)?,
        customer_id: row.get(5)?,
        customer_name: row.get(6)?,
        description: row.get(7)?,
        value_date: row.get(8)?,
        amount_summary: String::new(),
        sender_name: None,
        receiver_name: None,
      })
    })?
    .collect::<Result<Vec<_>, _>>()?;

  if items.is_empty() {
    return Ok(items);
  }

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
  Ok(items)
}

fn parse_iso_day(raw: &str) -> Result<String, AppError> {
  let s = raw.trim();
  if s.len() < 10 {
    return Err(AppError::Validation(
      "businessDate must be YYYY-MM-DD.".into(),
    ));
  }
  let day = &s[..10];
  if chrono::NaiveDate::parse_from_str(day, "%Y-%m-%d").is_err() {
    return Err(AppError::Validation(
      "businessDate must be a valid YYYY-MM-DD date.".into(),
    ));
  }
  Ok(day.to_string())
}

fn parse_year_month(raw: &str) -> Result<(i32, u32, String), AppError> {
  let s = raw.trim();
  let ym = if s.len() >= 7 { &s[..7] } else { s };
  let parts: Vec<&str> = ym.split('-').collect();
  if parts.len() != 2 {
    return Err(AppError::Validation("month must be YYYY-MM.".into()));
  }
  let year: i32 = parts[0]
    .parse()
    .map_err(|_| AppError::Validation("Invalid year.".into()))?;
  let month: u32 = parts[1]
    .parse()
    .map_err(|_| AppError::Validation("Invalid month.".into()))?;
  if !(1..=12).contains(&month) || year < 1970 || year > 2100 {
    return Err(AppError::Validation("month out of range.".into()));
  }
  Ok((year, month, format!("{year:04}-{month:02}")))
}

#[tauri::command]
pub fn get_daily_report(
  state: State<'_, AppState>,
  business_date: String,
  page: Option<i64>,
  page_size: Option<i64>,
) -> Result<DailyReport, AppError> {
  let day = parse_iso_day(&business_date)?;
  let page_size = page_size.unwrap_or(20).clamp(1, 200);
  let mut page = page.unwrap_or(1).max(1);
  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "reports")?;

  let opening = cash_balances_before(&conn, &day)?;
  let flows = cash_flow_map(&conn, &day, &day)?;
  let (positions, money_in, money_out, net_movement) = build_positions(&opening, &flows);

  let deposits = count_tx_type(&conn, "DEPOSIT", &day, &day)?;
  let withdrawals = count_tx_type(&conn, "WITHDRAWAL", &day, &day)?;
  let transfers = count_tx_type(&conn, "TRANSFER", &day, &day)?;
  let exchanges = count_tx_type(&conn, "EXCHANGE", &day, &day)?;
  let hawalas = count_tx_type(&conn, "HAWALA", &day, &day)?;
  let total: i64 = conn.query_row(
    r#"SELECT COUNT(*) FROM "Transaction"
       WHERE deletedAt IS NULL
         AND valueDate >= ?1 AND valueDate < date(?1, '+1 day')"#,
    [&day],
    |row| row.get(0),
  )?;
  let classified = deposits + withdrawals + transfers + exchanges + hawalas;
  let other_transactions = (total - classified).max(0);

  let (hawala_sent_count, hawala_sent) =
    hawala_totals_by_direction(&conn, &day, &day, "SEND")?;
  let (hawala_received_count, hawala_received) =
    hawala_totals_by_direction(&conn, &day, &day, "RECEIVE")?;
  let (exchange_count, exchange_profit) = exchange_profit_by_currency(&conn, &day, &day)?;

  let total_pages = if total == 0 {
    1
  } else {
    (total + page_size - 1) / page_size
  };
  if page > total_pages {
    page = total_pages;
  }
  let offset = (page - 1) * page_size;
  let transactions = list_transactions_for_range(&conn, &day, &day, page_size, offset)?;

  Ok(DailyReport {
    business_date: day,
    positions,
    money_in,
    money_out,
    net_movement,
    deposits,
    withdrawals,
    transfers,
    exchanges,
    hawalas,
    other_transactions,
    total_transactions: total,
    hawala_sent_count,
    hawala_received_count,
    hawala_sent,
    hawala_received,
    exchange_count,
    exchange_profit,
    transactions,
    transactions_total: total,
    page,
    page_size,
  })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonthlyDayRow {
  pub business_date: String,
  pub total_transactions: i64,
  pub deposits: i64,
  pub withdrawals: i64,
  pub transfers: i64,
  pub exchanges: i64,
  pub hawalas: i64,
  pub money_in: Vec<ReportCurrencyAmount>,
  pub money_out: Vec<ReportCurrencyAmount>,
  pub net_movement: Vec<ReportCurrencyAmount>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonthlyReport {
  pub year_month: String,
  pub date_from: String,
  pub date_to: String,
  pub positions: Vec<DayCurrencyPosition>,
  pub positions_total: i64,
  pub page: i64,
  pub page_size: i64,
  pub money_in: Vec<ReportCurrencyAmount>,
  pub money_out: Vec<ReportCurrencyAmount>,
  pub net_movement: Vec<ReportCurrencyAmount>,
  pub hawala_sent_count: i64,
  pub hawala_received_count: i64,
  pub hawala_sent: Vec<ReportCurrencyAmount>,
  pub hawala_received: Vec<ReportCurrencyAmount>,
  pub exchange_count: i64,
  pub exchange_profit: Vec<ReportCurrencyAmount>,
  pub total_transactions: i64,
  pub deposits: i64,
  pub withdrawals: i64,
  pub transfers: i64,
  pub exchanges: i64,
  pub hawalas: i64,
  pub days: Vec<MonthlyDayRow>,
}

#[tauri::command]
pub fn get_monthly_report(
  state: State<'_, AppState>,
  year_month: String,
  page: Option<i64>,
  page_size: Option<i64>,
) -> Result<MonthlyReport, AppError> {
  let (year, month, ym) = parse_year_month(&year_month)?;
  let date_from = format!("{ym}-01");
  let last_day = chrono::NaiveDate::from_ymd_opt(year, month, 1)
    .and_then(|_d| {
      if month == 12 {
        chrono::NaiveDate::from_ymd_opt(year + 1, 1, 1)
      } else {
        chrono::NaiveDate::from_ymd_opt(year, month + 1, 1)
      }
      .map(|next| (next - chrono::Duration::days(1)).day())
    })
    .ok_or_else(|| AppError::Validation("Invalid month.".into()))?;
  let date_to = format!("{ym}-{last_day:02}");

  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "reports")?;
  let opening = cash_balances_before(&conn, &date_from)?;
  // Closing = balances before the day after month end.
  let after_month = chrono::NaiveDate::parse_from_str(&date_to, "%Y-%m-%d")
    .map(|d| (d + chrono::Duration::days(1)).format("%Y-%m-%d").to_string())
    .map_err(|_| AppError::Validation("Invalid month end.".into()))?;
  let closing_map = cash_balances_before(&conn, &after_month)?;
  let flows = cash_flow_map(&conn, &date_from, &date_to)?;

  // Build positions with month opening + month flow + true closing from ledger.
  let (mut positions, money_in, money_out, net_movement) = build_positions(&opening, &flows);
  for pos in &mut positions {
    if let Some((_, close)) = closing_map.get(&pos.currency_code) {
      pos.closing = format_f64(*close);
    }
  }
  // Include currencies that only appear in closing (no month activity but had opening).
  for (code, (symbol, close)) in &closing_map {
    if positions.iter().any(|p| &p.currency_code == code) {
      continue;
    }
    let (sym_o, open) = opening.get(code).cloned().unwrap_or((symbol.clone(), 0.0));
    if open.abs() < 1e-9 && close.abs() < 1e-9 {
      continue;
    }
    positions.push(DayCurrencyPosition {
      currency_code: code.clone(),
      currency_symbol: symbol.clone().or(sym_o),
      opening: format_f64(open),
      money_in: format_f64(0.0),
      money_out: format_f64(0.0),
      net: format_f64(close - open),
      closing: format_f64(*close),
    });
  }
  positions.sort_by(|a, b| a.currency_code.cmp(&b.currency_code));

  let deposits = count_tx_type(&conn, "DEPOSIT", &date_from, &date_to)?;
  let withdrawals = count_tx_type(&conn, "WITHDRAWAL", &date_from, &date_to)?;
  let transfers = count_tx_type(&conn, "TRANSFER", &date_from, &date_to)?;
  let exchanges = count_tx_type(&conn, "EXCHANGE", &date_from, &date_to)?;
  let hawalas = count_tx_type(&conn, "HAWALA", &date_from, &date_to)?;
  let total_transactions: i64 = conn.query_row(
    r#"SELECT COUNT(*) FROM "Transaction"
       WHERE deletedAt IS NULL
         AND valueDate >= ?1 AND valueDate < date(?2, '+1 day')"#,
    params![date_from, date_to],
    |row| row.get(0),
  )?;

  let (hawala_sent_count, hawala_sent) =
    hawala_totals_by_direction(&conn, &date_from, &date_to, "SEND")?;
  let (hawala_received_count, hawala_received) =
    hawala_totals_by_direction(&conn, &date_from, &date_to, "RECEIVE")?;
  let (exchange_count, exchange_profit) =
    exchange_profit_by_currency(&conn, &date_from, &date_to)?;

  // Preload per-day activity for the month.
  let mut day_tx: std::collections::BTreeMap<String, (i64, i64, i64, i64, i64, i64)> =
    std::collections::BTreeMap::new();
  {
    let mut stmt = conn.prepare(
      r#"SELECT date(t.valueDate), t.type, COUNT(*)
         FROM "Transaction" t
         WHERE t.deletedAt IS NULL
           AND t.valueDate >= ?1 AND t.valueDate < date(?2, '+1 day')
         GROUP BY date(t.valueDate), t.type"#,
    )?;
    for row in stmt.query_map(params![date_from, date_to], |row| {
      Ok((
        row.get::<_, String>(0)?,
        row.get::<_, String>(1)?,
        row.get::<_, i64>(2)?,
      ))
    })? {
      let (d, ty, cnt) = row?;
      let e = day_tx.entry(d).or_insert((0, 0, 0, 0, 0, 0));
      e.0 += cnt;
      match ty.as_str() {
        "DEPOSIT" => e.1 += cnt,
        "WITHDRAWAL" => e.2 += cnt,
        "TRANSFER" => e.3 += cnt,
        "EXCHANGE" => e.4 += cnt,
        "HAWALA" => e.5 += cnt,
        _ => {}
      }
    }
  }

  let mut day_flows: std::collections::BTreeMap<
    String,
    std::collections::BTreeMap<String, (Option<String>, f64, f64)>,
  > = std::collections::BTreeMap::new();
  {
    let mut stmt = conn.prepare(
      r#"SELECT date(t.valueDate), c.code, c.symbol,
                COALESCE(SUM(CASE WHEN le.direction='DEBIT' THEN CAST(le.amount AS REAL) ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN le.direction='CREDIT' THEN CAST(le.amount AS REAL) ELSE 0 END), 0)
         FROM Wallet w
         INNER JOIN LedgerEntry le ON le.walletId = w.id
         INNER JOIN "Transaction" t ON t.id = le.transactionId AND t.deletedAt IS NULL
         INNER JOIN Currency c ON c.id = le.currencyId AND c.deletedAt IS NULL
         WHERE w.deletedAt IS NULL AND w.isActive = 1
           AND ((w.type = 'VAULT' AND w.name = 'Main Vault') OR w.type = 'TILL')
           AND t.valueDate >= ?1 AND t.valueDate < date(?2, '+1 day')
         GROUP BY date(t.valueDate), c.code, c.symbol"#,
    )?;
    for row in stmt.query_map(params![date_from, date_to], |row| {
      Ok((
        row.get::<_, String>(0)?,
        row.get::<_, String>(1)?,
        row.get::<_, Option<String>>(2)?,
        row.get::<_, f64>(3)?,
        row.get::<_, f64>(4)?,
      ))
    })? {
      let (d, code, symbol, inn, out) = row?;
      day_flows
        .entry(d)
        .or_default()
        .insert(code, (symbol, inn, out));
    }
  }

  let mut days = Vec::new();
  let start = chrono::NaiveDate::parse_from_str(&date_from, "%Y-%m-%d")
    .map_err(|_| AppError::Validation("Invalid month start.".into()))?;
  let end = chrono::NaiveDate::parse_from_str(&date_to, "%Y-%m-%d")
    .map_err(|_| AppError::Validation("Invalid month end.".into()))?;
  let mut cursor = start;
  while cursor <= end {
    let d = cursor.format("%Y-%m-%d").to_string();
    let (total, dep, wit, tr, ex, haw) = day_tx.get(&d).copied().unwrap_or((0, 0, 0, 0, 0, 0));
    let empty_flow = std::collections::BTreeMap::new();
    let flow = day_flows.get(&d).unwrap_or(&empty_flow);
    let mut mi = Vec::new();
    let mut mo = Vec::new();
    let mut mn = Vec::new();
    for (code, (symbol, inn, out)) in flow {
      if *inn > 1e-9 {
        mi.push(ReportCurrencyAmount {
          currency_code: code.clone(),
          currency_symbol: symbol.clone(),
          amount: format_f64(*inn),
        });
      }
      if *out > 1e-9 {
        mo.push(ReportCurrencyAmount {
          currency_code: code.clone(),
          currency_symbol: symbol.clone(),
          amount: format_f64(*out),
        });
      }
      let net = *inn - *out;
      if net.abs() > 1e-9 {
        mn.push(ReportCurrencyAmount {
          currency_code: code.clone(),
          currency_symbol: symbol.clone(),
          amount: format_f64(net),
        });
      }
    }
    // Skip completely empty days to keep the list useful for historical months.
    if total > 0 || !mi.is_empty() || !mo.is_empty() {
      days.push(MonthlyDayRow {
        business_date: d,
        total_transactions: total,
        deposits: dep,
        withdrawals: wit,
        transfers: tr,
        exchanges: ex,
        hawalas: haw,
        money_in: mi,
        money_out: mo,
        net_movement: mn,
      });
    }
    cursor += chrono::Duration::days(1);
  }

  let positions_total = positions.len() as i64;
  let (pos_page, pos_page_size, pos_offset) = clamp_page(page, page_size, positions_total);
  let positions: Vec<DayCurrencyPosition> = positions
    .into_iter()
    .skip(pos_offset as usize)
    .take(pos_page_size as usize)
    .collect();

  Ok(MonthlyReport {
    year_month: ym,
    date_from,
    date_to,
    positions,
    positions_total,
    page: pos_page,
    page_size: pos_page_size,
    money_in,
    money_out,
    net_movement,
    hawala_sent_count,
    hawala_received_count,
    hawala_sent,
    hawala_received,
    exchange_count,
    exchange_profit,
    total_transactions,
    deposits,
    withdrawals,
    transfers,
    exchanges,
    hawalas,
    days,
  })
}

/// Cash vault ↔ vault transfer (same currency) for owner capital ops.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CashVaultTransferInput {
  pub from_wallet_id: String,
  pub to_wallet_id: String,
  pub currency_code: String,
  pub amount: String,
  pub notes: Option<String>,
  pub value_date: Option<String>,
  pub created_by_id: String,
}

#[tauri::command]
pub fn transfer_cash_between_vaults(
  state: State<'_, AppState>,
  input: CashVaultTransferInput,
) -> Result<PostedTransaction, AppError> {
  let from = input.from_wallet_id.trim().to_string();
  let to = input.to_wallet_id.trim().to_string();
  if from.is_empty() || to.is_empty() || from == to {
    return Err(AppError::Validation(
      "fromWalletId and toWalletId must be different cash wallets.".into(),
    ));
  }
  let _ = input.created_by_id.trim();

  let conn = state.db.lock();
  let actor = require_screen(&state, &conn, "reports")?;
  let created_by = actor.id.clone();
  for id in [&from, &to] {
    let (t, active): (String, i64) = conn.query_row(
      "SELECT type, isActive FROM Wallet WHERE id=?1 AND deletedAt IS NULL",
      [id],
      |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    if active != 1 || (t != "VAULT" && t != "TILL") {
      return Err(AppError::Validation(
        "Both wallets must be active vault or till.".into(),
      ));
    }
  }
  let (_cid, code, places) = find_currency_by_code(&conn, &input.currency_code)?;
  let minor = money_from_major_units(input.amount.trim(), places)?;
  if minor <= 0 {
    return Err(AppError::Validation("Amount must be positive.".into()));
  }
  let value_date = input
    .value_date
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(|s| s.to_string())
    .unwrap_or_else(|| {
      chrono::Utc::now()
        .format("%Y-%m-%d %H:%M:%S%.3f")
        .to_string()
    });
  let notes = input
    .notes
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(|s| s.to_string());

  post_transaction(
    &conn,
    PostTransactionInput {
      reference: format!("CASH-XFER-{}", chrono::Utc::now().timestamp_millis()),
      r#type: "TRANSFER".into(),
      value_date,
      customer_id: None,
      walk_in_name: None,
      walk_in_phone: None,
      description: notes.or_else(|| Some("Cash vault transfer".into())),
      created_by_id: Some(created_by),
      entries: vec![
        PostingLineDto {
          wallet_id: from,
          currency: code.clone(),
          direction: "CREDIT".into(),
          amount_minor: minor.to_string(),
          exchange_rate_id: None,
          memo: Some("Cash transfer out".into()),
        },
        PostingLineDto {
          wallet_id: to,
          currency: code,
          direction: "DEBIT".into(),
          amount_minor: minor.to_string(),
          exchange_rate_id: None,
          memo: Some("Cash transfer in".into()),
        },
      ],
    },
  )
}
