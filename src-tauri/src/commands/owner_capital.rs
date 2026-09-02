//! Owner Capital — calculated from ledger; inject/withdraw posts via Opening Equity.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::AppError;
use crate::ledger::{
  find_currency_by_code, money_from_major_units, money_to_major_unit_string, post_transaction,
  resolve_shop_cash_wallet_id, PostTransactionInput, PostingLineDto,
};
use crate::state::AppState;
use crate::util::{now_sqlite, format_f64};
use crate::commands::authorize::{require_screen};

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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapitalCurrencyBreakdown {
  pub currency_id: String,
  pub currency_code: String,
  pub currency_name: String,
  pub currency_symbol: Option<String>,
  pub cash: String,
  pub customer_funds: String,
  /// Absolute negative customer balances (customers owe the shop).
  pub customer_owes: String,
  pub partner_payable: String,
  pub partner_receivable: String,
  pub pending_hawala: String,
  pub trading_inventory_cost: String,
  pub commission_income: String,
  /// Lifetime owner INVEST into this currency (OwnerCapitalEvent).
  pub owner_invested: String,
  /// Lifetime owner WITHDRAW from this currency (OwnerCapitalEvent).
  pub owner_withdrawn: String,
  /// Liabilities: customer funds + partner payable + pending hawala.
  pub i_owe: String,
  /// Claims: partner receivable + customer overdrafts.
  pub people_owe_me: String,
  pub owner_capital: String,
  /// Main Vault ledger cash for this currency (physical cash pool).
  pub main_vault_cash: String,
  /// Ownership total that should equal Main Vault when books are consistent.
  /// owner + customerFunds − customerOwes + payable + pending − receivable − trading
  pub expected_main_vault: String,
  /// actual Main Vault − expected
  pub vault_difference: String,
  /// `BALANCED` or `DIFFERENCE`
  pub vault_status: String,
  pub percent_of_total: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OwnerCapitalSnapshot {
  pub as_of: String,
  pub total_cash: String,
  pub total_customer_funds: String,
  pub total_customer_owes: String,
  pub total_partner_payable: String,
  pub total_partner_receivable: String,
  pub total_pending_hawala: String,
  pub total_trading_inventory: String,
  pub total_commission_income: String,
  pub total_owner_invested: String,
  pub total_owner_withdrawn: String,
  pub total_i_owe: String,
  pub total_people_owe_me: String,
  pub total_owner_capital: String,
  pub profit_today: String,
  pub profit_month: String,
  pub trading_profit_month: String,
  pub exchange_count_month: i64,
  pub hawala_commission_month: String,
  pub by_currency: Vec<CapitalCurrencyBreakdown>,
}

fn owner_capital_event_sums(
  conn: &Connection,
  as_of: &str,
) -> Result<(std::collections::HashMap<String, f64>, std::collections::HashMap<String, f64>), AppError>
{
  let mut invested = std::collections::HashMap::new();
  let mut withdrawn = std::collections::HashMap::new();
  let has: bool = conn.query_row(
    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='OwnerCapitalEvent')",
    [],
    |row| row.get(0),
  )?;
  if !has {
    return Ok((invested, withdrawn));
  }
  let mut stmt = conn.prepare(
    r#"SELECT currencyId, kind, COALESCE(SUM(CAST(amount AS REAL)), 0)
       FROM OwnerCapitalEvent
       WHERE deletedAt IS NULL AND valueDate < date(?1, '+1 day')
       GROUP BY currencyId, kind"#,
  )?;
  let rows = stmt
    .query_map(params![as_of], |row| {
      Ok((
        row.get::<_, String>(0)?,
        row.get::<_, String>(1)?,
        row.get::<_, f64>(2)?,
      ))
    })?
    .collect::<Result<Vec<_>, _>>()?;
  for (cid, kind, amt) in rows {
    let k = kind.trim().to_ascii_uppercase();
    if k == "INVEST" {
      *invested.entry(cid).or_insert(0.0) += amt.max(0.0);
    } else if k == "WITHDRAW" {
      *withdrawn.entry(cid).or_insert(0.0) += amt.max(0.0);
    }
  }
  Ok((invested, withdrawn))
}

fn wallet_type_sums(
  conn: &Connection,
  wallet_type: &str,
  as_of: &str,
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
         AND t.valueDate < date(?2, '+1 day')
       GROUP BY c.id, c.code, c.name, c.symbol
       ORDER BY c.code"#,
  )?;
  let rows = stmt
    .query_map(params![wallet_type, as_of], |row| {
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

/// Main Vault ledger balance per currency (the only physical cash pool).
fn main_vault_sums(
  conn: &Connection,
  as_of: &str,
) -> Result<Vec<(String, String, String, Option<String>, f64)>, AppError> {
  let mut stmt = conn.prepare(
    r#"SELECT c.id, c.code, c.name, c.symbol,
              COALESCE(SUM(CASE WHEN le.direction='DEBIT' THEN CAST(le.amount AS REAL)
                                ELSE -CAST(le.amount AS REAL) END), 0)
       FROM Wallet w
       INNER JOIN LedgerEntry le ON le.walletId = w.id
       INNER JOIN "Transaction" t ON t.id = le.transactionId AND t.deletedAt IS NULL
       INNER JOIN Currency c ON c.id = le.currencyId AND c.deletedAt IS NULL
       WHERE w.name = 'Main Vault' AND w.type = 'VAULT'
         AND w.deletedAt IS NULL AND w.isActive = 1
         AND t.valueDate < date(?1, '+1 day')
       GROUP BY c.id, c.code, c.name, c.symbol
       ORDER BY c.code"#,
  )?;
  let rows = stmt
    .query_map(params![as_of], |row| {
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

/// Per-customer wallet balances first, then:
/// - funds = Σ positive balances (money owed to customers)
/// - owes  = Σ |negative| balances (customers owe Sarafi)
fn customer_funds_and_owes_by_currency(
  conn: &Connection,
  as_of: &str,
) -> Result<
  (
    Vec<(String, String, String, Option<String>)>,
    std::collections::HashMap<String, f64>,
    std::collections::HashMap<String, f64>,
  ),
  AppError,
> {
  let mut stmt = conn.prepare(
    r#"SELECT c.id, c.code, c.name, c.symbol, w.id,
              COALESCE(SUM(CASE WHEN le.direction='DEBIT' THEN CAST(le.amount AS REAL)
                                ELSE -CAST(le.amount AS REAL) END), 0)
       FROM Wallet w
       INNER JOIN LedgerEntry le ON le.walletId = w.id
       INNER JOIN "Transaction" t ON t.id = le.transactionId AND t.deletedAt IS NULL
       INNER JOIN Currency c ON c.id = le.currencyId AND c.deletedAt IS NULL
       WHERE w.type = 'CUSTOMER' AND w.deletedAt IS NULL AND w.isActive = 1
         AND t.valueDate < date(?1, '+1 day')
       GROUP BY c.id, c.code, c.name, c.symbol, w.id
       ORDER BY c.code"#,
  )?;
  let rows = stmt
    .query_map(params![as_of], |row| {
      Ok((
        row.get::<_, String>(0)?,
        row.get::<_, String>(1)?,
        row.get::<_, String>(2)?,
        row.get::<_, Option<String>>(3)?,
        row.get::<_, String>(4)?,
        row.get::<_, f64>(5)?,
      ))
    })?
    .collect::<Result<Vec<_>, _>>()?;

  let mut meta: std::collections::HashMap<String, (String, String, Option<String>)> =
    std::collections::HashMap::new();
  let mut funds: std::collections::HashMap<String, f64> = std::collections::HashMap::new();
  let mut owes: std::collections::HashMap<String, f64> = std::collections::HashMap::new();

  for (cid, code, name, symbol, _wallet_id, bal) in rows {
    meta.entry(cid.clone())
      .or_insert_with(|| (code, name, symbol));
    if bal > 1e-9 {
      *funds.entry(cid).or_insert(0.0) += bal;
    } else if bal < -1e-9 {
      *owes.entry(cid).or_insert(0.0) += -bal;
    }
  }

  let currencies: Vec<(String, String, String, Option<String>)> = meta
    .into_iter()
    .map(|(cid, (code, name, symbol))| (cid, code, name, symbol))
    .collect();
  Ok((currencies, funds, owes))
}

fn named_system_sums(
  conn: &Connection,
  name: &str,
  as_of: &str,
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
         AND t.valueDate < date(?2, '+1 day')
       GROUP BY c.id"#,
  )?;
  let rows = stmt
    .query_map(params![name, as_of], |row| {
      Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
    })?
    .collect::<Result<Vec<_>, _>>()?;
  for (cid, v) in rows {
    map.insert(cid, v);
  }
  Ok(map)
}

fn partner_open_maps(
  conn: &Connection,
  as_of: &str,
) -> Result<(std::collections::HashMap<String, f64>, std::collections::HashMap<String, f64>), AppError>
{
  let mut payable = std::collections::HashMap::new();
  let mut receivable = std::collections::HashMap::new();

  // 1) Hawala commission open
  {
    let mut stmt = conn.prepare(
      r#"SELECT COALESCE(h.commissionCurrencyId, h.currencyId),
                h.commissionSide,
                COALESCE(SUM(CAST(h.commissionAmount AS REAL)), 0)
         FROM HawalaTransfer h
         WHERE h.deletedAt IS NULL AND h.status IN ('SENT','RECEIVED','COMPLETED','PENDING')
           AND h.commissionAmount IS NOT NULL
           AND CAST(h.commissionAmount AS REAL) > 0
           AND h.valueDate < date(?1, '+1 day')
         GROUP BY COALESCE(h.commissionCurrencyId, h.currencyId), h.commissionSide"#,
    )?;
    let rows = stmt
      .query_map([as_of], |row| {
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
  }

  // 2) Hawala principal open (SEND = you owe, RECEIVE = they owe)
  {
    let mut stmt = conn.prepare(
      r#"SELECT
           CASE
             WHEN UPPER(h.direction) = 'SEND' THEN COALESCE(h.receiveCurrencyId, h.currencyId)
             ELSE h.currencyId
           END,
           UPPER(h.direction),
           COALESCE(SUM(CASE
             WHEN UPPER(h.direction) = 'SEND' THEN CAST(COALESCE(h.receiveAmount, h.amount) AS REAL)
             ELSE CAST(h.amount AS REAL)
           END), 0)
         FROM HawalaTransfer h
         WHERE h.deletedAt IS NULL
           AND h.status IN ('SENT','RECEIVED','COMPLETED','PENDING')
           AND h.valueDate < date(?1, '+1 day')
         GROUP BY 1, 2"#,
    )?;
    let rows = stmt
      .query_map([as_of], |row| {
        Ok((
          row.get::<_, String>(0)?,
          row.get::<_, String>(1)?,
          row.get::<_, f64>(2)?,
        ))
      })?
      .collect::<Result<Vec<_>, _>>()?;
    for (cid, direction, amt) in rows {
      if direction == "SEND" {
        *payable.entry(cid).or_insert(0.0) += amt;
      } else if direction == "RECEIVE" {
        *receivable.entry(cid).or_insert(0.0) += amt;
      }
    }
  }

  // 3) Partner wallet opening / claim balances
  {
    let mut stmt = conn.prepare(
      r#"SELECT c.id,
                COALESCE(SUM(CASE WHEN le.direction='DEBIT' THEN CAST(le.amount AS REAL)
                                  ELSE -CAST(le.amount AS REAL) END), 0)
         FROM Wallet w
         INNER JOIN LedgerEntry le ON le.walletId = w.id
         INNER JOIN "Transaction" t ON t.id = le.transactionId AND t.deletedAt IS NULL
         INNER JOIN Currency c ON c.id = le.currencyId AND c.deletedAt IS NULL
         WHERE w.type = 'PARTNER' AND w.deletedAt IS NULL AND w.isActive = 1
           AND t.valueDate < date(?1, '+1 day')
         GROUP BY c.id"#,
    )?;
    let rows = stmt
      .query_map([as_of], |row| Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?)))?
      .collect::<Result<Vec<_>, _>>()?;
    for (cid, bal) in rows {
      if bal > 1e-9 {
        *payable.entry(cid).or_insert(0.0) += bal;
      } else if bal < -1e-9 {
        *receivable.entry(cid).or_insert(0.0) += -bal;
      }
    }
  }

  // 4) Subtract cash settlements (commission + hawala principal clearing settles).
  //    Skip settlements that only reverse partner-wallet opening (no Hawala Clearing /
  //    commission P&L) — those already reduced the wallet balance above.
  if let Ok(mut s) = conn.prepare(
    r#"SELECT currencyId, kind, COALESCE(SUM(CAST(amount AS REAL)),0)
       FROM PartnerCommissionSettlement s
       WHERE deletedAt IS NULL
         AND valueDate < date(?1, '+1 day')
         AND (
           UPPER(COALESCE(balanceType, 'COMMISSION')) = 'COMMISSION'
           OR EXISTS (
             SELECT 1 FROM LedgerEntry le
             INNER JOIN Wallet w ON w.id = le.walletId
             WHERE le.transactionId = s.transactionId
               AND w.type = 'SYSTEM'
               AND w.name IN ('Hawala Clearing', 'Partner Commission Expense', 'Partner Commission Income')
           )
         )
       GROUP BY currencyId, kind"#,
  ) {
    if let Ok(mapped) = s.query_map([as_of], |row| {
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

  // Normalize over-pay / over-collect flips
  let keys: Vec<String> = payable
    .keys()
    .chain(receivable.keys())
    .cloned()
    .collect::<std::collections::HashSet<_>>()
    .into_iter()
    .collect();
  for cid in keys {
    let mut p = payable.get(&cid).copied().unwrap_or(0.0);
    let mut r = receivable.get(&cid).copied().unwrap_or(0.0);
    if r < -1e-9 {
      p -= r;
      r = 0.0;
    }
    if p < -1e-9 {
      r -= p;
      p = 0.0;
    }
    if p > 1e-9 {
      payable.insert(cid.clone(), p);
    } else {
      payable.remove(&cid);
    }
    if r > 1e-9 {
      receivable.insert(cid.clone(), r);
    } else {
      receivable.remove(&cid);
    }
  }

  Ok((payable, receivable))
}

fn pending_hawala_by_currency(
  conn: &Connection,
  as_of: &str,
) -> Result<std::collections::HashMap<String, f64>, AppError> {
  let mut map = std::collections::HashMap::new();
  // Open on as_of: started by that day, and not completed/cancelled until after that day.
  let mut stmt = conn.prepare(
    r#"SELECT currencyId, COALESCE(SUM(CAST(amount AS REAL)),0)
       FROM HawalaTransfer
       WHERE deletedAt IS NULL
         AND valueDate < date(?1, '+1 day')
         AND (
           status IN ('PENDING','SENT','RECEIVED')
           OR (
             status = 'COMPLETED'
             AND completedAt IS NOT NULL
             AND completedAt >= date(?1, '+1 day')
           )
         )
       GROUP BY currencyId"#,
  )?;
  for row in stmt.query_map([as_of], |row| Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?)))? {
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

pub fn compute_owner_capital_snapshot(
  conn: &Connection,
  as_of_opt: Option<&str>,
) -> Result<OwnerCapitalSnapshot, AppError> {
  let today = chrono::Local::now().format("%Y-%m-%d").to_string();
  let as_of = as_of_opt
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(|s| s.chars().take(10).collect::<String>())
    .filter(|s| s.len() == 10)
    .unwrap_or_else(|| today.clone());
  let month_start = format!("{}-01", &as_of[..7.min(as_of.len())]);

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
      customer_owes: "0".into(),
      partner_payable: "0".into(),
      partner_receivable: "0".into(),
      pending_hawala: "0".into(),
      trading_inventory_cost: "0".into(),
      commission_income: "0".into(),
      owner_invested: "0".into(),
      owner_withdrawn: "0".into(),
      i_owe: "0".into(),
      people_owe_me: "0".into(),
      owner_capital: "0".into(),
      main_vault_cash: "0".into(),
      expected_main_vault: "0".into(),
      vault_difference: "0".into(),
      vault_status: "BALANCED".into(),
      percent_of_total: "0".into(),
    });
  };

  // Physical cash = Main Vault only (ADR-044). Also keep VAULT+TILL sum as legacy `cash`
  // display aligned to Main Vault when tills are empty after consolidation.
  let mut cash_map: std::collections::HashMap<String, f64> = std::collections::HashMap::new();
  for (cid, code, name, symbol, v) in main_vault_sums(conn, &as_of)? {
    ensure_row(&mut by_ccy, &cid, &code, &name, symbol);
    *cash_map.entry(cid).or_insert(0.0) += v;
  }
  // If Main Vault has no rows yet but other VAULT/TILL activity exists, fall back.
  if cash_map.is_empty() {
    for (cid, code, name, symbol, v) in wallet_type_sums(conn, "VAULT", &as_of)? {
      ensure_row(&mut by_ccy, &cid, &code, &name, symbol);
      *cash_map.entry(cid).or_insert(0.0) += v;
    }
    for (cid, code, name, symbol, v) in wallet_type_sums(conn, "TILL", &as_of)? {
      ensure_row(&mut by_ccy, &cid, &code, &name, symbol);
      *cash_map.entry(cid).or_insert(0.0) += v;
    }
  }

  // Customer funds / owes: balance each CUSTOMER wallet first, then Σ positives / Σ |negatives|.
  let (customer_ccys, customer_map, customer_owes_map) =
    customer_funds_and_owes_by_currency(conn, &as_of)?;
  for (cid, code, name, symbol) in customer_ccys {
    ensure_row(&mut by_ccy, &cid, &code, &name, symbol);
  }

  let (payable_map, receivable_map) = partner_open_maps(conn, &as_of)?;
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

  let pending_map = pending_hawala_by_currency(conn, &as_of)?;
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

  let income_map = named_system_sums(conn, "Hawala Commission Income", &as_of)?;
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

  let (invested_map, withdrawn_map) = owner_capital_event_sums(conn, &as_of)?;
  for cid in invested_map.keys().chain(withdrawn_map.keys()) {
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

  let mut total_cash = 0.0;
  let mut total_customer = 0.0;
  let mut total_customer_owes = 0.0;
  let mut total_pay = 0.0;
  let mut total_recv = 0.0;
  let mut total_pending = 0.0;
  let mut total_income = 0.0;
  let mut total_invested = 0.0;
  let mut total_withdrawn = 0.0;
  let mut total_i_owe = 0.0;
  let mut total_people_owe = 0.0;
  let mut total_owner = 0.0;

  let mut rows: Vec<CapitalCurrencyBreakdown> = by_ccy.into_values().collect();
  rows.sort_by(|a, b| a.currency_code.cmp(&b.currency_code));

  for row in &mut rows {
    let cid = row.currency_id.clone();
    let cash = cash_map.get(&cid).copied().unwrap_or(0.0);
    let customer = customer_map.get(&cid).copied().unwrap_or(0.0).max(0.0);
    let customer_owes = customer_owes_map.get(&cid).copied().unwrap_or(0.0).max(0.0);
    let payable = payable_map.get(&cid).copied().unwrap_or(0.0).max(0.0);
    let receivable = receivable_map.get(&cid).copied().unwrap_or(0.0).max(0.0);
    let pending = pending_map.get(&cid).copied().unwrap_or(0.0).max(0.0);
    // Commission income credit balance → negative asset sum; use -min(0,v)
    let income_raw = income_map.get(&cid).copied().unwrap_or(0.0);
    let income = (-income_raw).max(0.0);
    let invested = invested_map.get(&cid).copied().unwrap_or(0.0).max(0.0);
    let withdrawn = withdrawn_map.get(&cid).copied().unwrap_or(0.0).max(0.0);
    let i_owe = customer + payable + pending;
    let people_owe_me = receivable + customer_owes;

    // Owner capital identity (per currency) — cash and claims in THIS currency only.
    // Do not add trading inventory: that value is a converted cost for P&L.
    let owner = cash - customer + customer_owes - payable - pending + receivable;

    // Ownership total that should equal Main Vault when books are consistent.
    let expected = owner + customer - customer_owes + payable + pending - receivable;
    let difference = cash - expected;
    let status = if difference.abs() < 0.005 {
      "BALANCED"
    } else {
      "DIFFERENCE"
    };

    row.cash = format_f64(cash);
    row.customer_funds = format_f64(customer);
    row.customer_owes = format_f64(customer_owes);
    row.partner_payable = format_f64(payable);
    row.partner_receivable = format_f64(receivable);
    row.pending_hawala = format_f64(pending);
    row.trading_inventory_cost = "0".into();
    row.commission_income = format_f64(income);
    row.owner_invested = format_f64(invested);
    row.owner_withdrawn = format_f64(withdrawn);
    row.i_owe = format_f64(i_owe);
    row.people_owe_me = format_f64(people_owe_me);
    row.owner_capital = format_f64(owner);
    row.main_vault_cash = format_f64(cash);
    row.expected_main_vault = format_f64(expected);
    row.vault_difference = format_f64(difference);
    row.vault_status = status.to_string();

    total_cash += cash;
    total_customer += customer;
    total_customer_owes += customer_owes;
    total_pay += payable;
    total_recv += receivable;
    total_pending += pending;
    total_income += income;
    total_invested += invested;
    total_withdrawn += withdrawn;
    total_i_owe += i_owe;
    total_people_owe += people_owe_me;
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

  let profit_today = trading_profit_range(conn, &as_of, &as_of)?
    + hawala_own_commission_range(conn, &as_of, &as_of)?;
  let trading_month = trading_profit_range(conn, &month_start, &as_of)?;
  let hawala_comm_month = hawala_own_commission_range(conn, &month_start, &as_of)?;
  let exchange_count_month: i64 = conn.query_row(
    r#"SELECT COUNT(*) FROM "Transaction"
       WHERE deletedAt IS NULL AND type='EXCHANGE'
         AND valueDate >= ?1 AND valueDate < date(?2, '+1 day')"#,
    params![month_start, as_of],
    |row| row.get(0),
  )?;

  Ok(OwnerCapitalSnapshot {
    as_of,
    total_cash: format_f64(total_cash),
    total_customer_funds: format_f64(total_customer),
    total_customer_owes: format_f64(total_customer_owes),
    total_partner_payable: format_f64(total_pay),
    total_partner_receivable: format_f64(total_recv),
    total_pending_hawala: format_f64(total_pending),
    total_trading_inventory: "0".into(),
    total_commission_income: format_f64(total_income),
    total_owner_invested: format_f64(total_invested),
    total_owner_withdrawn: format_f64(total_withdrawn),
    total_i_owe: format_f64(total_i_owe),
    total_people_owe_me: format_f64(total_people_owe),
    total_owner_capital: format_f64(total_owner),
    profit_today: format_f64(profit_today),
    profit_month: format_f64(trading_month + hawala_comm_month),
    trading_profit_month: format_f64(trading_month),
    exchange_count_month,
    hawala_commission_month: format_f64(hawala_comm_month),
    by_currency: rows,
  })
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct OwnerCapitalSnapshotInput {
  pub as_of: Option<String>,
}

#[tauri::command]
pub fn get_owner_capital_snapshot(
  state: State<'_, AppState>,
  input: Option<OwnerCapitalSnapshotInput>,
) -> Result<OwnerCapitalSnapshot, AppError> {
  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "capital")?;
  let as_of = input
    .as_ref()
    .and_then(|i| i.as_of.as_deref())
    .map(str::trim)
    .filter(|s| !s.is_empty());
  compute_owner_capital_snapshot(&conn, as_of)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OwnerCapitalMoveInput {
  pub kind: String, // INVEST | WITHDRAW
  pub currency_code: String,
  pub amount: String,
  /// Optional — shop cash is always Main Vault.
  pub cash_wallet_id: Option<String>,
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
  let _ = input.created_by_id.trim();

  let conn = state.db.lock();
  let actor = require_screen(&state, &conn, "capital")?;
  let created_by = actor.id.clone();
  let cash_wallet_id = resolve_shop_cash_wallet_id(&conn, input.cash_wallet_id.as_deref())?;
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
  let amount_disp = crate::util::format_amount_commas(&amount_major);
  let suffix = reason
    .as_deref()
    .or(notes.as_deref())
    .map(str::trim)
    .filter(|s| !s.is_empty());
  let description = if kind == "INVEST" {
    match suffix {
      Some(s) if !s.eq_ignore_ascii_case("Owner Capital") => {
        format!("Cash in {amount_disp} {code} to Main Vault — Owner Capital — {s}")
      }
      _ => format!("Cash in {amount_disp} {code} to Main Vault — Owner Capital"),
    }
  } else {
    match suffix {
      Some(s)
        if !s.eq_ignore_ascii_case("Owner Withdrawal")
          && !s.eq_ignore_ascii_case("Owner Capital") =>
      {
        format!("Cash out {amount_disp} {code} from Main Vault — Owner Withdrawal — {s}")
      }
      _ => format!("Cash out {amount_disp} {code} from Main Vault — Owner Withdrawal"),
    }
  };

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
  let _actor = require_screen(&state, &conn, "capital")?;
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
