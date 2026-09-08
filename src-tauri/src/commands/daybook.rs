//! Daybook (Daily Journal) — live aggregates from ledger + business day open/close.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::AppError;
use crate::state::AppState;
use crate::util::{format_amount_commas, format_f64, now_sqlite, today_local};
use crate::commands::authorize::{require_screen};

fn parse_f64(s: &str) -> f64 {
  s.replace(',', "").parse().unwrap_or(0.0)
}

fn write_audit(
  conn: &Connection,
  user_id: Option<&str>,
  action: &str,
  entity_id: &str,
  before: Option<&str>,
  after: Option<&str>,
) -> Result<(), AppError> {
  let exists: bool = conn.query_row(
    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='AuditLog')",
    [],
    |row| row.get(0),
  )?;
  if !exists {
    return Ok(());
  }
  conn.execute(
    r#"INSERT INTO AuditLog (id, userId, action, module, entityType, entityId, beforeValues, afterValues, createdAt)
       VALUES (?1, ?2, ?3, 'DAYBOOK', 'BusinessDay', ?4, ?5, ?6, ?7)"#,
    params![
      uuid::Uuid::new_v4().to_string(),
      user_id,
      action,
      entity_id,
      before,
      after,
      now_sqlite(),
    ],
  )?;
  Ok(())
}

fn cash_balances_as_of(conn: &Connection, before_date: &str) -> Result<Vec<(String, String, Option<String>, f64)>, AppError> {
  // Prefer: current cache − net flow since `before_date` (fast for recent days / today).
  let current = current_cash_balances(conn)?;
  let mut since = std::collections::HashMap::<String, f64>::new();
  {
    let mut stmt = conn.prepare(
      r#"SELECT c.id,
                COALESCE(SUM(CASE WHEN le.direction='DEBIT' THEN CAST(le.amount AS REAL)
                                  ELSE -CAST(le.amount AS REAL) END), 0)
         FROM Wallet w
         INNER JOIN LedgerEntry le ON le.walletId = w.id
         INNER JOIN "Transaction" t ON t.id = le.transactionId AND t.deletedAt IS NULL
         INNER JOIN Currency c ON c.id = le.currencyId AND c.deletedAt IS NULL
         WHERE w.deletedAt IS NULL AND w.isActive = 1
           AND ((w.type = 'VAULT' AND w.name = 'Main Vault') OR w.type = 'TILL')
           AND t.valueDate >= ?1
         GROUP BY c.id"#,
    )?;
    for row in stmt.query_map([before_date], |row| {
      Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
    })? {
      let (cid, net) = row?;
      since.insert(cid, net);
    }
  }
  Ok(
    current
      .into_iter()
      .map(|(id, code, sym, bal)| {
        let net_since = since.get(&id).copied().unwrap_or(0.0);
        (id, code, sym, bal - net_since)
      })
      .filter(|(_, _, _, bal)| bal.abs() > 1e-12)
      .collect(),
  )
}

fn cash_flow_on_day(
  conn: &Connection,
  day: &str,
) -> Result<std::collections::HashMap<String, (f64, f64)>, AppError> {
  // currency_id -> (received DEBIT, paid CREDIT)
  let mut map = std::collections::HashMap::new();
  let mut stmt = conn.prepare(
    r#"SELECT c.id,
              COALESCE(SUM(CASE WHEN le.direction='DEBIT' THEN CAST(le.amount AS REAL) ELSE 0 END), 0),
              COALESCE(SUM(CASE WHEN le.direction='CREDIT' THEN CAST(le.amount AS REAL) ELSE 0 END), 0)
       FROM Wallet w
       INNER JOIN LedgerEntry le ON le.walletId = w.id
       INNER JOIN "Transaction" t ON t.id = le.transactionId AND t.deletedAt IS NULL
       INNER JOIN Currency c ON c.id = le.currencyId
       WHERE w.deletedAt IS NULL AND w.isActive = 1
         AND ((w.type = 'VAULT' AND w.name = 'Main Vault') OR w.type = 'TILL')
         AND t.valueDate >= ?1 AND t.valueDate < date(?1, '+1 day')
       GROUP BY c.id"#,
  )?;
  for row in stmt.query_map([day], |row| {
    Ok((
      row.get::<_, String>(0)?,
      row.get::<_, f64>(1)?,
      row.get::<_, f64>(2)?,
    ))
  })? {
    let (cid, recv, paid) = row?;
    map.insert(cid, (recv, paid));
  }
  Ok(map)
}

fn current_cash_balances(
  conn: &Connection,
) -> Result<Vec<(String, String, Option<String>, f64)>, AppError> {
  let mut stmt = conn.prepare(
    r#"SELECT c.id, c.code, c.symbol, COALESCE(SUM(b.balance), 0)
       FROM WalletCurrencyBalance b
       INNER JOIN Wallet w ON w.id = b.walletId
         AND w.deletedAt IS NULL AND w.isActive = 1
         AND ((w.type = 'VAULT' AND w.name = 'Main Vault') OR w.type = 'TILL')
       INNER JOIN Currency c ON c.id = b.currencyId AND c.deletedAt IS NULL
       WHERE ABS(b.balance) > 1e-12
       GROUP BY c.id, c.code, c.symbol
       ORDER BY c.code"#,
  )?;
  let rows = stmt
    .query_map([], |row| {
      Ok((
        row.get::<_, String>(0)?,
        row.get::<_, String>(1)?,
        row.get::<_, Option<String>>(2)?,
        row.get::<_, f64>(3)?,
      ))
    })?
    .collect::<Result<Vec<_>, _>>()?;
  Ok(rows)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DaybookDayMeta {
  pub id: Option<String>,
  pub business_date: String,
  pub status: String,
  pub opened_at: Option<String>,
  pub opened_by_name: Option<String>,
  pub closed_at: Option<String>,
  pub closed_by_name: Option<String>,
  pub difference_reason: Option<String>,
  pub has_cash_difference: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DaybookDailySummary {
  pub total_transactions: i64,
  pub cash_in: String,
  pub cash_out: String,
  pub exchange_transactions: i64,
  pub hawala_transactions: i64,
  pub trading_transactions: i64,
  pub customer_deposits: i64,
  pub customer_withdrawals: i64,
  pub todays_profit: String,
  pub todays_expenses: String,
  pub net_profit: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DaybookCashPositionRow {
  pub currency_id: String,
  pub currency_code: String,
  pub currency_symbol: Option<String>,
  pub opening: String,
  pub received: String,
  pub paid: String,
  pub expected_closing: String,
  pub actual_closing: Option<String>,
  pub difference: Option<String>,
  pub flag: String, // OK | SHORTAGE | OVERAGE
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DaybookCurrencySummaryRow {
  pub currency_code: String,
  pub opening_balance: String,
  pub purchased: String,
  pub sold: String,
  pub deposited: String,
  pub withdrawn: String,
  pub transferred: String,
  pub closing_balance: String,
  pub inventory_value: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DaybookTimelineItem {
  pub id: String,
  pub time: String,
  pub reference: String,
  pub display_ref: String,
  pub module: String,
  pub transaction_type: String,
  pub customer_name: Option<String>,
  pub partner_name: Option<String>,
  pub currency_code: Option<String>,
  pub amount: Option<String>,
  pub user_name: Option<String>,
  pub status: String,
  pub detail_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DaybookProfitSummary {
  pub exchange_profit: String,
  pub trading_profit: String,
  pub commission_income: String,
  pub other_income: String,
  pub expenses: String,
  pub net_daily_profit: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DaybookHawalaSummary {
  pub new_hawalas: i64,
  pub completed: i64,
  pub pending: i64,
  pub cancelled: i64,
  pub returned: i64,
  pub commission_earned: String,
  pub pending_settlement: String,
  pub outstanding_partner_balance: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DaybookCustomerActivity {
  pub new_customers: i64,
  pub returning_customers: i64,
  pub top_customer: Option<String>,
  pub largest_transaction: Option<String>,
  pub highest_deposit: Option<String>,
  pub highest_withdrawal: Option<String>,
  pub most_active_customer: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DaybookPartnerActivity {
  pub partner_transactions: i64,
  pub partner_commission: String,
  pub outstanding_settlements: String,
  pub top_partner: Option<String>,
  pub largest_transfer: Option<String>,
  pub pending_settlements: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DaybookTradingSummary {
  pub purchases: i64,
  pub sales: i64,
  pub trading_profit: String,
  pub open_positions: i64,
  pub closed_positions: i64,
  pub best_currency: Option<String>,
  pub worst_currency: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DaybookExpenseSummary {
  pub rent: String,
  pub salary: String,
  pub utilities: String,
  pub transport: String,
  pub office: String,
  pub other: String,
  pub total: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DaybookAlert {
  pub severity: String, // info | warn | critical
  pub code: String,
  pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DaybookSnapshot {
  pub business_date: String,
  pub current_time: String,
  pub day: DaybookDayMeta,
  pub daily_summary: DaybookDailySummary,
  pub cash_position: Vec<DaybookCashPositionRow>,
  pub currency_summary: Vec<DaybookCurrencySummaryRow>,
  pub timeline: Vec<DaybookTimelineItem>,
  pub timeline_total: i64,
  pub timeline_page: i64,
  pub timeline_page_size: i64,
  pub profit: DaybookProfitSummary,
  pub hawala: DaybookHawalaSummary,
  pub customers: DaybookCustomerActivity,
  pub partners: DaybookPartnerActivity,
  pub trading: DaybookTradingSummary,
  pub expenses: DaybookExpenseSummary,
  pub alerts: Vec<DaybookAlert>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DaybookQueryInput {
  pub business_date: Option<String>,
  #[allow(dead_code)]
  pub currency_code: Option<String>,
  pub customer_id: Option<String>,
  #[allow(dead_code)]
  pub partner_id: Option<String>,
  pub user_id: Option<String>,
  pub module: Option<String>,
  pub tx_type: Option<String>,
  pub status: Option<String>,
  #[allow(dead_code)]
  pub amount_min: Option<String>,
  #[allow(dead_code)]
  pub amount_max: Option<String>,
  pub search: Option<String>,
  pub timeline_page: Option<i64>,
  pub timeline_page_size: Option<i64>,
}

fn load_day_meta(conn: &Connection, day: &str) -> Result<DaybookDayMeta, AppError> {
  let row: Option<(
    String,
    String,
    String,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    i64,
  )> = conn
    .query_row(
      r#"SELECT d.id, d.businessDate, d.status, d.openedAt, ou.fullName,
                d.closedAt, cu.fullName, d.differenceReason, d.hasCashDifference
         FROM BusinessDay d
         LEFT JOIN User ou ON ou.id = d.openedById
         LEFT JOIN User cu ON cu.id = d.closedById
         WHERE d.businessDate = ?1"#,
      [day],
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
    .optional()?;

  if let Some((id, date, status, opened_at, opened_by, closed_at, closed_by, reason, has_diff)) =
    row
  {
    return Ok(DaybookDayMeta {
      id: Some(id),
      business_date: date,
      status,
      opened_at,
      opened_by_name: opened_by,
      closed_at,
      closed_by_name: closed_by,
      difference_reason: reason,
      has_cash_difference: has_diff != 0,
    });
  }

  Ok(DaybookDayMeta {
    id: None,
    business_date: day.to_string(),
    status: "NOT_OPENED".into(),
    opened_at: None,
    opened_by_name: None,
    closed_at: None,
    closed_by_name: None,
    difference_reason: None,
    has_cash_difference: false,
  })
}

fn module_for_type(tx_type: &str, reference: &str) -> &'static str {
  if tx_type == "TRANSFER"
    && (reference.starts_with("VT-")
      || reference.starts_with("CASH-XFER-")
      || reference.to_ascii_uppercase().contains("VAULT"))
  {
    return "Vault";
  }
  match tx_type {
    "DEPOSIT" | "WITHDRAWAL" | "TRANSFER" => "Cash / Movements",
    "EXCHANGE" => "Exchange",
    "HAWALA" => "Hawala",
    "TRADE_BUY" | "TRADE_SELL" => "Trading",
    "VAULT_CASH_IN" | "VAULT_CASH_OUT" => "Vault",
    "ADJUSTMENT" => {
      let r = reference.to_ascii_uppercase();
      if r.starts_with("CASH-IN") || r.starts_with("CASH-OUT") {
        "Vault"
      } else {
        "Accounting"
      }
    }
    _ => "Other",
  }
}

pub fn compute_daybook_snapshot(
  conn: &Connection,
  input: &DaybookQueryInput,
) -> Result<DaybookSnapshot, AppError> {
  let day = input
    .business_date
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .unwrap_or(&today_local())
    .to_string();

  let day_meta = if table_exists_business_day(conn)? {
    load_day_meta(conn, &day)?
  } else {
    DaybookDayMeta {
      id: None,
      business_date: day.clone(),
      status: "NOT_OPENED".into(),
      opened_at: None,
      opened_by_name: None,
      closed_at: None,
      closed_by_name: None,
      difference_reason: None,
      has_cash_difference: false,
    }
  };

  // --- Counts by type ---
  let mut deposits = 0i64;
  let mut withdrawals = 0i64;
  let mut exchanges = 0i64;
  let mut hawalas_tx = 0i64;
  let mut trades = 0i64;
  let mut total_tx = 0i64;
  {
    let mut stmt = conn.prepare(
      r#"SELECT type, COUNT(*) FROM "Transaction"
         WHERE deletedAt IS NULL AND valueDate >= ?1 AND valueDate < date(?1, '+1 day')
         GROUP BY type"#,
    )?;
    for row in stmt.query_map([&day], |row| {
      Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
    })? {
      let (ty, n) = row?;
      total_tx += n;
      match ty.as_str() {
        "DEPOSIT" => deposits = n,
        "WITHDRAWAL" => withdrawals = n,
        "EXCHANGE" => exchanges = n,
        "HAWALA" => hawalas_tx = n,
        "TRADE_BUY" | "TRADE_SELL" => trades += n,
        _ => {}
      }
    }
  }

  // Cash in/out totals (all currencies summed as display string of primary flows)
  let flow = cash_flow_on_day(conn, &day)?;
  let mut cash_in = 0.0;
  let mut cash_out = 0.0;
  for (r, p) in flow.values() {
    cash_in += r;
    cash_out += p;
  }

  // Profit pieces
  let trading_profit: f64 = {
    let exists: bool = conn.query_row(
      "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='TradingTrade')",
      [],
      |row| row.get(0),
    )?;
    if exists {
      conn.query_row(
        r#"SELECT COALESCE(SUM(CAST(grossProfit AS REAL)),0) FROM TradingTrade
           WHERE deletedAt IS NULL AND direction='SELL' AND valueDate >= ?1 AND valueDate < date(?1, '+1 day')"#,
        [&day],
        |row| row.get(0),
      )?
    } else {
      0.0
    }
  };
  let commission: f64 = conn.query_row(
    r#"SELECT COALESCE(SUM(CAST(ownCommissionAmount AS REAL)),0) FROM HawalaTransfer
       WHERE deletedAt IS NULL AND valueDate >= ?1 AND valueDate < date(?1, '+1 day')"#,
    [&day],
    |row| row.get(0),
  )?;
  let exchange_profit: f64 = {
    let exists: bool = conn.query_row(
      "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='ExchangeDeal')",
      [],
      |row| row.get(0),
    )?;
    if exists {
      conn.query_row(
        r#"SELECT COALESCE(SUM(CAST(profitAmount AS REAL)),0) FROM ExchangeDeal
           WHERE deletedAt IS NULL AND valueDate >= ?1 AND valueDate < date(?1, '+1 day')"#,
        [&day],
        |row| row.get(0),
      )?
    } else {
      0.0
    }
  };
  let expenses_total = expense_totals(conn, &day)?.6;
  let net_profit = trading_profit + commission + exchange_profit - expenses_total;

  let daily_summary = DaybookDailySummary {
    total_transactions: total_tx,
    cash_in: format_f64(cash_in),
    cash_out: format_f64(cash_out),
    exchange_transactions: exchanges,
    hawala_transactions: hawalas_tx,
    trading_transactions: trades,
    customer_deposits: deposits,
    customer_withdrawals: withdrawals,
    todays_profit: format_f64(trading_profit + commission),
    todays_expenses: format_f64(expenses_total),
    net_profit: format_f64(net_profit),
  };

  // Cash position
  let opening_map: std::collections::HashMap<String, f64> = {
    let mut m = std::collections::HashMap::new();
    if let Some(ref day_id) = day_meta.id {
      if table_exists_cash_count(conn)? {
        let mut stmt = conn.prepare(
          r#"SELECT currencyId, CAST(openingAmount AS REAL) FROM BusinessDayCashCount
             WHERE businessDayId = ?1"#,
        )?;
        for row in stmt.query_map([day_id], |row| {
          Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
        })? {
          let (cid, v) = row?;
          m.insert(cid, v);
        }
      }
    }
    if m.is_empty() {
      for (cid, _, _, v) in cash_balances_as_of(conn, &day)? {
        m.insert(cid, v);
      }
    }
    m
  };

  let actual_map: std::collections::HashMap<String, (Option<f64>, Option<f64>)> = {
    let mut m = std::collections::HashMap::new();
    if let Some(ref day_id) = day_meta.id {
      if table_exists_cash_count(conn)? {
        let mut stmt = conn.prepare(
          r#"SELECT currencyId,
                    CASE WHEN actualClosing IS NULL THEN NULL ELSE CAST(actualClosing AS REAL) END,
                    CASE WHEN difference IS NULL THEN NULL ELSE CAST(difference AS REAL) END
             FROM BusinessDayCashCount WHERE businessDayId = ?1"#,
        )?;
        for row in stmt.query_map([day_id], |row| {
          Ok((
            row.get::<_, String>(0)?,
            row.get::<_, Option<f64>>(1)?,
            row.get::<_, Option<f64>>(2)?,
          ))
        })? {
          let (cid, act, diff) = row?;
          m.insert(cid, (act, diff));
        }
      }
    }
    m
  };

  let current = current_cash_balances(conn)?;
  let mut cash_position = Vec::new();
  let mut seen = std::collections::HashSet::new();
  for (cid, code, symbol, current_bal) in &current {
    seen.insert(cid.clone());
    let opening = opening_map.get(cid).copied().unwrap_or(0.0);
    let (recv, paid) = flow.get(cid).copied().unwrap_or((0.0, 0.0));
    let expected = if day == today_local() {
      *current_bal
    } else {
      opening + recv - paid
    };
    let (actual, stored_diff) = actual_map.get(cid).cloned().unwrap_or((None, None));
    let difference = stored_diff.or_else(|| actual.map(|a| a - expected));
    let flag = match difference {
      Some(d) if d < -0.0001 => "SHORTAGE".into(),
      Some(d) if d > 0.0001 => "OVERAGE".into(),
      _ => "OK".into(),
    };
    cash_position.push(DaybookCashPositionRow {
      currency_id: cid.clone(),
      currency_code: code.clone(),
      currency_symbol: symbol.clone(),
      opening: format_f64(opening),
      received: format_f64(recv),
      paid: format_f64(paid),
      expected_closing: format_f64(expected),
      actual_closing: actual.map(format_f64),
      difference: difference.map(format_f64),
      flag,
    });
  }
  // Include currencies that had opening but zero current
  for (cid, opening) in &opening_map {
    if seen.contains(cid) {
      continue;
    }
    let (code, symbol): (String, Option<String>) = conn.query_row(
      "SELECT code, symbol FROM Currency WHERE id=?1",
      [cid],
      |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    let (recv, paid) = flow.get(cid).copied().unwrap_or((0.0, 0.0));
    let expected = opening + recv - paid;
    cash_position.push(DaybookCashPositionRow {
      currency_id: cid.clone(),
      currency_code: code,
      currency_symbol: symbol,
      opening: format_f64(*opening),
      received: format_f64(recv),
      paid: format_f64(paid),
      expected_closing: format_f64(expected),
      actual_closing: None,
      difference: None,
      flag: "OK".into(),
    });
  }
  cash_position.sort_by(|a, b| a.currency_code.cmp(&b.currency_code));

  // Currency summary
  let currency_summary = build_currency_summary(conn, &day, &opening_map, &current)?;

  // Timeline
  let timeline_page_size = input.timeline_page_size.unwrap_or(25).clamp(1, 100);
  let mut timeline_page = input.timeline_page.unwrap_or(1).max(1);
  let (timeline, timeline_total) =
    build_timeline(conn, &day, input, timeline_page_size, &mut timeline_page)?;

  let profit = DaybookProfitSummary {
    exchange_profit: format_f64(exchange_profit),
    trading_profit: format_f64(trading_profit),
    commission_income: format_f64(commission),
    other_income: "0".into(),
    expenses: format_f64(expenses_total),
    net_daily_profit: format_f64(net_profit),
  };

  let hawala = build_hawala_summary(conn, &day)?;
  let customers = build_customer_activity(conn, &day)?;
  let partners = build_partner_activity(conn, &day)?;
  let trading = build_trading_summary(conn, &day)?;
  let expenses = {
    let (rent, salary, utilities, transport, office, other, total) = expense_totals(conn, &day)?;
    DaybookExpenseSummary {
      rent: format_f64(rent),
      salary: format_f64(salary),
      utilities: format_f64(utilities),
      transport: format_f64(transport),
      office: format_f64(office),
      other: format_f64(other),
      total: format_f64(total),
    }
  };
  let alerts = build_alerts(
    conn,
    &day,
    &cash_position,
    &hawala,
    &trading,
    net_profit,
  )?;

  Ok(DaybookSnapshot {
    business_date: day,
    current_time: chrono::Local::now().format("%H:%M:%S").to_string(),
    day: day_meta,
    daily_summary,
    cash_position,
    currency_summary,
    timeline,
    timeline_total,
    timeline_page,
    timeline_page_size,
    profit,
    hawala,
    customers,
    partners,
    trading,
    expenses,
    alerts,
  })
}

fn table_exists_business_day(conn: &Connection) -> Result<bool, AppError> {
  Ok(conn.query_row(
    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='BusinessDay')",
    [],
    |row| row.get(0),
  )?)
}

fn table_exists_cash_count(conn: &Connection) -> Result<bool, AppError> {
  Ok(conn.query_row(
    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='BusinessDayCashCount')",
    [],
    |row| row.get(0),
  )?)
}

fn expense_totals(
  conn: &Connection,
  day: &str,
) -> Result<(f64, f64, f64, f64, f64, f64, f64), AppError> {
  // Sum CREDIT amounts on SYSTEM wallets whose names match expense categories for the day.
  let mut rent = 0.0;
  let mut salary = 0.0;
  let mut utilities = 0.0;
  let mut transport = 0.0;
  let mut office = 0.0;
  let mut other = 0.0;
  let mut stmt = conn.prepare(
    r#"SELECT LOWER(w.name),
              COALESCE(SUM(CASE WHEN le.direction='DEBIT' THEN CAST(le.amount AS REAL)
                                ELSE CAST(le.amount AS REAL) END), 0)
       FROM Wallet w
       INNER JOIN LedgerEntry le ON le.walletId = w.id
       INNER JOIN "Transaction" t ON t.id = le.transactionId AND t.deletedAt IS NULL
       WHERE w.type = 'SYSTEM' AND w.deletedAt IS NULL
         AND t.valueDate >= ?1 AND t.valueDate < date(?1, '+1 day')
         AND (
           LOWER(w.name) LIKE '%expense%'
           OR LOWER(w.name) LIKE '%rent%'
           OR LOWER(w.name) LIKE '%salary%'
           OR LOWER(w.name) LIKE '%utility%'
           OR LOWER(w.name) LIKE '%transport%'
           OR LOWER(w.name) LIKE '%office%'
         )
       GROUP BY LOWER(w.name)"#,
  )?;
  for row in stmt.query_map([day], |row| {
    Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
  })? {
    let (name, amt) = row?;
    let amt = amt.abs();
    if name.contains("rent") {
      rent += amt;
    } else if name.contains("salary") || name.contains("wage") {
      salary += amt;
    } else if name.contains("utility") || name.contains("utilities") {
      utilities += amt;
    } else if name.contains("transport") {
      transport += amt;
    } else if name.contains("office") {
      office += amt;
    } else {
      other += amt;
    }
  }
  let total = rent + salary + utilities + transport + office + other;
  Ok((rent, salary, utilities, transport, office, other, total))
}

fn build_currency_summary(
  conn: &Connection,
  day: &str,
  opening_map: &std::collections::HashMap<String, f64>,
  current: &[(String, String, Option<String>, f64)],
) -> Result<Vec<DaybookCurrencySummaryRow>, AppError> {
  let mut purchased: std::collections::HashMap<String, f64> = std::collections::HashMap::new();
  let mut sold: std::collections::HashMap<String, f64> = std::collections::HashMap::new();
  let trading_exists: bool = conn.query_row(
    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='TradingTrade')",
    [],
    |row| row.get(0),
  )?;
  if trading_exists {
    let mut stmt = conn.prepare(
      r#"SELECT c.code, t.direction, COALESCE(SUM(CAST(t.quantity AS REAL)),0)
         FROM TradingTrade t
         INNER JOIN Currency c ON c.id = t.inventoryCurrencyId
         WHERE t.deletedAt IS NULL AND t.valueDate >= ?1 AND t.valueDate < date(?1, '+1 day')
         GROUP BY c.code, t.direction"#,
    )?;
    for row in stmt.query_map([day], |row| {
      Ok((
        row.get::<_, String>(0)?,
        row.get::<_, String>(1)?,
        row.get::<_, f64>(2)?,
      ))
    })? {
      let (code, dir, qty) = row?;
      if dir == "BUY" {
        *purchased.entry(code).or_insert(0.0) += qty;
      } else {
        *sold.entry(code).or_insert(0.0) += qty;
      }
    }
  }

  let mut deposited: std::collections::HashMap<String, f64> = std::collections::HashMap::new();
  let mut withdrawn: std::collections::HashMap<String, f64> = std::collections::HashMap::new();
  let mut transferred: std::collections::HashMap<String, f64> = std::collections::HashMap::new();
  // Deposits / Add Money: cash leg amount on DEPOSIT (direction changed over time)
  {
    let mut stmt = conn.prepare(
      r#"SELECT c.code, COALESCE(SUM(CAST(le.amount AS REAL)),0)
         FROM "Transaction" t
         INNER JOIN LedgerEntry le ON le.transactionId = t.id
         INNER JOIN Wallet w ON w.id = le.walletId AND w.type IN ('VAULT','TILL')
         INNER JOIN Currency c ON c.id = le.currencyId
         WHERE t.deletedAt IS NULL AND t.type='DEPOSIT' AND t.valueDate >= ?1 AND t.valueDate < date(?1, '+1 day')
         GROUP BY c.code"#,
    )?;
    for row in stmt.query_map([day], |row| Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?)))? {
      let (code, v) = row?;
      deposited.insert(code, v);
    }
  }
  // Withdrawals / Take Money: cash leg amount on WITHDRAWAL
  {
    let mut stmt = conn.prepare(
      r#"SELECT c.code, COALESCE(SUM(CAST(le.amount AS REAL)),0)
         FROM "Transaction" t
         INNER JOIN LedgerEntry le ON le.transactionId = t.id
         INNER JOIN Wallet w ON w.id = le.walletId AND w.type IN ('VAULT','TILL')
         INNER JOIN Currency c ON c.id = le.currencyId
         WHERE t.deletedAt IS NULL AND t.type='WITHDRAWAL' AND t.valueDate >= ?1 AND t.valueDate < date(?1, '+1 day')
         GROUP BY c.code"#,
    )?;
    for row in stmt.query_map([day], |row| Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?)))? {
      let (code, v) = row?;
      withdrawn.insert(code, v);
    }
  }
  {
    let mut stmt = conn.prepare(
      r#"SELECT c.code, COALESCE(SUM(CAST(le.amount AS REAL)),0)
         FROM "Transaction" t
         INNER JOIN LedgerEntry le ON le.transactionId = t.id AND le.direction='DEBIT'
         INNER JOIN Wallet w ON w.id = le.walletId AND w.type IN ('VAULT','TILL')
         INNER JOIN Currency c ON c.id = le.currencyId
         WHERE t.deletedAt IS NULL AND t.type='TRANSFER' AND t.valueDate >= ?1 AND t.valueDate < date(?1, '+1 day')
         GROUP BY c.code"#,
    )?;
    for row in stmt.query_map([day], |row| Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?)))? {
      let (code, v) = row?;
      transferred.insert(code, v);
    }
  }

  let mut inv: std::collections::HashMap<String, f64> = std::collections::HashMap::new();
  // Inventory quantity in the stock currency (USD, etc.) — never convert via cash-in rate.
  if trading_exists {
    let mut stmt = conn.prepare(
      r#"SELECT c.code, COALESCE(SUM(CAST(i.quantity AS REAL)),0)
         FROM TradingInventory i
         INNER JOIN Currency c ON c.id = i.currencyId
         WHERE ABS(CAST(i.quantity AS REAL)) > 0
         GROUP BY c.code"#,
    )?;
    for row in stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?)))? {
      let (code, v) = row?;
      inv.insert(code, v);
    }
  }

  let mut rows = Vec::new();
  for (cid, code, _, closing) in current {
    let opening = opening_map.get(cid).copied().unwrap_or(0.0);
    rows.push(DaybookCurrencySummaryRow {
      currency_code: code.clone(),
      opening_balance: format_f64(opening),
      purchased: format_f64(purchased.get(code).copied().unwrap_or(0.0)),
      sold: format_f64(sold.get(code).copied().unwrap_or(0.0)),
      deposited: format_f64(deposited.get(code).copied().unwrap_or(0.0)),
      withdrawn: format_f64(withdrawn.get(code).copied().unwrap_or(0.0)),
      transferred: format_f64(transferred.get(code).copied().unwrap_or(0.0)),
      closing_balance: format_f64(*closing),
      inventory_value: format_f64(inv.get(code).copied().unwrap_or(0.0)),
    });
  }
  Ok(rows)
}

fn build_timeline(
  conn: &Connection,
  day: &str,
  input: &DaybookQueryInput,
  page_size: i64,
  page: &mut i64,
) -> Result<(Vec<DaybookTimelineItem>, i64), AppError> {
  let mut where_sql = String::from(
    "WHERE t.deletedAt IS NULL AND t.valueDate >= ?1 AND t.valueDate < date(?1, '+1 day')",
  );
  let mut params_v: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(day.to_string())];

  if let Some(ref ty) = input.tx_type {
    let ty = ty.trim().to_ascii_uppercase();
    if !ty.is_empty() && ty != "ALL" {
      where_sql.push_str(" AND t.type = ?");
      params_v.push(Box::new(ty));
    }
  }
  if let Some(ref st) = input.status {
    let st = st.trim().to_ascii_uppercase();
    if !st.is_empty() && st != "ALL" {
      where_sql.push_str(" AND t.status = ?");
      params_v.push(Box::new(st));
    }
  }
  if let Some(ref uid) = input.user_id {
    let uid = uid.trim();
    if !uid.is_empty() {
      where_sql.push_str(" AND t.createdById = ?");
      params_v.push(Box::new(uid.to_string()));
    }
  }
  if let Some(ref cid) = input.customer_id {
    let cid = cid.trim();
    if !cid.is_empty() {
      where_sql.push_str(" AND t.customerId = ?");
      params_v.push(Box::new(cid.to_string()));
    }
  }
  if let Some(ref q) = input.search {
    let q = q.trim();
    if !q.is_empty() {
      let like = format!("%{q}%");
      where_sql.push_str(
        " AND (t.reference LIKE ? OR IFNULL(t.displayRef,'') LIKE ? OR IFNULL(c.fullName,'') LIKE ? OR IFNULL(t.description,'') LIKE ?)",
      );
      params_v.push(Box::new(like.clone()));
      params_v.push(Box::new(like.clone()));
      params_v.push(Box::new(like.clone()));
      params_v.push(Box::new(like));
    }
  }
  if let Some(ref module) = input.module {
    let m = module.trim().to_ascii_lowercase();
    if !m.is_empty() && m != "all" {
      let types: &[&str] = match m.as_str() {
        "exchange" => &["EXCHANGE"],
        "hawala" => &["HAWALA"],
        "trading" => &["TRADE_BUY", "TRADE_SELL"],
        "movements" | "cash" => &["DEPOSIT", "WITHDRAWAL", "TRANSFER"],
        "vault" | "vaults" => &["TRANSFER"],
        "accounting" => &["ADJUSTMENT"],
        _ => &[],
      };
      if !types.is_empty() {
        let placeholders = types.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        where_sql.push_str(&format!(" AND t.type IN ({placeholders})"));
        for t in types {
          params_v.push(Box::new(t.to_string()));
        }
        if m == "vault" || m == "vaults" {
          where_sql.push_str(
            " AND (t.reference LIKE 'VT-%' OR t.reference LIKE 'CASH-XFER-%')",
          );
        }
      }
    }
  }

  let count_sql = format!(
    r#"SELECT COUNT(*) FROM "Transaction" t
       LEFT JOIN Customer c ON c.id = t.customerId
       {where_sql}"#
  );
  let count_refs: Vec<&dyn rusqlite::types::ToSql> =
    params_v.iter().map(|p| p.as_ref()).collect();
  let total: i64 = conn.query_row(&count_sql, count_refs.as_slice(), |row| row.get(0))?;
  let total_pages = if total == 0 {
    1
  } else {
    (total + page_size - 1) / page_size
  };
  if *page > total_pages {
    *page = total_pages;
  }
  let offset = (*page - 1) * page_size;

  let has_trading: bool = conn.query_row(
    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='TradingTrade')",
    [],
    |row| row.get(0),
  )?;
  let trading_href = if has_trading {
    r#"WHEN t.type IN ('TRADE_BUY','TRADE_SELL') THEN (
                  SELECT '/trading/trades/' || tt.id FROM TradingTrade tt
                  WHERE tt.transactionId = t.id AND tt.deletedAt IS NULL LIMIT 1
                )"#
  } else {
    "WHEN t.type IN ('TRADE_BUY','TRADE_SELL') THEN '/trading'"
  };

  let chrono = crate::ledger::TX_CHRONO_ASC;
  let sql = format!(
    r#"SELECT t.id, t.valueDate, t.reference, IFNULL(t.displayRef,''), t.type, t.status, c.fullName, u.fullName,
              (SELECT cur.code FROM LedgerEntry le
               INNER JOIN Currency cur ON cur.id = le.currencyId
               WHERE le.transactionId = t.id LIMIT 1),
              (SELECT CAST(le.amount AS TEXT) FROM LedgerEntry le
               WHERE le.transactionId = t.id LIMIT 1),
              CASE WHEN t.type = 'HAWALA' THEN (
                SELECT COALESCE(p.name, h.partnerSarafi)
                FROM HawalaTransfer h
                LEFT JOIN PartnerSarafi p ON p.id = h.partnerSarafiId
                WHERE h.transactionId = t.id LIMIT 1
              ) ELSE NULL END,
              CASE
                WHEN t.type = 'HAWALA' THEN (
                  SELECT '/hawala/' || h.id FROM HawalaTransfer h
                  WHERE h.transactionId = t.id LIMIT 1
                )
                {trading_href}
                WHEN t.type = 'TRANSFER' AND (
                  t.reference LIKE 'VT-%' OR t.reference LIKE 'CASH-XFER-%'
                  OR LOWER(t.reference) LIKE '%vault%'
                ) THEN COALESCE((
                  SELECT '/vaults/' || w.id FROM LedgerEntry le
                  INNER JOIN Wallet w ON w.id = le.walletId
                    AND w.type IN ('VAULT','TILL') AND w.deletedAt IS NULL
                  WHERE le.transactionId = t.id
                  ORDER BY CASE w.type WHEN 'VAULT' THEN 0 ELSE 1 END
                  LIMIT 1
                ), '/vaults')
                ELSE '/transactions'
              END
       FROM "Transaction" t
       LEFT JOIN Customer c ON c.id = t.customerId
       LEFT JOIN User u ON u.id = t.createdById
       {where_sql}
       ORDER BY {chrono}
       LIMIT ? OFFSET ?"#
  );
  params_v.push(Box::new(page_size));
  params_v.push(Box::new(offset));
  let refs: Vec<&dyn rusqlite::types::ToSql> = params_v.iter().map(|p| p.as_ref()).collect();
  let mut stmt = conn.prepare(&sql)?;
  let mut items = Vec::new();
  for row in stmt.query_map(refs.as_slice(), |row| {
    Ok((
      row.get::<_, String>(0)?,
      row.get::<_, String>(1)?,
      row.get::<_, String>(2)?,
      row.get::<_, String>(3)?,
      row.get::<_, String>(4)?,
      row.get::<_, String>(5)?,
      row.get::<_, Option<String>>(6)?,
      row.get::<_, Option<String>>(7)?,
      row.get::<_, Option<String>>(8)?,
      row.get::<_, Option<String>>(9)?,
      row.get::<_, Option<String>>(10)?,
      row.get::<_, Option<String>>(11)?,
    ))
  })? {
    let (
      id,
      value_date,
      reference,
      display_ref,
      tx_type,
      status,
      customer,
      user,
      ccy,
      amount,
      partner,
      detail_path,
    ) = row?;
    let time = if value_date.len() >= 19 {
      value_date[11..19].to_string()
    } else if value_date.len() >= 10 {
      value_date[0..10].to_string()
    } else {
      value_date.clone()
    };
    let module = module_for_type(&tx_type, &reference).to_string();
    items.push(DaybookTimelineItem {
      id,
      time,
      reference,
      display_ref,
      module,
      transaction_type: tx_type,
      customer_name: customer,
      partner_name: partner,
      currency_code: ccy,
      amount,
      user_name: user,
      status,
      detail_path,
    });
  }
  Ok((items, total))
}

fn build_hawala_summary(conn: &Connection, day: &str) -> Result<DaybookHawalaSummary, AppError> {
  let count_status = |st: &str| -> Result<i64, AppError> {
    Ok(conn.query_row(
      r#"SELECT COUNT(*) FROM HawalaTransfer
         WHERE deletedAt IS NULL AND valueDate >= ?1 AND valueDate < date(?1, '+1 day') AND status=?2"#,
      params![day, st],
      |row| row.get(0),
    )?)
  };
  let new_hawalas: i64 = conn.query_row(
    r#"SELECT COUNT(*) FROM HawalaTransfer WHERE deletedAt IS NULL AND valueDate >= ?1 AND valueDate < date(?1, '+1 day')"#,
    [day],
    |row| row.get(0),
  )?;
  let pending: i64 = conn.query_row(
    r#"SELECT COUNT(*) FROM HawalaTransfer
       WHERE deletedAt IS NULL AND status IN ('PENDING','SENT','RECEIVED')"#,
    [],
    |row| row.get(0),
  )?;
  let commission: f64 = conn.query_row(
    r#"SELECT COALESCE(SUM(CAST(ownCommissionAmount AS REAL)),0) FROM HawalaTransfer
       WHERE deletedAt IS NULL AND valueDate >= ?1 AND valueDate < date(?1, '+1 day')"#,
    [day],
    |row| row.get(0),
  )?;
  let pending_settlement: f64 = conn.query_row(
    r#"SELECT COALESCE(SUM(CAST(commissionAmount AS REAL)),0) FROM HawalaTransfer
       WHERE deletedAt IS NULL AND status='COMPLETED' AND commissionSide='PAYABLE'
         AND commissionAmount IS NOT NULL"#,
    [],
    |row| row.get(0),
  )?;
  Ok(DaybookHawalaSummary {
    new_hawalas,
    completed: count_status("COMPLETED")?,
    pending,
    cancelled: count_status("CANCELLED")?,
    returned: count_status("RETURNED")?,
    commission_earned: format_f64(commission),
    pending_settlement: format_f64(pending_settlement),
    outstanding_partner_balance: format_f64(pending_settlement),
  })
}

fn build_customer_activity(
  conn: &Connection,
  day: &str,
) -> Result<DaybookCustomerActivity, AppError> {
  let new_customers: i64 = conn.query_row(
    r#"SELECT COUNT(*) FROM Customer WHERE deletedAt IS NULL AND createdAt >= ?1 AND createdAt < date(?1, '+1 day')"#,
    [day],
    |row| row.get(0),
  )?;
  let returning: i64 = conn.query_row(
    r#"SELECT COUNT(DISTINCT customerId) FROM "Transaction"
       WHERE deletedAt IS NULL AND valueDate >= ?1 AND valueDate < date(?1, '+1 day') AND customerId IS NOT NULL
         AND customerId NOT IN (
           SELECT id FROM Customer WHERE createdAt >= ?1 AND createdAt < date(?1, '+1 day')
         )"#,
    [day],
    |row| row.get(0),
  )?;
  let top: Option<(String, i64)> = conn
    .query_row(
      r#"SELECT c.fullName, COUNT(*) FROM "Transaction" t
         INNER JOIN Customer c ON c.id = t.customerId
         WHERE t.deletedAt IS NULL AND t.valueDate >= ?1 AND t.valueDate < date(?1, '+1 day')
         GROUP BY c.id ORDER BY COUNT(*) DESC LIMIT 1"#,
      [day],
      |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .optional()?;
  let largest: Option<String> = conn
    .query_row(
      r#"SELECT c.fullName || ' · ' || CAST(le.amount AS TEXT) || ' ' || cur.code
         FROM LedgerEntry le
         INNER JOIN "Transaction" t ON t.id = le.transactionId AND t.deletedAt IS NULL
         INNER JOIN Customer c ON c.id = t.customerId
         INNER JOIN Currency cur ON cur.id = le.currencyId
         WHERE t.valueDate >= ?1 AND t.valueDate < date(?1, '+1 day')
         ORDER BY CAST(le.amount AS REAL) DESC LIMIT 1"#,
      [day],
      |row| row.get(0),
    )
    .optional()?;
  let highest_dep: Option<String> = conn
    .query_row(
      r#"SELECT c.fullName || ' · ' || CAST(le.amount AS TEXT) || ' ' || cur.code
         FROM "Transaction" t
         INNER JOIN LedgerEntry le ON le.transactionId = t.id
         INNER JOIN Customer c ON c.id = t.customerId
         INNER JOIN Currency cur ON cur.id = le.currencyId
         WHERE t.deletedAt IS NULL AND t.type='DEPOSIT' AND t.valueDate >= ?1 AND t.valueDate < date(?1, '+1 day')
         ORDER BY CAST(le.amount AS REAL) DESC LIMIT 1"#,
      [day],
      |row| row.get(0),
    )
    .optional()?;
  let highest_wd: Option<String> = conn
    .query_row(
      r#"SELECT c.fullName || ' · ' || CAST(le.amount AS TEXT) || ' ' || cur.code
         FROM "Transaction" t
         INNER JOIN LedgerEntry le ON le.transactionId = t.id
         INNER JOIN Customer c ON c.id = t.customerId
         INNER JOIN Currency cur ON cur.id = le.currencyId
         WHERE t.deletedAt IS NULL AND t.type='WITHDRAWAL' AND t.valueDate >= ?1 AND t.valueDate < date(?1, '+1 day')
         ORDER BY CAST(le.amount AS REAL) DESC LIMIT 1"#,
      [day],
      |row| row.get(0),
    )
    .optional()?;

  Ok(DaybookCustomerActivity {
    new_customers,
    returning_customers: returning,
    top_customer: top
      .as_ref()
      .map(|(n, c)| format!("{n} ({c} txns)")),
    largest_transaction: largest,
    highest_deposit: highest_dep,
    highest_withdrawal: highest_wd,
    most_active_customer: top.map(|(n, _)| n),
  })
}

fn build_partner_activity(
  conn: &Connection,
  day: &str,
) -> Result<DaybookPartnerActivity, AppError> {
  let partner_tx: i64 = conn.query_row(
    r#"SELECT COUNT(*) FROM HawalaTransfer
       WHERE deletedAt IS NULL AND valueDate >= ?1 AND valueDate < date(?1, '+1 day') AND partnerSarafiId IS NOT NULL"#,
    [day],
    |row| row.get(0),
  )?;
  let commission: f64 = conn.query_row(
    r#"SELECT COALESCE(SUM(CAST(commissionAmount AS REAL)),0) FROM HawalaTransfer
       WHERE deletedAt IS NULL AND valueDate >= ?1 AND valueDate < date(?1, '+1 day') AND commissionAmount IS NOT NULL"#,
    [day],
    |row| row.get(0),
  )?;
  let outstanding: f64 = conn.query_row(
    r#"SELECT COALESCE(SUM(CAST(commissionAmount AS REAL)),0) FROM HawalaTransfer
       WHERE deletedAt IS NULL AND status='COMPLETED' AND commissionSide='PAYABLE'"#,
    [],
    |row| row.get(0),
  )?;
  let top: Option<String> = conn
    .query_row(
      r#"SELECT COALESCE(p.name, h.partnerSarafi) FROM HawalaTransfer h
         LEFT JOIN PartnerSarafi p ON p.id = h.partnerSarafiId
         WHERE h.deletedAt IS NULL AND h.valueDate >= ?1 AND h.valueDate < date(?1, '+1 day')
         GROUP BY COALESCE(p.name, h.partnerSarafi)
         ORDER BY COUNT(*) DESC LIMIT 1"#,
      [day],
      |row| row.get(0),
    )
    .optional()?;
  let largest: Option<String> = conn
    .query_row(
      r#"SELECT COALESCE(p.name, h.partnerSarafi) || ' · ' || CAST(h.amount AS TEXT) || ' ' || c.code
         FROM HawalaTransfer h
         LEFT JOIN PartnerSarafi p ON p.id = h.partnerSarafiId
         INNER JOIN Currency c ON c.id = h.currencyId
         WHERE h.deletedAt IS NULL AND h.valueDate >= ?1 AND h.valueDate < date(?1, '+1 day')
         ORDER BY CAST(h.amount AS REAL) DESC LIMIT 1"#,
      [day],
      |row| row.get(0),
    )
    .optional()?;
  let pending_settlements: i64 = conn.query_row(
    r#"SELECT COUNT(*) FROM HawalaTransfer
       WHERE deletedAt IS NULL AND status='COMPLETED' AND commissionSide='PAYABLE'
         AND commissionAmount IS NOT NULL AND CAST(commissionAmount AS REAL) > 0"#,
    [],
    |row| row.get(0),
  )?;

  Ok(DaybookPartnerActivity {
    partner_transactions: partner_tx,
    partner_commission: format_f64(commission),
    outstanding_settlements: format_f64(outstanding),
    top_partner: top,
    largest_transfer: largest,
    pending_settlements,
  })
}

fn build_trading_summary(
  conn: &Connection,
  day: &str,
) -> Result<DaybookTradingSummary, AppError> {
  let exists: bool = conn.query_row(
    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='TradingTrade')",
    [],
    |row| row.get(0),
  )?;
  if !exists {
    return Ok(DaybookTradingSummary {
      purchases: 0,
      sales: 0,
      trading_profit: "0".into(),
      open_positions: 0,
      closed_positions: 0,
      best_currency: None,
      worst_currency: None,
    });
  }
  let purchases: i64 = conn.query_row(
    r#"SELECT COUNT(*) FROM TradingTrade WHERE deletedAt IS NULL AND direction='BUY' AND valueDate >= ?1 AND valueDate < date(?1, '+1 day')"#,
    [day],
    |row| row.get(0),
  )?;
  let sales: i64 = conn.query_row(
    r#"SELECT COUNT(*) FROM TradingTrade WHERE deletedAt IS NULL AND direction='SELL' AND valueDate >= ?1 AND valueDate < date(?1, '+1 day')"#,
    [day],
    |row| row.get(0),
  )?;
  let profit: f64 = conn.query_row(
    r#"SELECT COALESCE(SUM(CAST(grossProfit AS REAL)),0) FROM TradingTrade
       WHERE deletedAt IS NULL AND direction='SELL' AND valueDate >= ?1 AND valueDate < date(?1, '+1 day')"#,
    [day],
    |row| row.get(0),
  )?;
  let open_pos: i64 = {
    let inv_exists: bool = conn.query_row(
      "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='TradingInventory')",
      [],
      |row| row.get(0),
    )?;
    if inv_exists {
      conn.query_row(
        r#"SELECT COUNT(*) FROM TradingInventory WHERE ABS(CAST(quantity AS REAL)) > 0"#,
        [],
        |row| row.get(0),
      )?
    } else {
      0
    }
  };
  let best: Option<String> = conn
    .query_row(
      r#"SELECT c.code FROM TradingTrade t
         INNER JOIN Currency c ON c.id = t.inventoryCurrencyId
         WHERE t.deletedAt IS NULL AND t.direction='SELL' AND t.valueDate >= ?1 AND t.valueDate < date(?1, '+1 day')
         GROUP BY c.code ORDER BY SUM(CAST(t.grossProfit AS REAL)) DESC LIMIT 1"#,
      [day],
      |row| row.get(0),
    )
    .optional()?;
  let worst: Option<String> = conn
    .query_row(
      r#"SELECT c.code FROM TradingTrade t
         INNER JOIN Currency c ON c.id = t.inventoryCurrencyId
         WHERE t.deletedAt IS NULL AND t.direction='SELL' AND t.valueDate >= ?1 AND t.valueDate < date(?1, '+1 day')
         GROUP BY c.code ORDER BY SUM(CAST(t.grossProfit AS REAL)) ASC LIMIT 1"#,
      [day],
      |row| row.get(0),
    )
    .optional()?;

  Ok(DaybookTradingSummary {
    purchases,
    sales,
    trading_profit: format_f64(profit),
    open_positions: open_pos,
    closed_positions: sales,
    best_currency: best,
    worst_currency: worst,
  })
}

fn build_alerts(
  conn: &Connection,
  _day: &str,
  cash: &[DaybookCashPositionRow],
  hawala: &DaybookHawalaSummary,
  trading: &DaybookTradingSummary,
  net_profit: f64,
) -> Result<Vec<DaybookAlert>, AppError> {
  let mut alerts = Vec::new();
  for row in cash {
    let expected = parse_f64(&row.expected_closing);
    if expected < 0.0 {
      alerts.push(DaybookAlert {
        severity: "critical".into(),
        code: "NEG_CASH".into(),
        message: format!("{} cash balance is negative ({})", row.currency_code, row.expected_closing),
      });
    } else if expected > 0.0 && expected < 100.0 {
      alerts.push(DaybookAlert {
        severity: "warn".into(),
        code: "LOW_CASH".into(),
        message: format!("{} cash is low ({})", row.currency_code, row.expected_closing),
      });
    }
    if row.flag == "SHORTAGE" || row.flag == "OVERAGE" {
      alerts.push(DaybookAlert {
        severity: "warn".into(),
        code: "CASH_DIFF".into(),
        message: format!(
          "{} cash difference: {}",
          row.currency_code,
          row.difference.as_deref().unwrap_or("?")
        ),
      });
    }
  }
  if hawala.pending > 0 {
    alerts.push(DaybookAlert {
      severity: "info".into(),
      code: "PENDING_HAWALA".into(),
      message: format!("{} hawala(s) still pending / in transit", hawala.pending),
    });
  }
  if parse_f64(&hawala.pending_settlement) > 0.0 {
    alerts.push(DaybookAlert {
      severity: "warn".into(),
      code: "PARTNER_SETTLE".into(),
      message: format!(
        "Outstanding partner commission: {}",
        hawala.pending_settlement
      ),
    });
  }
  if net_profit < -0.01 {
    alerts.push(DaybookAlert {
      severity: "warn".into(),
      code: "DAILY_LOSS".into(),
      message: format!("Net daily result is a loss ({})", format_f64(net_profit)),
    });
  }
  if trading.open_positions > 10 {
    alerts.push(DaybookAlert {
      severity: "info".into(),
      code: "HIGH_EXPOSURE".into(),
      message: format!(
        "High currency exposure: {} open trading positions",
        trading.open_positions
      ),
    });
  }
  // Large transactions today (> 50k any currency)
  let large: i64 = conn.query_row(
    r#"SELECT COUNT(*) FROM LedgerEntry le
       INNER JOIN "Transaction" t ON t.id = le.transactionId AND t.deletedAt IS NULL
       WHERE date(t.valueDate)=date('now','localtime') AND CAST(le.amount AS REAL) >= 50000"#,
    [],
    |row| row.get(0),
  )?;
  if large > 0 {
    alerts.push(DaybookAlert {
      severity: "info".into(),
      code: "LARGE_TX".into(),
      message: format!("{large} large transaction line(s) (≥ 50,000) today"),
    });
  }
  Ok(alerts)
}

#[tauri::command]
pub fn get_daybook_snapshot(
  state: State<'_, AppState>,
  input: DaybookQueryInput,
) -> Result<DaybookSnapshot, AppError> {
  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "daybook")?;
  compute_daybook_snapshot(&conn, &input)
}

/// One journal line for the Sarafi-style daybook grid.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DaybookJournalLine {
  pub row_no: i64,
  pub value_date: String,
  pub account_code: String,
  pub account_name: String,
  pub opposite_account_code: String,
  pub opposite_account_name: String,
  pub description: String,
  pub debit: String,
  pub credit: String,
  /// Running balance of this row's account (wallet × currency) after the entry.
  pub balance_after: String,
  pub currency_code: String,
  pub transaction_id: String,
  pub reference: String,
  pub display_ref: String,
  pub transaction_type: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DaybookJournalInput {
  pub business_date: Option<String>,
  pub currency_code: Option<String>,
  pub search: Option<String>,
  pub page: Option<i64>,
  pub page_size: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DaybookJournalPage {
  pub business_date: String,
  pub items: Vec<DaybookJournalLine>,
  pub total: i64,
  pub page: i64,
  pub page_size: i64,
}

#[derive(Clone)]
struct TxParty {
  wallet_id: String,
  wallet_type: String,
  wallet_name: String,
  account_code: String,
  account_name: String,
}

fn party_displayable(p: &TxParty) -> bool {
  crate::ledger::is_displayable_wallet(&p.wallet_type, &p.wallet_name)
}

/// Pick the opposite ledger party for a journal line from the same transaction's postings.
/// Only displayable wallets (never SYSTEM / equity / clearing noise).
fn pick_opposite(parties: &[TxParty], self_wallet_id: &str) -> (String, String) {
  let pick = parties
    .iter()
    .find(|p| p.wallet_id != self_wallet_id && party_displayable(p));
  match pick {
    Some(p) => (p.account_code.clone(), p.account_name.clone()),
    None => (String::new(), String::new()),
  }
}

/// User-facing daybook description — prefer the business transaction text, never ledger memos.
fn daybook_description(tx_description: &str, tx_type: &str, reference: &str) -> String {
  let desc = tx_description.trim();
  if !desc.is_empty() {
    return desc.to_string();
  }
  match tx_type.to_ascii_uppercase().as_str() {
    "DEPOSIT" => "Customer deposited to his account".into(),
    "WITHDRAWAL" => "Customer withdrew from his account".into(),
    "TRANSFER" => "Customer transfer from his account".into(),
    "EXCHANGE" => "Currency exchange".into(),
    "HAWALA" => "Hawala".into(),
    "EXPENSE" => "Expense".into(),
    "VAULT_CASH_IN" => "Cash in to Main Vault".into(),
    "VAULT_CASH_OUT" => "Cash out from Main Vault".into(),
    "ADJUSTMENT" => {
      let r = reference.trim();
      if r.is_empty() {
        "Adjustment".into()
      } else {
        r.to_string()
      }
    }
    other if !other.is_empty() => other.to_string(),
    _ => "Transaction".into(),
  }
}

/// Display-only journal balance (ledger SUM; does not change posting).
fn format_journal_balance(v: f64) -> String {
  if !v.is_finite() || v.abs() < 1e-12 {
    return "0".into();
  }
  let body = format_amount_commas(&format_f64(v.abs()));
  if v < 0.0 {
    format!("−{body}")
  } else {
    body
  }
}

/// Load opening nets (wallet × currency) before `business_day` for the given wallets.
fn journal_opening_balances(
  conn: &Connection,
  wallet_ids: &[String],
  business_day: &str,
  currency_code: Option<&str>,
) -> Result<std::collections::HashMap<(String, String), f64>, AppError> {
  let mut map = std::collections::HashMap::new();
  if wallet_ids.is_empty() {
    return Ok(map);
  }
  let placeholders = wallet_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
  let mut sql = format!(
    r#"SELECT le.walletId, c.code,
              COALESCE(SUM(CASE WHEN le.direction='DEBIT' THEN CAST(le.amount AS REAL)
                                ELSE -CAST(le.amount AS REAL) END), 0)
       FROM LedgerEntry le
       INNER JOIN "Transaction" t ON t.id = le.transactionId AND t.deletedAt IS NULL
       INNER JOIN Currency c ON c.id = le.currencyId AND c.deletedAt IS NULL
       WHERE le.walletId IN ({placeholders})
         AND substr(t.valueDate, 1, 10) < ?"#,
  );
  let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = wallet_ids
    .iter()
    .map(|id| Box::new(id.clone()) as Box<dyn rusqlite::types::ToSql>)
    .collect();
  params.push(Box::new(business_day.to_string()));
  if let Some(code) = currency_code {
    sql.push_str(" AND c.code = ?");
    params.push(Box::new(code.to_string()));
  }
  sql.push_str(" GROUP BY le.walletId, c.code");
  let refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
  let mut stmt = conn.prepare(&sql)?;
  for row in stmt.query_map(refs.as_slice(), |row| {
    Ok((
      row.get::<_, String>(0)?,
      row.get::<_, String>(1)?,
      row.get::<_, f64>(2)?,
    ))
  })? {
    let (wid, code, bal) = row?;
    if bal.abs() >= 1e-12 {
      map.insert((wid, code), bal);
    }
  }
  Ok(map)
}

/// Intraday nets for wallets before the first transaction on this page (same business day).
fn journal_prefix_balances(
  conn: &Connection,
  wallet_ids: &[String],
  business_day: &str,
  first_created_at: &str,
  first_tx_id: &str,
  currency_code: Option<&str>,
) -> Result<std::collections::HashMap<(String, String), f64>, AppError> {
  let mut map = std::collections::HashMap::new();
  if wallet_ids.is_empty() {
    return Ok(map);
  }
  let placeholders = wallet_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
  let mut sql = format!(
    r#"SELECT le.walletId, c.code,
              COALESCE(SUM(CASE WHEN le.direction='DEBIT' THEN CAST(le.amount AS REAL)
                                ELSE -CAST(le.amount AS REAL) END), 0)
       FROM LedgerEntry le
       INNER JOIN "Transaction" t ON t.id = le.transactionId AND t.deletedAt IS NULL
       INNER JOIN Currency c ON c.id = le.currencyId AND c.deletedAt IS NULL
       WHERE le.walletId IN ({placeholders})
         AND t.valueDate >= ? AND t.valueDate < date(?, '+1 day')
         AND (t.createdAt < ? OR (t.createdAt = ? AND t.id < ?))"#,
  );
  let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = wallet_ids
    .iter()
    .map(|id| Box::new(id.clone()) as Box<dyn rusqlite::types::ToSql>)
    .collect();
  params.push(Box::new(business_day.to_string()));
  params.push(Box::new(business_day.to_string()));
  params.push(Box::new(first_created_at.to_string()));
  params.push(Box::new(first_created_at.to_string()));
  params.push(Box::new(first_tx_id.to_string()));
  if let Some(code) = currency_code {
    sql.push_str(" AND c.code = ?");
    params.push(Box::new(code.to_string()));
  }
  sql.push_str(" GROUP BY le.walletId, c.code");
  let refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
  let mut stmt = conn.prepare(&sql)?;
  for row in stmt.query_map(refs.as_slice(), |row| {
    Ok((
      row.get::<_, String>(0)?,
      row.get::<_, String>(1)?,
      row.get::<_, f64>(2)?,
    ))
  })? {
    let (wid, code, bal) = row?;
    if bal.abs() >= 1e-12 {
      map.insert((wid, code), bal);
    }
  }
  Ok(map)
}

fn wallet_type_rank(wallet_type: &str) -> i32 {
  match wallet_type.to_ascii_uppercase().as_str() {
    "CUSTOMER" => 0,
    "PARTNER" => 1,
    "VAULT" | "TILL" => 2,
    _ => 9,
  }
}

/// Choose the primary wallet for a business daybook row (never both ledger sides).
/// Prefer customer (tx.customerId when set; for transfers the CREDIT/sender), else partner, else cash.
fn pick_primary_wallet_id(lines: &[RawJournalLine], tx_customer_id: &str) -> Option<String> {
  if lines.is_empty() {
    return None;
  }
  if !tx_customer_id.trim().is_empty() {
    if let Some(line) = lines.iter().find(|l| {
      l.wallet_type.eq_ignore_ascii_case("CUSTOMER")
        && l.customer_id
          .as_deref()
          .map(|id| id == tx_customer_id)
          .unwrap_or(false)
    }) {
      return Some(line.wallet_id.clone());
    }
  }
  let customers: Vec<&RawJournalLine> = lines
    .iter()
    .filter(|l| l.wallet_type.eq_ignore_ascii_case("CUSTOMER"))
    .collect();
  if !customers.is_empty() {
    // Transfers: CREDIT = sender (money leaves). Deposits: DEBIT. Prefer CREDIT when both exist.
    if let Some(sender) = customers.iter().find(|l| l.credit > 0.0) {
      return Some(sender.wallet_id.clone());
    }
    return Some(customers[0].wallet_id.clone());
  }
  let mut ranked = lines.to_vec();
  ranked.sort_by(|a, b| {
    wallet_type_rank(&a.wallet_type)
      .cmp(&wallet_type_rank(&b.wallet_type))
      .then_with(|| a.wallet_id.cmp(&b.wallet_id))
  });
  Some(ranked[0].wallet_id.clone())
}

#[derive(Clone)]
struct RawJournalLine {
  wallet_id: String,
  wallet_type: String,
  customer_id: Option<String>,
  account_code: String,
  account_name: String,
  tx_description: String,
  debit: f64,
  credit: f64,
  currency_code: String,
  tx_id: String,
  tx_customer_id: String,
  reference: String,
  tx_type: String,
  value_date: String,
  sort_key: String,
}

fn load_tx_parties(
  conn: &Connection,
  tx_ids: &[String],
) -> Result<std::collections::HashMap<String, Vec<TxParty>>, AppError> {
  let mut out: std::collections::HashMap<String, Vec<TxParty>> =
    std::collections::HashMap::new();
  if tx_ids.is_empty() {
    return Ok(out);
  }
  let placeholders = tx_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
  let sql = format!(
    r#"SELECT le.transactionId, le.walletId, w.type, w.name,
              COALESCE(w.code, ''), COALESCE(cust.code, ''), COALESCE(cust.fullName, ''),
              COALESCE(t.walkInName, '')
       FROM LedgerEntry le
       INNER JOIN Wallet w ON w.id = le.walletId
       INNER JOIN "Transaction" t ON t.id = le.transactionId
       LEFT JOIN Customer cust ON cust.id = w.customerId
       WHERE le.transactionId IN ({placeholders})
       ORDER BY le.transactionId, le.createdAt, le.id"#
  );
  let params: Vec<&dyn rusqlite::types::ToSql> = tx_ids
    .iter()
    .map(|id| id as &dyn rusqlite::types::ToSql)
    .collect();
  let mut stmt = conn.prepare(&sql)?;
  for row in stmt.query_map(params.as_slice(), |row| {
    Ok((
      row.get::<_, String>(0)?,
      row.get::<_, String>(1)?,
      row.get::<_, String>(2)?,
      row.get::<_, String>(3)?,
      row.get::<_, String>(4)?,
      row.get::<_, String>(5)?,
      row.get::<_, String>(6)?,
      row.get::<_, String>(7)?,
    ))
  })? {
    let (tx_id, wallet_id, wallet_type, wallet_name, wallet_code, cust_code, cust_name, walk_in) =
      row?;
    let account_code = if !cust_code.trim().is_empty() {
      cust_code.trim().to_string()
    } else if !wallet_code.trim().is_empty() {
      wallet_code.trim().to_string()
    } else {
      String::new()
    };
    let account_name = if !cust_name.trim().is_empty() {
      cust_name
    } else if !walk_in.trim().is_empty() {
      walk_in
    } else {
      wallet_name.clone()
    };
    // Deduplicate by wallet within a transaction (multi-currency / multi-line same wallet).
    let list = out.entry(tx_id).or_default();
    if list.iter().any(|p| p.wallet_id == wallet_id) {
      continue;
    }
    list.push(TxParty {
      wallet_id,
      wallet_type,
      wallet_name,
      account_code,
      account_name,
    });
  }
  Ok(out)
}

/// Sarafi daybook journal: **one user-facing row per business transaction**
/// (per currency on the primary party). Opposite Account comes from the other
/// displayable ledger party. Ledger postings are unchanged — this is display only.
#[tauri::command]
pub fn list_daybook_journal(
  state: State<'_, AppState>,
  input: DaybookJournalInput,
) -> Result<DaybookJournalPage, AppError> {
  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "daybook")?;
  let day = input
    .business_date
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .unwrap_or(&today_local())
    .to_string();
  let search = input
    .search
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(|s| s.to_string());
  let currency_code = input
    .currency_code
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(|s| s.to_ascii_uppercase());
  let mut page = input.page.unwrap_or(1).max(1);
  let page_size = input.page_size.unwrap_or(50).clamp(1, 100);
  let mut offset = 0i64;

  // Paginate transactions first (never load the whole day's ledger into memory).
  let mut tx_where = String::from(
    r#"FROM "Transaction" t
       WHERE t.deletedAt IS NULL
         AND t.valueDate >= ?1 AND t.valueDate < date(?1, '+1 day')"#,
  );
  let mut tx_params: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(day.clone())];
  if let Some(ref q) = search {
    tx_where.push_str(
      r#" AND (
            t.reference LIKE ? OR IFNULL(t.displayRef,'') LIKE ? OR t.description LIKE ? OR COALESCE(t.walkInName,'') LIKE ?
            OR EXISTS (
              SELECT 1 FROM LedgerEntry le2
              INNER JOIN Wallet w2 ON w2.id = le2.walletId AND w2.deletedAt IS NULL
              LEFT JOIN Customer cust2 ON cust2.id = w2.customerId
              INNER JOIN Currency c2 ON c2.id = le2.currencyId AND c2.deletedAt IS NULL
              WHERE le2.transactionId = t.id
                AND (w2.name LIKE ? OR cust2.fullName LIKE ? OR cust2.code LIKE ?
                     OR w2.code LIKE ? OR c2.code LIKE ?)
            )
          )"#,
    );
    let like = format!("%{q}%");
    for _ in 0..9 {
      tx_params.push(Box::new(like.clone()));
    }
  }

  let count_sql = format!("SELECT COUNT(*) {tx_where}");
  let count_refs: Vec<&dyn rusqlite::types::ToSql> =
    tx_params.iter().map(|p| p.as_ref()).collect();
  let tx_total: i64 = conn.query_row(&count_sql, count_refs.as_slice(), |row| row.get(0))?;
  let total_pages = if tx_total == 0 {
    1
  } else {
    (tx_total + page_size - 1) / page_size
  };
  if page > total_pages {
    page = total_pages;
  }
  offset = (page - 1) * page_size;

  let chrono = crate::ledger::TX_CHRONO_ASC;
  let tx_sql = format!(
    r#"SELECT t.id, t.reference, IFNULL(t.displayRef,''), t.type, t.valueDate, t.createdAt,
              COALESCE(t.description, ''), COALESCE(t.customerId, '')
       {tx_where}
       ORDER BY {chrono}
       LIMIT ? OFFSET ?"#,
  );
  tx_params.push(Box::new(page_size));
  tx_params.push(Box::new(offset));

  let tx_param_refs: Vec<&dyn rusqlite::types::ToSql> =
    tx_params.iter().map(|p| p.as_ref()).collect();
  let mut tx_stmt = conn.prepare(&tx_sql)?;

  struct TxMeta {
    id: String,
    reference: String,
    display_ref: String,
    tx_type: String,
    value_date: String,
    created_at: String,
    description: String,
    customer_id: String,
  }

  let mut txs: Vec<TxMeta> = Vec::new();
  let mut tx_ids: Vec<String> = Vec::new();
  for row in tx_stmt.query_map(tx_param_refs.as_slice(), |row| {
    Ok((
      row.get::<_, String>(0)?,
      row.get::<_, String>(1)?,
      row.get::<_, String>(2)?,
      row.get::<_, String>(3)?,
      row.get::<_, String>(4)?,
      row.get::<_, String>(5)?,
      row.get::<_, String>(6)?,
      row.get::<_, String>(7)?,
    ))
  })? {
    let (id, reference, display_ref, tx_type, value_date, created_at, description, customer_id) =
      row?;
    tx_ids.push(id.clone());
    txs.push(TxMeta {
      id,
      reference,
      display_ref,
      tx_type,
      value_date,
      created_at,
      description,
      customer_id,
    });
  }

  if txs.is_empty() {
    return Ok(DaybookJournalPage {
      business_date: day,
      items: Vec::new(),
      total: tx_total,
      page,
      page_size,
    });
  }

  // All displayable ledger lines for those transactions (optional currency filter).
  let placeholders = tx_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
  let mut le_sql = format!(
    r#"SELECT le.transactionId, le.walletId, w.name, w.type, COALESCE(w.code, ''),
              COALESCE(w.customerId, ''),
              COALESCE(cust.code, ''), COALESCE(cust.fullName, ''),
              COALESCE(t.walkInName, ''),
              c.code, le.direction, CAST(le.amount AS REAL),
              le.createdAt, le.id
       FROM LedgerEntry le
       INNER JOIN "Transaction" t ON t.id = le.transactionId
       INNER JOIN Wallet w ON w.id = le.walletId AND w.deletedAt IS NULL
       INNER JOIN Currency c ON c.id = le.currencyId AND c.deletedAt IS NULL
       LEFT JOIN Customer cust ON cust.id = w.customerId
       WHERE le.transactionId IN ({placeholders})
         AND w.type != 'SYSTEM'"#
  );
  let mut le_params: Vec<Box<dyn rusqlite::types::ToSql>> = tx_ids
    .iter()
    .map(|id| Box::new(id.clone()) as Box<dyn rusqlite::types::ToSql>)
    .collect();
  if let Some(ref code) = currency_code {
    le_sql.push_str(" AND c.code = ?");
    le_params.push(Box::new(code.clone()));
  }
  le_sql.push_str(" ORDER BY le.transactionId, le.createdAt ASC, le.id ASC");

  let le_param_refs: Vec<&dyn rusqlite::types::ToSql> =
    le_params.iter().map(|p| p.as_ref()).collect();
  let mut le_stmt = conn.prepare(&le_sql)?;

  let mut lines_by_tx: std::collections::HashMap<String, Vec<RawJournalLine>> =
    std::collections::HashMap::new();
  let tx_meta: std::collections::HashMap<String, &TxMeta> =
    txs.iter().map(|t| (t.id.clone(), t)).collect();

  for row in le_stmt.query_map(le_param_refs.as_slice(), |row| {
    Ok((
      row.get::<_, String>(0)?,  // tx id
      row.get::<_, String>(1)?,  // walletId
      row.get::<_, String>(2)?,  // wallet name
      row.get::<_, String>(3)?,  // wallet type
      row.get::<_, String>(4)?,  // wallet code
      row.get::<_, String>(5)?,  // wallet customerId
      row.get::<_, String>(6)?,  // customer code
      row.get::<_, String>(7)?,  // customer name
      row.get::<_, String>(8)?,  // walk-in
      row.get::<_, String>(9)?,  // currency
      row.get::<_, String>(10)?, // direction
      row.get::<_, f64>(11)?,    // amount
      row.get::<_, String>(12)?, // le.createdAt
      row.get::<_, String>(13)?, // le.id
    ))
  })? {
    let (
      tx_id,
      wallet_id,
      wallet_name,
      wallet_type,
      wallet_code,
      wallet_customer_id,
      customer_code,
      customer_name,
      walk_in,
      currency,
      direction,
      amount,
      le_created,
      le_id,
    ) = row?;

    if !crate::ledger::is_displayable_wallet(&wallet_type, &wallet_name) {
      continue;
    }
    let Some(meta) = tx_meta.get(&tx_id) else {
      continue;
    };

    let account_code = if !customer_code.trim().is_empty() {
      customer_code
    } else if !wallet_code.trim().is_empty() {
      wallet_code
    } else {
      String::new()
    };
    let account_name = if !customer_name.trim().is_empty() {
      customer_name
    } else if !walk_in.trim().is_empty() {
      walk_in
    } else {
      wallet_name
    };
    let is_debit = direction.eq_ignore_ascii_case("DEBIT");
    let date_display = meta
      .value_date
      .get(..10)
      .unwrap_or(meta.value_date.as_str())
      .to_string();
    let cust_id = {
      let s = wallet_customer_id.trim();
      if s.is_empty() {
        None
      } else {
        Some(s.to_string())
      }
    };

    lines_by_tx.entry(tx_id.clone()).or_default().push(RawJournalLine {
      wallet_id,
      wallet_type,
      customer_id: cust_id,
      account_code,
      account_name,
      tx_description: meta.description.clone(),
      debit: if is_debit { amount } else { 0.0 },
      credit: if is_debit { 0.0 } else { amount },
      currency_code: currency,
      tx_id: tx_id.clone(),
      tx_customer_id: meta.customer_id.clone(),
      reference: meta.reference.clone(),
      tx_type: meta.tx_type.clone(),
      value_date: date_display,
      sort_key: format!("{}|{}|{}", meta.created_at, le_created, le_id),
    });
  }

  let parties_by_tx = load_tx_parties(&conn, &tx_ids)?;

  // Collapse to one primary party per transaction (one row per currency on that party).
  // Preserve posting order from `txs` (createdAt, id). Multi-currency rows from the same
  // transaction stay together; currency code is only a tertiary display order within that tx.
  // Tuple: (created_at, tx_id, currency, primary_wallet_id, line)
  let mut pending: Vec<(String, String, String, String, DaybookJournalLine)> = Vec::new();
  for meta in &txs {
    let Some(group) = lines_by_tx.get(&meta.id) else {
      continue;
    };
    if group.is_empty() {
      continue;
    }
    let Some(primary_wallet) = pick_primary_wallet_id(group, &meta.customer_id) else {
      continue;
    };
    let mut primary_lines: Vec<&RawJournalLine> = group
      .iter()
      .filter(|l| l.wallet_id == primary_wallet)
      .collect();
    // Aggregate same currency on the primary wallet (rare multi-line same ccy).
    let mut by_ccy: std::collections::BTreeMap<String, (f64, f64, &RawJournalLine)> =
      std::collections::BTreeMap::new();
    primary_lines.sort_by(|a, b| a.sort_key.cmp(&b.sort_key));
    for line in primary_lines {
      let entry = by_ccy
        .entry(line.currency_code.clone())
        .or_insert((0.0, 0.0, line));
      entry.0 += line.debit;
      entry.1 += line.credit;
    }

    let (opp_code, opp_name) = parties_by_tx
      .get(&meta.id)
      .map(|parties| pick_opposite(parties, &primary_wallet))
      .unwrap_or_default();
    let description = daybook_description(&meta.description, &meta.tx_type, &meta.reference);

    for (_ccy, (debit, credit, sample)) in by_ccy {
      pending.push((
        meta.created_at.clone(),
        meta.id.clone(),
        sample.currency_code.clone(),
        primary_wallet.clone(),
        DaybookJournalLine {
          row_no: 0, // assigned after final chronological sort
          value_date: sample.value_date.clone(),
          account_code: sample.account_code.clone(),
          account_name: sample.account_name.clone(),
          opposite_account_code: opp_code.clone(),
          opposite_account_name: opp_name.clone(),
          description: description.clone(),
          debit: if debit.abs() < 1e-12 {
            String::new()
          } else {
            format_f64(debit)
          },
          credit: if credit.abs() < 1e-12 {
            String::new()
          } else {
            format_f64(credit)
          },
          balance_after: String::new(),
          currency_code: sample.currency_code.clone(),
          transaction_id: meta.id.clone(),
          reference: meta.reference.clone(),
          display_ref: meta.display_ref.clone(),
          transaction_type: meta.tx_type.clone(),
        },
      ));
    }
  }

  // Deterministic posting order: createdAt, then transaction id, then currency within a tx.
  pending.sort_by(|a, b| {
    a.0.cmp(&b.0)
      .then_with(|| a.1.cmp(&b.1))
      .then_with(|| a.2.cmp(&b.2))
  });

  // Per-account running balance (wallet × currency), including activity before this day/page.
  let wallet_ids: Vec<String> = pending
    .iter()
    .map(|p| p.3.clone())
    .collect::<std::collections::BTreeSet<_>>()
    .into_iter()
    .collect();
  let mut running = journal_opening_balances(
    &conn,
    &wallet_ids,
    &day,
    currency_code.as_deref(),
  )?;
  if offset > 0 {
    if let Some(first) = txs.first() {
      let prefix = journal_prefix_balances(
        &conn,
        &wallet_ids,
        &day,
        &first.created_at,
        &first.id,
        currency_code.as_deref(),
      )?;
      for (key, net) in prefix {
        *running.entry(key).or_insert(0.0) += net;
      }
    }
  }

  // Apply each page tx's ledger legs for tracked wallets, then stamp balance on primary rows.
  for meta in &txs {
    let Some(group) = lines_by_tx.get(&meta.id) else {
      continue;
    };
    let mut nets: std::collections::HashMap<(String, String), f64> =
      std::collections::HashMap::new();
    for line in group {
      let key = (line.wallet_id.clone(), line.currency_code.clone());
      *nets.entry(key).or_insert(0.0) += line.debit - line.credit;
    }
    for (key, net) in nets {
      *running.entry(key).or_insert(0.0) += net;
    }
    for item in pending.iter_mut().filter(|p| p.1 == meta.id) {
      let key = (item.3.clone(), item.2.clone());
      let bal = running.get(&key).copied().unwrap_or(0.0);
      item.4.balance_after = format_journal_balance(bal);
    }
  }

  let mut items: Vec<DaybookJournalLine> = pending.into_iter().map(|(_, _, _, _, line)| line).collect();
  for (idx, line) in items.iter_mut().enumerate() {
    line.row_no = offset + (idx as i64) + 1;
  }

  Ok(DaybookJournalPage {
    business_date: day,
    items,
    // Paginate by transaction so busy days never materialize the full journal.
    total: tx_total,
    page,
    page_size,
  })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenBusinessDayInput {
  pub business_date: Option<String>,
  pub opened_by_id: String,
  pub notes: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BusinessDayActionResult {
  pub id: String,
  pub business_date: String,
  pub status: String,
}

#[tauri::command]
pub fn open_business_day(
  state: State<'_, AppState>,
  input: OpenBusinessDayInput,
) -> Result<BusinessDayActionResult, AppError> {
  let day = input
    .business_date
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .unwrap_or(&today_local())
    .to_string();
  let user_id = input.opened_by_id.trim().to_string();
  if user_id.is_empty() {
    return Err(AppError::Validation("openedById is required.".into()));
  }

  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "daybook")?;
  if !table_exists_business_day(&conn)? {
    return Err(AppError::Internal(
      "BusinessDay table missing — restart app to apply migrations.".into(),
    ));
  }

  let existing: Option<(String, String)> = conn
    .query_row(
      "SELECT id, status FROM BusinessDay WHERE businessDate=?1",
      [&day],
      |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .optional()?;
  if let Some((id, status)) = existing {
    if status == "OPEN" {
      return Ok(BusinessDayActionResult {
        id,
        business_date: day,
        status,
      });
    }
    if status == "CLOSED" {
      return Err(AppError::Validation(
        "This business day is already closed.".into(),
      ));
    }
  }

  // Only one OPEN day at a time (optional soft rule)
  let other_open: Option<String> = conn
    .query_row(
      "SELECT businessDate FROM BusinessDay WHERE status='OPEN' AND businessDate <> ?1 LIMIT 1",
      [&day],
      |row| row.get(0),
    )
    .optional()?;
  if let Some(other) = other_open {
    return Err(AppError::Validation(format!(
      "Close business day {other} before opening {day}."
    )));
  }

  let id = uuid::Uuid::new_v4().to_string();
  let now = now_sqlite();
  let notes = input
    .notes
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty());

  conn.execute(
    r#"INSERT INTO BusinessDay (
         id, businessDate, status, openedAt, openedById, notes,
         hasCashDifference, createdAt, updatedAt
       ) VALUES (?1,?2,'OPEN',?3,?4,?5,0,?3,?3)"#,
    params![id, day, now, user_id, notes],
  )?;

  // Snapshot opening cash = ledger balance before this business date
  let opening = cash_balances_as_of(&conn, &day)?;
  let current = current_cash_balances(&conn)?;
  let mut by_ccy: std::collections::HashMap<String, (String, Option<String>, f64)> =
    std::collections::HashMap::new();
  for (cid, code, sym, v) in opening {
    by_ccy.insert(cid, (code, sym, v));
  }
  for (cid, code, sym, _) in current {
    by_ccy.entry(cid).or_insert((code, sym, 0.0));
  }

  for (cid, (code, _sym, opening_amt)) in by_ccy {
    conn.execute(
      r#"INSERT INTO BusinessDayCashCount (
           id, businessDayId, currencyId, currencyCode, openingAmount,
           cashReceived, cashPaid, expectedClosing, actualClosing, difference,
           createdAt, updatedAt
         ) VALUES (?1,?2,?3,?4,?5,0,0,?5,NULL,NULL,?6,?6)"#,
      params![
        uuid::Uuid::new_v4().to_string(),
        id,
        cid,
        code,
        format_f64(opening_amt),
        now,
      ],
    )?;
  }

  let after = serde_json::json!({
    "businessDate": day,
    "status": "OPEN",
    "openedAt": now,
  })
  .to_string();
  write_audit(&conn, Some(&user_id), "OPEN_DAY", &id, None, Some(&after))?;

  Ok(BusinessDayActionResult {
    id,
    business_date: day,
    status: "OPEN".into(),
  })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloseCashCountInput {
  pub currency_code: String,
  pub actual_closing: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloseBusinessDayInput {
  pub business_date: Option<String>,
  pub closed_by_id: String,
  pub difference_reason: Option<String>,
  pub notes: Option<String>,
  pub acknowledge_differences: bool,
  pub cash_counts: Vec<CloseCashCountInput>,
}

#[tauri::command]
pub fn close_business_day(
  state: State<'_, AppState>,
  input: CloseBusinessDayInput,
) -> Result<BusinessDayActionResult, AppError> {
  let day = input
    .business_date
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .unwrap_or(&today_local())
    .to_string();
  let user_id = input.closed_by_id.trim().to_string();
  if user_id.is_empty() {
    return Err(AppError::Validation("closedById is required.".into()));
  }
  if input.cash_counts.is_empty() {
    return Err(AppError::Validation(
      "Enter actual cash counts for each currency.".into(),
    ));
  }

  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "daybook")?;
  let (day_id, status): (String, String) = conn
    .query_row(
      "SELECT id, status FROM BusinessDay WHERE businessDate=?1",
      [&day],
      |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .optional()?
    .ok_or_else(|| AppError::Validation("Open the business day before closing.".into()))?;
  if status != "OPEN" {
    return Err(AppError::Validation("Business day is not open.".into()));
  }

  let flow = cash_flow_on_day(&conn, &day)?;
  let snap = compute_daybook_snapshot(
    &conn,
    &DaybookQueryInput {
      business_date: Some(day.clone()),
      currency_code: None,
      customer_id: None,
      partner_id: None,
      user_id: None,
      module: None,
      tx_type: None,
      status: None,
      amount_min: None,
      amount_max: None,
      search: None,
      timeline_page: Some(1),
      timeline_page_size: Some(1),
    },
  )?;

  let mut has_diff = false;
  let mut diff_details = Vec::new();

  for count in &input.cash_counts {
    let code = count.currency_code.trim().to_ascii_uppercase();
    let actual = parse_f64(count.actual_closing.trim());
    let pos = snap
      .cash_position
      .iter()
      .find(|r| r.currency_code == code)
      .ok_or_else(|| AppError::Validation(format!("Unknown currency {code}")))?;
    let expected = parse_f64(&pos.expected_closing);
    let opening = parse_f64(&pos.opening);
    let (recv, paid) = {
      let cid = &pos.currency_id;
      flow.get(cid).copied().unwrap_or((0.0, 0.0))
    };
    let difference = actual - expected;
    if difference.abs() > 0.0001 {
      has_diff = true;
      diff_details.push(format!("{code}: {}", format_f64(difference)));
    }
    let updated = conn.execute(
      r#"UPDATE BusinessDayCashCount SET
           cashReceived = ?1, cashPaid = ?2, expectedClosing = ?3,
           actualClosing = ?4, difference = ?5, updatedAt = ?6
         WHERE businessDayId = ?7 AND currencyCode = ?8"#,
      params![
        format_f64(recv),
        format_f64(paid),
        format_f64(expected),
        format_f64(actual),
        format_f64(difference),
        now_sqlite(),
        day_id,
        code,
      ],
    )?;
    if updated == 0 {
      conn.execute(
        r#"INSERT INTO BusinessDayCashCount (
             id, businessDayId, currencyId, currencyCode, openingAmount,
             cashReceived, cashPaid, expectedClosing, actualClosing, difference,
             createdAt, updatedAt
           ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?11)"#,
        params![
          uuid::Uuid::new_v4().to_string(),
          day_id,
          pos.currency_id,
          code,
          format_f64(opening),
          format_f64(recv),
          format_f64(paid),
          format_f64(expected),
          format_f64(actual),
          format_f64(difference),
          now_sqlite(),
        ],
      )?;
    }
  }

  if has_diff {
    let reason = input
      .difference_reason
      .as_deref()
      .map(str::trim)
      .filter(|s| !s.is_empty());
    if reason.is_none() && !input.acknowledge_differences {
      return Err(AppError::Validation(format!(
        "Cash differences exist ({}). Provide a reason and acknowledge discrepancies.",
        diff_details.join(", ")
      )));
    }
    if reason.is_none() {
      return Err(AppError::Validation(
        "A reason is required when cash differences exist.".into(),
      ));
    }
  }

  let now = now_sqlite();
  let reason = input
    .difference_reason
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty());
  let notes = input
    .notes
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty());

  conn.execute(
    r#"UPDATE BusinessDay SET
         status='CLOSED', closedAt=?1, closedById=?2, differenceReason=?3, notes=COALESCE(?4, notes),
         transactionCount=?5, profitSnapshot=?6, expenseSnapshot=?7, hasCashDifference=?8, updatedAt=?1
       WHERE id=?9"#,
    params![
      now,
      user_id,
      reason,
      notes,
      snap.daily_summary.total_transactions,
      snap.profit.net_daily_profit,
      snap.expenses.total,
      if has_diff { 1 } else { 0 },
      day_id,
    ],
  )?;

  let after = serde_json::json!({
    "businessDate": day,
    "status": "CLOSED",
    "closedAt": now,
    "hasCashDifference": has_diff,
    "differences": diff_details,
    "reason": reason,
  })
  .to_string();
  write_audit(
    &conn,
    Some(&user_id),
    "CLOSE_DAY",
    &day_id,
    Some(r#"{"status":"OPEN"}"#),
    Some(&after),
  )?;

  Ok(BusinessDayActionResult {
    id: day_id,
    business_date: day,
    status: "CLOSED".into(),
  })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListBusinessDaysInput {
  pub page: Option<i64>,
  pub page_size: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BusinessDayHistoryRow {
  pub id: String,
  pub business_date: String,
  pub status: String,
  pub opened_by_name: Option<String>,
  pub closed_by_name: Option<String>,
  pub opened_at: Option<String>,
  pub closed_at: Option<String>,
  pub transaction_count: Option<i64>,
  pub profit: Option<String>,
  pub expenses: Option<String>,
  pub has_cash_difference: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BusinessDayHistoryPage {
  pub items: Vec<BusinessDayHistoryRow>,
  pub total: i64,
  pub page: i64,
  pub page_size: i64,
}

#[tauri::command]
pub fn list_business_days(
  state: State<'_, AppState>,
  input: ListBusinessDaysInput,
) -> Result<BusinessDayHistoryPage, AppError> {
  let page_size = input.page_size.unwrap_or(30).clamp(1, 100);
  let mut page = input.page.unwrap_or(1).max(1);
  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "daybook")?;
  if !table_exists_business_day(&conn)? {
    return Ok(BusinessDayHistoryPage {
      items: vec![],
      total: 0,
      page: 1,
      page_size,
    });
  }
  let total: i64 = conn.query_row("SELECT COUNT(*) FROM BusinessDay", [], |row| row.get(0))?;
  let total_pages = if total == 0 {
    1
  } else {
    (total + page_size - 1) / page_size
  };
  if page > total_pages {
    page = total_pages;
  }
  let offset = (page - 1) * page_size;
  let mut stmt = conn.prepare(
    r#"SELECT d.id, d.businessDate, d.status, ou.fullName, cu.fullName,
              d.openedAt, d.closedAt, d.transactionCount, d.profitSnapshot, d.expenseSnapshot,
              d.hasCashDifference
       FROM BusinessDay d
       LEFT JOIN User ou ON ou.id = d.openedById
       LEFT JOIN User cu ON cu.id = d.closedById
       ORDER BY d.businessDate DESC
       LIMIT ?1 OFFSET ?2"#,
  )?;
  let items = stmt
    .query_map(params![page_size, offset], |row| {
      Ok(BusinessDayHistoryRow {
        id: row.get(0)?,
        business_date: row.get(1)?,
        status: row.get(2)?,
        opened_by_name: row.get(3)?,
        closed_by_name: row.get(4)?,
        opened_at: row.get(5)?,
        closed_at: row.get(6)?,
        transaction_count: row.get(7)?,
        profit: row.get(8)?,
        expenses: row.get(9)?,
        has_cash_difference: row.get::<_, i64>(10)? != 0,
      })
    })?
    .collect::<Result<Vec<_>, _>>()?;

  Ok(BusinessDayHistoryPage {
    items,
    total,
    page,
    page_size,
  })
}

/// Compact widget payload for main dashboard.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DaybookDashboardWidget {
  pub business_date: String,
  pub status: String,
  pub total_transactions: i64,
  pub todays_profit: String,
  pub todays_expenses: String,
  pub pending_hawalas: i64,
  pub pending_settlements: String,
  pub cash_difference: bool,
  pub cash: Vec<DaybookCashPositionRow>,
}

#[tauri::command]
pub fn get_daybook_dashboard_widget(
  state: State<'_, AppState>,
) -> Result<DaybookDashboardWidget, AppError> {
  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "daybook")?;
  let day = today_local();

  let (status, cash_difference) = if table_exists_business_day(&conn)? {
    let meta = load_day_meta(&conn, &day)?;
    (meta.status, meta.has_cash_difference)
  } else {
    ("NOT_OPENED".into(), false)
  };

  let total_transactions: i64 = conn.query_row(
    r#"SELECT COUNT(*) FROM "Transaction"
       WHERE deletedAt IS NULL
         AND valueDate >= ?1 AND valueDate < date(?1, '+1 day')"#,
    [&day],
    |row| row.get(0),
  )?;

  let trading_profit: f64 = {
    let exists: bool = conn.query_row(
      "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='TradingTrade')",
      [],
      |row| row.get(0),
    )?;
    if exists {
      conn.query_row(
        r#"SELECT COALESCE(SUM(CAST(grossProfit AS REAL)),0) FROM TradingTrade
           WHERE deletedAt IS NULL AND direction='SELL'
             AND valueDate >= ?1 AND valueDate < date(?1, '+1 day')"#,
        [&day],
        |row| row.get(0),
      )?
    } else {
      0.0
    }
  };
  let commission: f64 = conn.query_row(
    r#"SELECT COALESCE(SUM(CAST(ownCommissionAmount AS REAL)),0) FROM HawalaTransfer
       WHERE deletedAt IS NULL
         AND valueDate >= ?1 AND valueDate < date(?1, '+1 day')"#,
    [&day],
    |row| row.get(0),
  )?;
  let expenses_total = expense_totals(&conn, &day)?.6;

  let pending_hawalas: i64 = conn.query_row(
    r#"SELECT COUNT(*) FROM HawalaTransfer
       WHERE deletedAt IS NULL AND status IN ('PENDING','SENT','RECEIVED')"#,
    [],
    |row| row.get(0),
  )?;
  let pending_settlement: f64 = conn.query_row(
    r#"SELECT COALESCE(SUM(CAST(commissionAmount AS REAL)),0) FROM HawalaTransfer
       WHERE deletedAt IS NULL AND status IN ('SENT','RECEIVED','COMPLETED','PENDING')
         AND commissionSide='PAYABLE'
         AND commissionAmount IS NOT NULL"#,
    [],
    |row| row.get(0),
  )?;

  let cash_rows = current_cash_balances(&conn)?;
  let cash: Vec<DaybookCashPositionRow> = cash_rows
    .into_iter()
    .filter(|(_, _, _, bal)| bal.abs() > 1e-9)
    .map(|(id, code, symbol, bal)| {
      let bal_s = format_f64(bal);
      DaybookCashPositionRow {
        currency_id: id,
        currency_code: code,
        currency_symbol: symbol,
        opening: bal_s.clone(),
        received: "0".into(),
        paid: "0".into(),
        expected_closing: bal_s,
        actual_closing: None,
        difference: None,
        flag: "OK".into(),
      }
    })
    .collect();

  Ok(DaybookDashboardWidget {
    business_date: day,
    status,
    total_transactions,
    todays_profit: format_f64(trading_profit + commission),
    todays_expenses: format_f64(expenses_total),
    pending_hawalas,
    pending_settlements: format_f64(pending_settlement),
    cash_difference,
    cash,
  })
}
