//! Report Center — read-only aggregates from ledger / hawala / trading (no duplicate stores).

use rusqlite::{params, Connection};
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
  let snap = compute_owner_capital_snapshot(&conn)?;
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
  let snap = compute_owner_capital_snapshot(&conn)?;
  Ok(
    snap
      .by_currency
      .into_iter()
      .map(|r| {
        let cash: f64 = r.cash.parse().unwrap_or(0.0);
        let customer: f64 = r.customer_funds.parse().unwrap_or(0.0);
        let payable: f64 = r.partner_payable.parse().unwrap_or(0.0);
        let pending: f64 = r.pending_hawala.parse().unwrap_or(0.0);
        let available = cash - customer - payable - pending;
        CurrencyOwnershipRow {
          currency_code: r.currency_code,
          currency_symbol: r.currency_symbol,
          cash_in_vault: r.cash,
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
  let mut stmt = conn.prepare(
    r#"SELECT c.code, c.symbol,
              COALESCE(SUM(CASE WHEN le.direction='DEBIT' THEN CAST(le.amount AS REAL)
                                ELSE -CAST(le.amount AS REAL) END), 0) AS bal,
              COALESCE(SUM(CASE WHEN w.type='VAULT' AND le.direction='DEBIT' THEN CAST(le.amount AS REAL)
                                WHEN w.type='VAULT' THEN -CAST(le.amount AS REAL) ELSE 0 END), 0),
              COALESCE(SUM(CASE WHEN w.type='TILL' AND le.direction='DEBIT' THEN CAST(le.amount AS REAL)
                                WHEN w.type='TILL' THEN -CAST(le.amount AS REAL) ELSE 0 END), 0)
       FROM Wallet w
       INNER JOIN LedgerEntry le ON le.walletId = w.id
       INNER JOIN "Transaction" t ON t.id = le.transactionId AND t.deletedAt IS NULL
       INNER JOIN Currency c ON c.id = le.currencyId AND c.deletedAt IS NULL
       WHERE w.type IN ('VAULT','TILL') AND w.deletedAt IS NULL AND w.isActive = 1
       GROUP BY c.code, c.symbol
       HAVING ABS(COALESCE(SUM(CASE WHEN le.direction='DEBIT' THEN CAST(le.amount AS REAL)
                                    ELSE -CAST(le.amount AS REAL) END), 0)) > 1e-9
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
      where_sql.push_str(" AND h.reference LIKE ?");
      params_s.push(format!("%{reference}%"));
    }
  }
  if let Some(ref q) = input.search {
    let q = q.trim();
    if !q.is_empty() {
      let like = format!("%{q}%");
      where_sql.push_str(
        " AND (h.reference LIKE ? OR IFNULL(h.senderName,'') LIKE ? OR IFNULL(h.receiverName,'') LIKE ? OR IFNULL(cust.fullName,'') LIKE ?)",
      );
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

  let list_sql = format!(
    r#"SELECT h.id, h.transactionId, h.reference, h.direction, h.status, CAST(h.amount AS TEXT), cur.code,
              h.customerId, cust.fullName, h.senderName, h.receiverName,
              COALESCE(p.name, h.partnerSarafi), h.destinationCity, h.destinationCountry,
              CAST(h.ownCommissionAmount AS TEXT), CAST(h.commissionAmount AS TEXT), h.valueDate
       FROM HawalaTransfer h
       INNER JOIN Currency cur ON cur.id = h.currencyId
       LEFT JOIN Customer cust ON cust.id = h.customerId
       LEFT JOIN PartnerSarafi p ON p.id = h.partnerSarafiId
       {where_sql}
       ORDER BY h.valueDate DESC, h.createdAt DESC
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
        direction: row.get(3)?,
        status: row.get(4)?,
        amount: row.get(5)?,
        currency_code: row.get(6)?,
        customer_id: row.get(7)?,
        customer_name: row.get(8)?,
        sender_name: row.get(9)?,
        receiver_name: row.get(10)?,
        partner_name: row.get(11)?,
        destination_city: row.get(12)?,
        destination_country: row.get(13)?,
        own_commission: row.get(14)?,
        partner_commission: row.get(15)?,
        value_date: row.get(16)?,
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
  let mut stmt = conn.prepare(
    r#"SELECT p.id, p.name, cur.code,
              COALESCE(SUM(CASE WHEN h.commissionSide='PAYABLE'
                THEN CAST(h.commissionAmount AS REAL) ELSE 0 END), 0),
              COALESCE(SUM(CASE WHEN h.commissionSide='RECEIVABLE'
                THEN CAST(h.commissionAmount AS REAL) ELSE 0 END), 0)
       FROM PartnerSarafi p
       INNER JOIN HawalaTransfer h ON h.partnerSarafiId = p.id AND h.deletedAt IS NULL
         AND h.status IN ('SENT','RECEIVED','COMPLETED','PENDING') AND h.commissionAmount IS NOT NULL
       INNER JOIN Currency cur ON cur.id = COALESCE(h.commissionCurrencyId, h.currencyId)
       WHERE p.deletedAt IS NULL
       GROUP BY p.id, p.name, cur.code
       HAVING ABS(COALESCE(SUM(CASE WHEN h.commissionSide='PAYABLE'
                THEN CAST(h.commissionAmount AS REAL) ELSE 0 END), 0))
            + ABS(COALESCE(SUM(CASE WHEN h.commissionSide='RECEIVABLE'
                THEN CAST(h.commissionAmount AS REAL) ELSE 0 END), 0)) > 1e-9
       ORDER BY p.name, cur.code
       LIMIT 2000"#,
  )?;
  let rows = stmt
    .query_map([], |row| {
      let payable: f64 = row.get(3)?;
      let receivable: f64 = row.get(4)?;
      Ok(PartnerBalanceReportRow {
        partner_id: row.get(0)?,
        partner_name: row.get(1)?,
        currency_code: row.get(2)?,
        payable: format_f64(payable),
        receivable: format_f64(receivable),
        net: format_f64(receivable - payable),
      })
    })?
    .collect::<Result<Vec<_>, _>>()?;
  Ok(rows)
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
       WHERE w.type IN ('VAULT','TILL') AND w.deletedAt IS NULL AND w.isActive = 1
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
              COALESCE(SUM(CASE WHEN le.direction='DEBIT' THEN CAST(le.amount AS REAL)
                                ELSE -CAST(le.amount AS REAL) END), 0) AS bal,
              COALESCE(SUM(CASE WHEN w.type='VAULT' AND le.direction='DEBIT' THEN CAST(le.amount AS REAL)
                                WHEN w.type='VAULT' THEN -CAST(le.amount AS REAL) ELSE 0 END), 0),
              COALESCE(SUM(CASE WHEN w.type='TILL' AND le.direction='DEBIT' THEN CAST(le.amount AS REAL)
                                WHEN w.type='TILL' THEN -CAST(le.amount AS REAL) ELSE 0 END), 0)
       FROM Wallet w
       INNER JOIN LedgerEntry le ON le.walletId = w.id
       INNER JOIN "Transaction" t ON t.id = le.transactionId AND t.deletedAt IS NULL
       INNER JOIN Currency c ON c.id = le.currencyId AND c.deletedAt IS NULL
       WHERE w.type IN ('VAULT','TILL') AND w.deletedAt IS NULL AND w.isActive = 1
       GROUP BY c.code, c.symbol
       HAVING ABS(COALESCE(SUM(CASE WHEN le.direction='DEBIT' THEN CAST(le.amount AS REAL)
                                    ELSE -CAST(le.amount AS REAL) END), 0)) > 1e-9
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
  let balances_by_currency = cash_balances_now(&conn)?;

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
}

#[tauri::command]
pub fn get_cash_flow_report(
  state: State<'_, AppState>,
  input: ReportFilterInput,
) -> Result<CashFlowReport, AppError> {
  let (from, to) = date_bounds(&input);
  let conn = state.db.lock();
  let (money_in, money_out, net) = cash_flows_by_currency(&conn, &from, &to)?;

  let mut stmt = conn.prepare(
    r#"SELECT t.type, c.code, c.symbol, COUNT(DISTINCT t.id),
              COALESCE(SUM(CASE WHEN le.direction='DEBIT' THEN CAST(le.amount AS REAL) ELSE 0 END), 0),
              COALESCE(SUM(CASE WHEN le.direction='CREDIT' THEN CAST(le.amount AS REAL) ELSE 0 END), 0)
       FROM Wallet w
       INNER JOIN LedgerEntry le ON le.walletId = w.id
       INNER JOIN "Transaction" t ON t.id = le.transactionId AND t.deletedAt IS NULL
       INNER JOIN Currency c ON c.id = le.currencyId AND c.deletedAt IS NULL
       WHERE w.type IN ('VAULT','TILL') AND w.deletedAt IS NULL AND w.isActive = 1
         AND t.valueDate >= ?1 AND t.valueDate < date(?2, '+1 day')
       GROUP BY t.type, c.code, c.symbol
       ORDER BY t.type, c.code"#,
  )?;
  let by_type = stmt
    .query_map(params![from, to], |row| {
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
  })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExchangeReportRow {
  pub id: String,
  pub transaction_id: String,
  pub reference: String,
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
      where_sql.push_str(" AND t.reference LIKE ?");
      params_s.push(format!("%{reference}%"));
    }
  }
  if let Some(ref q) = input.search {
    let q = q.trim();
    if !q.is_empty() {
      let like = format!("%{q}%");
      where_sql.push_str(
        " AND (t.reference LIKE ? OR IFNULL(c.fullName,'') LIKE ?)",
      );
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

  let list_sql = format!(
    r#"SELECT d.id, d.transactionId, t.reference, d.side, CAST(d.fromAmount AS TEXT), cf.code,
              CAST(d.toAmount AS TEXT), ct.code, CAST(d.dealRate AS TEXT),
              CAST(d.boardRate AS TEXT), CAST(d.profitAmount AS TEXT), cp.code,
              d.valueDate, t.customerId, c.fullName
       {join_sql}
       {where_sql}
       ORDER BY d.valueDate DESC, d.createdAt DESC
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
        side: row.get(3)?,
        from_amount: row.get(4)?,
        from_currency: row.get(5)?,
        to_amount: row.get(6)?,
        to_currency: row.get(7)?,
        deal_rate: row.get(8)?,
        board_rate: row.get(9)?,
        profit_amount: row.get(10)?,
        profit_currency: row.get(11)?,
        value_date: row.get(12)?,
        customer_id: row.get(13)?,
        customer_name: row.get(14)?,
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
  pub r#type: String,
  pub status: String,
  pub description: Option<String>,
  pub value_date: String,
  pub debit: String,
  pub credit: String,
  pub currency_code: String,
  pub balance_after: String,
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

  let mut line_sql = String::from(
    r#"SELECT t.id, t.reference, t.type, t.status, t.description, t.valueDate, c.code, c.symbol,
              COALESCE(SUM(CASE WHEN le.direction='DEBIT' THEN CAST(le.amount AS REAL) ELSE 0 END), 0),
              COALESCE(SUM(CASE WHEN le.direction='CREDIT' THEN CAST(le.amount AS REAL) ELSE 0 END), 0)
       FROM Wallet w
       INNER JOIN LedgerEntry le ON le.walletId = w.id
       INNER JOIN "Transaction" t ON t.id = le.transactionId AND t.deletedAt IS NULL
       INNER JOIN Currency c ON c.id = le.currencyId AND c.deletedAt IS NULL
       WHERE w.customerId = ?1 AND w.type='CUSTOMER' AND w.deletedAt IS NULL
         AND t.valueDate >= ?2 AND t.valueDate < date(?3, '+1 day')"#,
  );
  let mut line_params: Vec<Box<dyn rusqlite::types::ToSql>> = vec![
    Box::new(customer_id.clone()),
    Box::new(from.clone()),
    Box::new(to.clone()),
  ];
  if let Some(ref code) = currency_filter {
    line_sql.push_str(" AND c.code = ?");
    line_params.push(Box::new(code.clone()));
  }
  line_sql.push_str(
    " GROUP BY t.id, t.reference, t.type, t.status, t.description, t.valueDate, c.code, c.symbol, t.createdAt
      ORDER BY t.valueDate ASC, t.createdAt ASC, c.code ASC
      LIMIT 2000",
  );
  let line_refs: Vec<&dyn rusqlite::types::ToSql> =
    line_params.iter().map(|p| p.as_ref()).collect();
  let mut line_stmt = conn.prepare(&line_sql)?;
  let mut lines = Vec::new();
  let mut period_in: std::collections::BTreeMap<String, (Option<String>, f64)> =
    std::collections::BTreeMap::new();
  let mut period_out: std::collections::BTreeMap<String, (Option<String>, f64)> =
    std::collections::BTreeMap::new();
  for row in line_stmt.query_map(line_refs.as_slice(), |row| {
    Ok((
      row.get::<_, String>(0)?,
      row.get::<_, String>(1)?,
      row.get::<_, String>(2)?,
      row.get::<_, String>(3)?,
      row.get::<_, Option<String>>(4)?,
      row.get::<_, String>(5)?,
      row.get::<_, String>(6)?,
      row.get::<_, Option<String>>(7)?,
      row.get::<_, f64>(8)?,
      row.get::<_, f64>(9)?,
    ))
  })? {
    let (id, reference, ty, status, description, value_date, code, symbol, debit, credit) =
      row?;
    let entry = running.entry(code.clone()).or_insert((symbol.clone(), 0.0));
    if entry.0.is_none() {
      entry.0 = symbol.clone();
    }
    entry.1 += debit - credit;
    if debit.abs() >= 1e-12 {
      let inn = period_in.entry(code.clone()).or_insert((symbol.clone(), 0.0));
      if inn.0.is_none() {
        inn.0 = symbol.clone();
      }
      inn.1 += debit;
    }
    if credit.abs() >= 1e-12 {
      let out = period_out.entry(code.clone()).or_insert((symbol.clone(), 0.0));
      if out.0.is_none() {
        out.0 = symbol;
      }
      out.1 += credit;
    }
    lines.push(CustomerStatementLine {
      id,
      reference,
      r#type: ty,
      status,
      description,
      value_date,
      debit: format_f64(debit),
      credit: format_f64(credit),
      currency_code: code,
      balance_after: format_f64(entry.1),
    });
  }

  let mut balances = Vec::new();
  let mut codes: std::collections::BTreeSet<String> = std::collections::BTreeSet::new();
  codes.extend(opening_snapshot.keys().cloned());
  codes.extend(running.keys().cloned());
  codes.extend(period_in.keys().cloned());
  codes.extend(period_out.keys().cloned());
  for code in codes {
    let (sym_open, open_bal) = opening_snapshot
      .get(&code)
      .cloned()
      .unwrap_or((None, 0.0));
    let (sym_run, close_bal) = running.get(&code).cloned().unwrap_or((sym_open.clone(), 0.0));
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
      currency_symbol: sym_run.or(sym_in).or(sym_out).or(sym_open),
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
  })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionsReportRow {
  pub id: String,
  pub reference: String,
  pub r#type: String,
  pub status: String,
  pub customer_id: Option<String>,
  pub customer_name: Option<String>,
  pub description: Option<String>,
  pub value_date: String,
  pub amount_summary: String,
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
      where_sql.push_str(" AND t.reference LIKE ?");
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
        " AND (t.reference LIKE ? OR IFNULL(t.description,'') LIKE ? OR IFNULL(c.fullName,'') LIKE ?)",
      );
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

  let list_sql = format!(
    r#"SELECT t.id, t.reference, t.type, t.status, t.customerId, c.fullName, t.description, t.valueDate
       FROM "Transaction" t
       LEFT JOIN Customer c ON c.id = t.customerId
       {where_sql}
       ORDER BY t.valueDate DESC, t.createdAt DESC
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
        r#type: row.get(2)?,
        status: row.get(3)?,
        customer_id: row.get(4)?,
        customer_name: row.get(5)?,
        description: row.get(6)?,
        value_date: row.get(7)?,
        amount_summary: String::new(),
      })
    })?
    .collect::<Result<Vec<_>, _>>()?;

  if !items.is_empty() {
    let placeholders = items
      .iter()
      .enumerate()
      .map(|(i, _)| format!("?{}", i + 1))
      .collect::<Vec<_>>()
      .join(",");
    let money_sql = format!(
      r#"SELECT le.transactionId, c.code, le.direction, CAST(le.amount AS REAL)
         FROM LedgerEntry le
         INNER JOIN Currency c ON c.id = le.currencyId
         WHERE le.transactionId IN ({placeholders})
         ORDER BY le.transactionId, c.code"#
    );
    let money_params: Vec<&dyn rusqlite::types::ToSql> = items
      .iter()
      .map(|i| &i.id as &dyn rusqlite::types::ToSql)
      .collect();
    let mut money_stmt = conn.prepare(&money_sql)?;
    let mut by_tx: std::collections::HashMap<String, Vec<String>> =
      std::collections::HashMap::new();
    for row in money_stmt.query_map(money_params.as_slice(), |row| {
      Ok((
        row.get::<_, String>(0)?,
        row.get::<_, String>(1)?,
        row.get::<_, String>(2)?,
        row.get::<_, f64>(3)?,
      ))
    })? {
      let (tx_id, code, direction, amount) = row?;
      let signed = if direction.eq_ignore_ascii_case("DEBIT") {
        format!("+ {code} {}", format_f64(amount))
      } else {
        format!("− {code} {}", format_f64(amount))
      };
      by_tx.entry(tx_id).or_default().push(signed);
    }
    for item in &mut items {
      item.amount_summary = by_tx
        .remove(&item.id)
        .map(|parts| parts.join(" · "))
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "—".into());
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
       WHERE w.type IN ('VAULT','TILL') AND w.deletedAt IS NULL AND w.isActive = 1
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
       WHERE w.type IN ('VAULT','TILL') AND w.deletedAt IS NULL AND w.isActive = 1
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
) -> Result<Vec<TransactionsReportRow>, AppError> {
  let mut stmt = conn.prepare(
    r#"SELECT t.id, t.reference, t.type, t.status, t.customerId, c.fullName, t.description, t.valueDate
       FROM "Transaction" t
       LEFT JOIN Customer c ON c.id = t.customerId
       WHERE t.deletedAt IS NULL
         AND t.valueDate >= ?1 AND t.valueDate < date(?2, '+1 day')
       ORDER BY t.valueDate ASC, t.createdAt ASC
       LIMIT ?3"#,
  )?;
  let mut items = stmt
    .query_map(params![from, to, limit], |row| {
      Ok(TransactionsReportRow {
        id: row.get(0)?,
        reference: row.get(1)?,
        r#type: row.get(2)?,
        status: row.get(3)?,
        customer_id: row.get(4)?,
        customer_name: row.get(5)?,
        description: row.get(6)?,
        value_date: row.get(7)?,
        amount_summary: String::new(),
      })
    })?
    .collect::<Result<Vec<_>, _>>()?;

  if items.is_empty() {
    return Ok(items);
  }

  let placeholders = items
    .iter()
    .enumerate()
    .map(|(i, _)| format!("?{}", i + 1))
    .collect::<Vec<_>>()
    .join(",");
  let money_sql = format!(
    r#"SELECT le.transactionId, c.code, le.direction, CAST(le.amount AS REAL)
       FROM LedgerEntry le
       INNER JOIN Currency c ON c.id = le.currencyId
       WHERE le.transactionId IN ({placeholders})
       ORDER BY le.transactionId, c.code"#
  );
  let money_params: Vec<&dyn rusqlite::types::ToSql> = items
    .iter()
    .map(|i| &i.id as &dyn rusqlite::types::ToSql)
    .collect();
  let mut money_stmt = conn.prepare(&money_sql)?;
  let mut by_tx: std::collections::HashMap<String, Vec<String>> =
    std::collections::HashMap::new();
  for row in money_stmt.query_map(money_params.as_slice(), |row| {
    Ok((
      row.get::<_, String>(0)?,
      row.get::<_, String>(1)?,
      row.get::<_, String>(2)?,
      row.get::<_, f64>(3)?,
    ))
  })? {
    let (tx_id, code, direction, amount) = row?;
    let signed = if direction.eq_ignore_ascii_case("DEBIT") {
      format!("+ {code} {}", format_f64(amount))
    } else {
      format!("− {code} {}", format_f64(amount))
    };
    by_tx.entry(tx_id).or_default().push(signed);
  }
  for item in &mut items {
    item.amount_summary = by_tx
      .remove(&item.id)
      .map(|parts| parts.join(" · "))
      .filter(|s| !s.is_empty())
      .unwrap_or_else(|| "—".into());
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
) -> Result<DailyReport, AppError> {
  let day = parse_iso_day(&business_date)?;
  let conn = state.db.lock();

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
  let transactions = list_transactions_for_range(&conn, &day, &day, 2000)?;

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
) -> Result<MonthlyReport, AppError> {
  let (year, month, ym) = parse_year_month(&year_month)?;
  let date_from = format!("{ym}-01");
  let last_day = chrono::NaiveDate::from_ymd_opt(year, month, 1)
    .and_then(|d| {
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
         WHERE w.type IN ('VAULT','TILL') AND w.deletedAt IS NULL AND w.isActive = 1
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

  Ok(MonthlyReport {
    year_month: ym,
    date_from,
    date_to,
    positions,
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
  let created_by = input.created_by_id.trim().to_string();
  if created_by.is_empty() {
    return Err(AppError::Validation("createdById is required.".into()));
  }

  let conn = state.db.lock();
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
