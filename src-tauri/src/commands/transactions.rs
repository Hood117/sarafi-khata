//! Paginated transaction list — SQL WHERE + LIMIT/OFFSET.

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::AppError;
use crate::state::AppState;
use crate::util::{format_amount_commas, format_f64};
use crate::commands::authorize::{require_auth, require_screen};

const DEFAULT_PAGE_SIZE: i64 = 25;
const MAX_PAGE_SIZE: i64 = 100;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListTransactionsInput {
  pub page: Option<i64>,
  pub page_size: Option<i64>,
  pub tx_type: Option<String>,
  pub search: Option<String>,
  pub customer_id: Option<String>,
  /// Inclusive start day YYYY-MM-DD (matches valueDate).
  pub date_from: Option<String>,
  /// Inclusive end day YYYY-MM-DD (matches valueDate).
  pub date_to: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionListItem {
  pub id: String,
  pub reference: String,
  pub display_ref: String,
  pub r#type: String,
  pub status: String,
  pub customer_name: Option<String>,
  pub description: Option<String>,
  pub value_date: String,
  pub created_at: String,
  /// Money lines for this transaction, e.g. "USD 100 · AFN 7,000".
  pub amount_summary: String,
  pub sender_name: Option<String>,
  pub receiver_name: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionListPage {
  pub items: Vec<TransactionListItem>,
  pub total: i64,
  pub page: i64,
  pub page_size: i64,
}

#[tauri::command]
pub fn list_transactions_page(
  state: State<'_, AppState>,
  input: ListTransactionsInput,
) -> Result<TransactionListPage, AppError> {
  let page_size = input
    .page_size
    .unwrap_or(DEFAULT_PAGE_SIZE)
    .clamp(1, MAX_PAGE_SIZE);
  let mut page = input.page.unwrap_or(1).max(1);

  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "transactions")?;
  let mut where_sql = String::from("WHERE t.deletedAt IS NULL");
  let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

  if let Some(ref t) = input.tx_type {
    let t = t.trim().to_ascii_uppercase();
    if !t.is_empty() && t != "ALL" {
      where_sql.push_str(" AND t.type = ?");
      params.push(Box::new(t));
    }
  }
  if let Some(ref cid) = input.customer_id {
    let cid = cid.trim();
    if !cid.is_empty() {
      where_sql.push_str(" AND t.customerId = ?");
      params.push(Box::new(cid.to_string()));
    }
  }
  if let Some(ref q) = input.search {
    let q = q.trim();
    if !q.is_empty() {
      where_sql.push_str(
        " AND (t.reference LIKE ? OR IFNULL(t.displayRef,'') LIKE ? OR IFNULL(t.description,'') LIKE ? OR IFNULL(c.fullName,'') LIKE ?)",
      );
      let like = format!("%{q}%");
      params.push(Box::new(like.clone()));
      params.push(Box::new(like.clone()));
      params.push(Box::new(like.clone()));
      params.push(Box::new(like));
    }
  }
  if let Some(ref from) = input.date_from {
    let from = from.trim();
    if from.len() >= 10 {
      let day = from[..10].to_string();
      where_sql.push_str(" AND t.valueDate >= ?");
      params.push(Box::new(day));
    }
  }
  if let Some(ref to) = input.date_to {
    let to = to.trim();
    if to.len() >= 10 {
      let day = to[..10].to_string();
      where_sql.push_str(" AND t.valueDate < date(?, '+1 day')");
      params.push(Box::new(day));
    }
  }

  let count_sql = format!(
    "SELECT COUNT(*) FROM \"Transaction\" t
     LEFT JOIN Customer c ON c.id = t.customerId
     {where_sql}"
  );
  let param_refs: Vec<&dyn rusqlite::types::ToSql> =
    params.iter().map(|p| p.as_ref()).collect();
  let total: i64 = conn.query_row(&count_sql, param_refs.as_slice(), |row| row.get(0))?;

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
    "SELECT t.id, t.reference, IFNULL(t.displayRef,''), t.type, t.status, c.fullName, t.description, t.valueDate, t.createdAt
     FROM \"Transaction\" t
     LEFT JOIN Customer c ON c.id = t.customerId
     {where_sql}
     ORDER BY {chrono}
     LIMIT ? OFFSET ?"
  );
  let mut list_params = params;
  list_params.push(Box::new(page_size));
  list_params.push(Box::new(offset));
  let list_refs: Vec<&dyn rusqlite::types::ToSql> =
    list_params.iter().map(|p| p.as_ref()).collect();

  let mut stmt = conn.prepare(&list_sql)?;
  let mut items = stmt
    .query_map(list_refs.as_slice(), |row| {
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

  Ok(TransactionListPage {
    items,
    total,
    page,
    page_size,
  })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListCustomerLedgerInput {
  pub customer_id: String,
  pub page: Option<i64>,
  pub page_size: Option<i64>,
  /// Inclusive start day YYYY-MM-DD (matches valueDate).
  pub date_from: Option<String>,
  /// Inclusive end day YYYY-MM-DD (matches valueDate).
  pub date_to: Option<String>,
  /// DEPOSIT | WITHDRAWAL | TRANSFER | HAWALA (or empty / ALL).
  pub tx_type: Option<String>,
  /// Currency code filter (e.g. AFN). Empty / ALL = all currencies.
  pub currency_code: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerLedgerRow {
  pub id: String,
  pub reference: String,
  pub display_ref: String,
  pub r#type: String,
  pub status: String,
  /// Same business text as Daily Journal (`Transaction.description` / daybook fallback).
  pub description: Option<String>,
  pub value_date: String,
  pub created_at: String,
  /// Human-readable activity (e.g. Money Added, Hawala).
  pub activity: String,
  /// Signed amount summary on the customer wallet, e.g. "+ USD 100 · − AFN 50".
  pub amount_summary: String,
  /// IN = customer balance up, OUT = down, MIXED = both, NONE = no wallet lines.
  pub flow: String,
  pub sender_name: Option<String>,
  pub receiver_name: Option<String>,
  /// Customer-wallet debit for this currency (empty when none).
  pub debit: String,
  /// Customer-wallet credit for this currency (empty when none).
  pub credit: String,
  pub currency_code: String,
  /// Running customer balance in this currency after this line.
  pub balance_after: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerLedgerPage {
  pub items: Vec<CustomerLedgerRow>,
  pub total: i64,
  pub page: i64,
  pub page_size: i64,
}

fn activity_label(tx_type: &str, reference: &str, description: Option<&str>) -> String {
  let ref_u = reference.to_ascii_uppercase();
  if ref_u.starts_with("OB-") || ref_u.starts_with("OPEN-WALLET") {
    return "Opening balance".into();
  }
  if ref_u.starts_with("MI-") || tx_type == "DEPOSIT" {
    return "Deposit".into();
  }
  if ref_u.starts_with("MO-") || tx_type == "WITHDRAWAL" {
    return "Withdraw".into();
  }
  match tx_type {
    "EXCHANGE" => "Exchange".into(),
    "HAWALA" => "Hawala".into(),
    "ADJUSTMENT" => description
      .map(|d| d.trim().to_string())
      .filter(|d| !d.is_empty())
      .unwrap_or_else(|| "Adjustment".into()),
    "TRANSFER" => "Transfer".into(),
    "TRADE_BUY" => "Trading purchase".into(),
    "TRADE_SELL" => "Trading sale".into(),
    "ACCOUNT_ORDER" => description
      .map(|d| d.trim().to_string())
      .filter(|d| !d.is_empty())
      .unwrap_or_else(|| "Account order".into()),
    other => other.to_string(),
  }
}

/// Match Daily Journal: prefer stored Transaction.description; never invent a second wording system.
fn ledger_history_description(
  tx_description: Option<&str>,
  tx_type: &str,
  reference: &str,
) -> String {
  let desc = tx_description.map(str::trim).unwrap_or("");
  if !desc.is_empty() {
    return desc.to_string();
  }
  let ref_u = reference.to_ascii_uppercase();
  if ref_u.starts_with("OB-") || ref_u.starts_with("OPEN-WALLET") {
    return "Opening customer balance".into();
  }
  match tx_type.to_ascii_uppercase().as_str() {
    "DEPOSIT" => "Customer deposited to his account".into(),
    "WITHDRAWAL" => "Customer withdrew from his account".into(),
    "TRANSFER" => "Customer transfer from his account".into(),
    "EXCHANGE" => "Currency exchange".into(),
    "HAWALA" => "Hawala".into(),
    "EXPENSE" => "Expense".into(),
    "ACCOUNT_ORDER" => "Account order".into(),
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

fn format_amount_display(raw: &str) -> String {
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

fn format_ledger_money(v: f64) -> String {
  if v.abs() < 1e-12 {
    return String::new();
  }
  format_amount_commas(&format_f64(v))
}

fn format_balance_display(v: f64) -> String {
  format_amount_commas(&format_f64(v))
}

#[tauri::command]
pub fn list_customer_ledger(
  state: State<'_, AppState>,
  input: ListCustomerLedgerInput,
) -> Result<CustomerLedgerPage, AppError> {
  let customer_id = input.customer_id.trim().to_string();
  if customer_id.is_empty() {
    return Err(AppError::Validation("Customer id is required.".into()));
  }
  let page_size = input
    .page_size
    .unwrap_or(DEFAULT_PAGE_SIZE)
    .clamp(1, MAX_PAGE_SIZE);
  let mut page = input.page.unwrap_or(1).max(1);

  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "transactions")?;
  let exists: bool = conn.query_row(
    "SELECT EXISTS(SELECT 1 FROM Customer WHERE id = ?1)",
    [&customer_id],
    |row| row.get(0),
  )?;
  if !exists {
    return Err(AppError::NotFound("Customer not found.".into()));
  }

  let mut date_from = input
    .date_from
    .as_deref()
    .map(str::trim)
    .filter(|s| s.len() >= 10)
    .map(|s| s[..10].to_string());
  let date_to = input
    .date_to
    .as_deref()
    .map(str::trim)
    .filter(|s| s.len() >= 10)
    .map(|s| s[..10].to_string());
  // Bound unbounded history so million-row ledgers stay responsive.
  if date_from.is_none() {
    let today = chrono::Local::now().date_naive();
    let from = today - chrono::Duration::days(400);
    date_from = Some(from.format("%Y-%m-%d").to_string());
  }
  let type_filter = input
    .tx_type
    .as_deref()
    .map(str::trim)
    .map(|s| s.to_ascii_uppercase())
    .filter(|s| !s.is_empty() && s != "ALL");
  let currency_filter = input
    .currency_code
    .as_deref()
    .map(str::trim)
    .map(|s| s.to_ascii_uppercase())
    .filter(|s| !s.is_empty() && s != "ALL");

  // Opening balance per currency immediately before the date range (index-friendly).
  let mut running: std::collections::BTreeMap<String, f64> = std::collections::BTreeMap::new();
  if let Some(ref from) = date_from {
    let mut open_stmt = conn.prepare(
      r#"SELECT c.code,
                COALESCE(SUM(CASE WHEN le.direction='DEBIT' THEN CAST(le.amount AS REAL)
                                  ELSE -CAST(le.amount AS REAL) END), 0)
         FROM Wallet w
         INNER JOIN LedgerEntry le ON le.walletId = w.id
         INNER JOIN "Transaction" t ON t.id = le.transactionId AND t.deletedAt IS NULL
         INNER JOIN Currency c ON c.id = le.currencyId AND c.deletedAt IS NULL
         WHERE w.customerId = ?1 AND w.type = 'CUSTOMER' AND w.deletedAt IS NULL
           AND t.valueDate < ?2
         GROUP BY c.code"#,
    )?;
    for row in open_stmt.query_map(rusqlite::params![customer_id, from], |row| {
      Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
    })? {
      let (code, bal) = row?;
      if bal.abs() >= 1e-12 {
        running.insert(code, bal);
      }
    }
  }

  // Customer-wallet lines in the date window (chrono ASC) — running balances for the page only.
  let mut all_sql = String::from(
    r#"SELECT t.id, t.reference, IFNULL(t.displayRef,''), t.type, t.status, t.description, t.valueDate, t.createdAt, c.code,
              COALESCE(SUM(CASE WHEN le.direction='DEBIT' THEN CAST(le.amount AS REAL) ELSE 0 END), 0),
              COALESCE(SUM(CASE WHEN le.direction='CREDIT' THEN CAST(le.amount AS REAL) ELSE 0 END), 0)
       FROM Wallet w
       INNER JOIN LedgerEntry le ON le.walletId = w.id
       INNER JOIN "Transaction" t ON t.id = le.transactionId AND t.deletedAt IS NULL
       INNER JOIN Currency c ON c.id = le.currencyId AND c.deletedAt IS NULL
       WHERE w.customerId = ?1 AND w.type = 'CUSTOMER' AND w.deletedAt IS NULL"#,
  );
  let mut all_params: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(customer_id.clone())];
  if let Some(ref from) = date_from {
    all_sql.push_str(" AND t.valueDate >= ?");
    all_params.push(Box::new(from.clone()));
  }
  if let Some(ref to) = date_to {
    // Inclusive end-of-day: valueDate < next day (works for date-only and datetime strings).
    all_sql.push_str(" AND t.valueDate < date(?, '+1 day')");
    all_params.push(Box::new(to.clone()));
  }
  if let Some(ref cf) = currency_filter {
    all_sql.push_str(" AND c.code = ?");
    all_params.push(Box::new(cf.clone()));
  }
  all_sql.push_str(&format!(
    " GROUP BY t.id, t.reference, t.displayRef, t.type, t.status, t.description, t.valueDate, t.createdAt, t.displaySeq, c.code
      ORDER BY {}, c.code ASC",
    crate::ledger::TX_CHRONO_ASC
  ));
  let all_refs: Vec<&dyn rusqlite::types::ToSql> =
    all_params.iter().map(|p| p.as_ref()).collect();
  let mut all_stmt = conn.prepare(&all_sql)?;

  struct RawLine {
    id: String,
    reference: String,
    display_ref: String,
    tx_type: String,
    status: String,
    description: Option<String>,
    value_date: String,
    created_at: String,
    currency_code: String,
    debit: f64,
    credit: f64,
    balance_after: f64,
  }

  // Stream chrono ASC; type/currency filters subset rows without reordering.
  let mut display: Vec<RawLine> = Vec::new();
  for row in all_stmt.query_map(all_refs.as_slice(), |row| {
    Ok((
      row.get::<_, String>(0)?,
      row.get::<_, String>(1)?,
      row.get::<_, String>(2)?,
      row.get::<_, String>(3)?,
      row.get::<_, String>(4)?,
      row.get::<_, Option<String>>(5)?,
      row.get::<_, String>(6)?,
      row.get::<_, String>(7)?,
      row.get::<_, String>(8)?,
      row.get::<_, f64>(9)?,
      row.get::<_, f64>(10)?,
    ))
  })? {
    let (
      id,
      reference,
      display_ref,
      tx_type,
      status,
      description,
      value_date,
      created_at,
      code,
      debit,
      credit,
    ) = row?;
    let entry = running.entry(code.clone()).or_insert(0.0);
    *entry += debit - credit;
    let type_ok = type_filter
      .as_ref()
      .map(|tf| tx_type.eq_ignore_ascii_case(tf))
      .unwrap_or(true);
    if !type_ok {
      continue;
    }
    display.push(RawLine {
      id,
      reference,
      display_ref,
      tx_type,
      status,
      description,
      value_date,
      created_at,
      currency_code: code,
      debit,
      credit,
      balance_after: *entry,
    });
  }

  // Account Order cash payouts set Transaction.customerId to the recipient but do
  // not post to their CUSTOMER wallet (cash leaves Main Vault). Include those so
  // the daybook description also appears on the recipient's history — without
  // changing their running balance.
  let mut linked_sql = String::from(
    r#"SELECT t.id, t.reference, IFNULL(t.displayRef,''), t.type, t.status, t.description,
              t.valueDate, t.createdAt, c.code,
              COALESCE(SUM(
                CASE WHEN le.direction = 'CREDIT' AND w.name = 'Account Order Clearing'
                     THEN CAST(le.amount AS REAL) ELSE 0 END
              ), 0)
       FROM "Transaction" t
       INNER JOIN LedgerEntry le ON le.transactionId = t.id
       INNER JOIN Wallet w ON w.id = le.walletId
       INNER JOIN Currency c ON c.id = le.currencyId AND c.deletedAt IS NULL
       WHERE t.deletedAt IS NULL
         AND t.customerId = ?1
         AND UPPER(t.type) = 'ACCOUNT_ORDER'
         AND NOT EXISTS (
           SELECT 1
           FROM LedgerEntry le2
           INNER JOIN Wallet w2 ON w2.id = le2.walletId
           WHERE le2.transactionId = t.id
             AND w2.customerId = ?1
             AND w2.type = 'CUSTOMER'
             AND w2.deletedAt IS NULL
         )"#,
  );
  let mut linked_params: Vec<Box<dyn rusqlite::types::ToSql>> =
    vec![Box::new(customer_id.clone())];
  if let Some(ref from) = date_from {
    linked_sql.push_str(" AND t.valueDate >= ?");
    linked_params.push(Box::new(from.clone()));
  }
  if let Some(ref to) = date_to {
    linked_sql.push_str(" AND t.valueDate < date(?, '+1 day')");
    linked_params.push(Box::new(to.clone()));
  }
  if let Some(ref cf) = currency_filter {
    linked_sql.push_str(" AND c.code = ?");
    linked_params.push(Box::new(cf.clone()));
  }
  linked_sql.push_str(
    " GROUP BY t.id, t.reference, t.displayRef, t.type, t.status, t.description,
              t.valueDate, t.createdAt, t.displaySeq, c.code",
  );
  let linked_refs: Vec<&dyn rusqlite::types::ToSql> =
    linked_params.iter().map(|p| p.as_ref()).collect();
  let mut linked_stmt = conn.prepare(&linked_sql)?;
  for row in linked_stmt.query_map(linked_refs.as_slice(), |row| {
    Ok((
      row.get::<_, String>(0)?,
      row.get::<_, String>(1)?,
      row.get::<_, String>(2)?,
      row.get::<_, String>(3)?,
      row.get::<_, String>(4)?,
      row.get::<_, Option<String>>(5)?,
      row.get::<_, String>(6)?,
      row.get::<_, String>(7)?,
      row.get::<_, String>(8)?,
      row.get::<_, f64>(9)?,
    ))
  })? {
    let (
      id,
      reference,
      display_ref,
      tx_type,
      status,
      description,
      value_date,
      created_at,
      code,
      payout_amount,
    ) = row?;
    let type_ok = type_filter
      .as_ref()
      .map(|tf| tx_type.eq_ignore_ascii_case(tf))
      .unwrap_or(true);
    if !type_ok {
      continue;
    }
    if display.iter().any(|l| l.id == id && l.currency_code == code) {
      continue;
    }
    let balance_after = running.get(&code).copied().unwrap_or(0.0);
    display.push(RawLine {
      id,
      reference,
      display_ref,
      tx_type,
      status,
      description,
      value_date,
      created_at,
      currency_code: code,
      debit: 0.0,
      credit: payout_amount,
      balance_after,
    });
  }
  display.sort_by(|a, b| {
    (
      a.value_date.as_str(),
      a.created_at.as_str(),
      a.id.as_str(),
      a.currency_code.as_str(),
    )
      .cmp(&(
        b.value_date.as_str(),
        b.created_at.as_str(),
        b.id.as_str(),
        b.currency_code.as_str(),
      ))
  });

  let total = display.len() as i64;
  let total_pages = if total == 0 {
    1
  } else {
    (total + page_size - 1) / page_size
  };
  if page > total_pages {
    page = total_pages;
  }
  let offset = ((page - 1) * page_size) as usize;
  let page_items: Vec<RawLine> = display
    .into_iter()
    .skip(offset)
    .take(page_size as usize)
    .collect();

  let transfer_ids: Vec<String> = page_items
    .iter()
    .filter(|l| l.tx_type.eq_ignore_ascii_case("TRANSFER"))
    .map(|l| l.id.clone())
    .collect::<std::collections::BTreeSet<_>>()
    .into_iter()
    .collect();
  let transfer_parties = if transfer_ids.is_empty() {
    std::collections::HashMap::new()
  } else {
    let descs: std::collections::HashMap<String, Option<String>> = page_items
      .iter()
      .filter(|l| l.tx_type.eq_ignore_ascii_case("TRANSFER"))
      .map(|l| (l.id.clone(), l.description.clone()))
      .collect();
    crate::ledger::fill_transfer_parties(&conn, &transfer_ids, &descs)?
  };

  let mut items = Vec::with_capacity(page_items.len());
  for line in page_items {
    let display_desc =
      ledger_history_description(line.description.as_deref(), &line.tx_type, &line.reference);
    let has_in = line.debit > 1e-12;
    let has_out = line.credit > 1e-12;
    let flow = match (has_in, has_out) {
      (true, true) => "MIXED",
      (true, false) => "IN",
      (false, true) => "OUT",
      (false, false) => "NONE",
    }
    .to_string();
    let amount_summary = match (has_in, has_out) {
      (true, false) => format!(
        "+ {} {}",
        line.currency_code,
        format_amount_display(&format_f64(line.debit))
      ),
      (false, true) => format!(
        "− {} {}",
        line.currency_code,
        format_amount_display(&format_f64(line.credit))
      ),
      (true, true) => format!(
        "+ {c} {d} · − {c} {cr}",
        c = line.currency_code,
        d = format_amount_display(&format_f64(line.debit)),
        cr = format_amount_display(&format_f64(line.credit)),
      ),
      (false, false) => "—".into(),
    };
    let mut activity = activity_label(&line.tx_type, &line.reference, Some(&display_desc));
    if line.tx_type == "TRANSFER" {
      activity = match (has_in, has_out) {
        (true, false) => "Transfer received".into(),
        (false, true) => "Transfer sent".into(),
        _ => "Transfer".into(),
      };
    }
    let (sender_name, receiver_name) = transfer_parties
      .get(&line.id)
      .map(|p| (p.sender_name.clone(), p.receiver_name.clone()))
      .unwrap_or((None, None));

    items.push(CustomerLedgerRow {
      activity,
      id: line.id,
      reference: line.reference,
      display_ref: line.display_ref,
      r#type: line.tx_type,
      status: line.status,
      description: Some(display_desc),
      value_date: line.value_date,
      created_at: line.created_at,
      amount_summary,
      flow,
      sender_name,
      receiver_name,
      debit: format_ledger_money(line.debit),
      credit: format_ledger_money(line.credit),
      currency_code: line.currency_code.clone(),
      balance_after: format_balance_display(line.balance_after),
    });
  }

  Ok(CustomerLedgerPage {
    items,
    total,
    page,
    page_size,
  })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetTransactionInput {
  pub id: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TransactionLedgerLine {
  pub id: String,
  pub wallet_name: String,
  pub wallet_type: String,
  pub currency_code: String,
  pub currency_symbol: Option<String>,
  pub direction: String,
  pub amount: String,
  pub memo: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionDetail {
  pub id: String,
  pub reference: String,
  pub display_ref: String,
  pub r#type: String,
  pub status: String,
  pub customer_id: Option<String>,
  pub customer_name: Option<String>,
  pub walk_in_name: Option<String>,
  pub walk_in_phone: Option<String>,
  pub description: Option<String>,
  pub value_date: String,
  pub posted_at: Option<String>,
  pub created_at: String,
  pub activity: String,
  pub lines: Vec<TransactionLedgerLine>,
  pub sender_name: Option<String>,
  pub receiver_name: Option<String>,
}

#[tauri::command]
pub fn get_transaction_detail(
  state: State<'_, AppState>,
  input: GetTransactionInput,
) -> Result<TransactionDetail, AppError> {
  let id = input.id.trim().to_string();
  if id.is_empty() {
    return Err(AppError::Validation("Transaction id is required.".into()));
  }
  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "transactions")?;

  let row = conn
    .query_row(
      r#"SELECT t.id, t.reference, IFNULL(t.displayRef,''), t.type, t.status, t.customerId, c.fullName,
                t.walkInName, t.walkInPhone, t.description, t.valueDate,
                t.postedAt, t.createdAt
         FROM "Transaction" t
         LEFT JOIN Customer c ON c.id = t.customerId
         WHERE t.id = ?1 AND t.deletedAt IS NULL"#,
      [&id],
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
          row.get::<_, Option<String>>(8)?,
          row.get::<_, Option<String>>(9)?,
          row.get::<_, String>(10)?,
          row.get::<_, Option<String>>(11)?,
          row.get::<_, String>(12)?,
        ))
      },
    )
    .map_err(|_| AppError::NotFound("Transaction not found.".into()))?;

  let (
    id,
    reference,
    display_ref,
    tx_type,
    status,
    customer_id,
    customer_name,
    walk_in_name,
    walk_in_phone,
    description,
    value_date,
    posted_at,
    created_at,
  ) = row;

  let mut stmt = conn.prepare(
    r#"SELECT le.id, w.name, w.type, cur.code, cur.symbol, le.direction,
              CAST(le.amount AS TEXT), le.memo
       FROM LedgerEntry le
       INNER JOIN Wallet w ON w.id = le.walletId
       INNER JOIN Currency cur ON cur.id = le.currencyId
       WHERE le.transactionId = ?1
       ORDER BY le.createdAt, w.name"#,
  )?;
  let lines = stmt
    .query_map([&id], |line| {
      let amount_raw: String = line.get(6)?;
      Ok(TransactionLedgerLine {
        id: line.get(0)?,
        wallet_name: line.get(1)?,
        wallet_type: line.get(2)?,
        currency_code: line.get(3)?,
        currency_symbol: line.get(4)?,
        direction: line.get(5)?,
        amount: format_amount_display(&amount_raw),
        memo: line.get(7)?,
      })
    })?
    .collect::<Result<Vec<_>, _>>()?;

  let lines: Vec<TransactionLedgerLine> = {
    let clean: Vec<_> = lines
      .into_iter()
      .filter(|l| crate::ledger::is_displayable_wallet(&l.wallet_type, &l.wallet_name))
      .collect();
    let customer: Vec<_> = clean
      .iter()
      .filter(|l| l.wallet_type.eq_ignore_ascii_case("CUSTOMER"))
      .cloned()
      .collect();
    if !customer.is_empty() {
      customer
    } else {
      let cash: Vec<_> = clean
        .iter()
        .filter(|l| {
          l.wallet_type.eq_ignore_ascii_case("VAULT")
            || l.wallet_type.eq_ignore_ascii_case("TILL")
        })
        .cloned()
        .collect();
      if !cash.is_empty() {
        cash
      } else {
        clean
      }
    }
  };

  let (sender_name, receiver_name) = if tx_type.eq_ignore_ascii_case("TRANSFER") {
    let descs = std::collections::HashMap::from([(id.clone(), description.clone())]);
    let parties = crate::ledger::fill_transfer_parties(&conn, &[id.clone()], &descs)?;
    parties
      .get(&id)
      .map(|p| (p.sender_name.clone(), p.receiver_name.clone()))
      .unwrap_or((None, None))
  } else {
    (None, None)
  };

  Ok(TransactionDetail {
    activity: activity_label(&tx_type, &reference, description.as_deref()),
    id,
    reference,
    display_ref,
    r#type: tx_type,
    status,
    customer_id,
    customer_name,
    walk_in_name,
    walk_in_phone,
    description,
    value_date,
    posted_at,
    created_at,
    lines,
    sender_name,
    receiver_name,
  })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewDisplayRefInput {
  pub tx_type: String,
}

/// Next user-facing voucher (DEP-0154) without allocating it. Forms show this
/// instead of the internal timestamp reference (DEP-1788…).
#[tauri::command]
pub fn preview_display_ref(
  state: State<'_, AppState>,
  input: PreviewDisplayRefInput,
) -> Result<String, AppError> {
  let tx_type = input.tx_type.trim().to_ascii_uppercase();
  if tx_type.is_empty() {
    return Err(AppError::Validation("txType is required.".into()));
  }
  let conn = state.db.lock();
  let _actor = require_auth(&state, &conn)?;
  crate::ledger::ensure_display_seq_schema(&conn)?;
  let seq = crate::ledger::peek_display_seq(&conn)?;
  Ok(crate::ledger::format_display_ref(seq, &tx_type, ""))
}
