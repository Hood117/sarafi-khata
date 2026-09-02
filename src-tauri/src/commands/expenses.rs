//! Business expenses — rent, salary, utilities, etc. Posted via double-entry to SYSTEM wallets.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::AppError;
use crate::ledger::{
  find_currency_by_code, money_from_major_units, money_to_major_unit_string, post_transaction,
  resolve_shop_cash_wallet_id, PostTransactionInput, PostingLineDto,
};
use crate::state::AppState;
use crate::util::{format_f64, now_sqlite};
use crate::commands::authorize::{require_screen};

/// Stable category ids → SYSTEM wallet display names (matched by daybook expense_totals).
const CATEGORIES: &[(&str, &str)] = &[
  ("RENT", "Rent"),
  ("SALARY", "Salary"),
  ("UTILITIES", "Utilities"),
  ("TRANSPORT", "Transport"),
  ("OFFICE", "Office"),
  ("OTHER", "Expense"),
];

fn trim_opt(v: Option<String>) -> Option<String> {
  v.map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

fn category_wallet_name(category: &str) -> Result<&'static str, AppError> {
  let key = category.trim().to_ascii_uppercase();
  CATEGORIES
    .iter()
    .find(|(id, _)| *id == key)
    .map(|(_, name)| *name)
    .ok_or_else(|| {
      AppError::Validation(
        "Category must be RENT, SALARY, UTILITIES, TRANSPORT, OFFICE, or OTHER.".into(),
      )
    })
}

fn ensure_expense_wallet(conn: &Connection, name: &str) -> Result<String, AppError> {
  let existing: Option<String> = conn
    .query_row(
      "SELECT id FROM Wallet
       WHERE name = ?1 AND type = 'SYSTEM' AND deletedAt IS NULL
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

fn expense_wallet_filter_sql() -> &'static str {
  r#"(
    LOWER(w.name) LIKE '%expense%'
    OR LOWER(w.name) LIKE '%rent%'
    OR LOWER(w.name) LIKE '%salary%'
    OR LOWER(w.name) LIKE '%utility%'
    OR LOWER(w.name) LIKE '%transport%'
    OR LOWER(w.name) LIKE '%office%'
  )"#
}

fn categorize_wallet_name(name: &str) -> &'static str {
  let n = name.to_ascii_lowercase();
  if n.contains("rent") {
    "RENT"
  } else if n.contains("salary") || n.contains("wage") {
    "SALARY"
  } else if n.contains("utility") {
    "UTILITIES"
  } else if n.contains("transport") {
    "TRANSPORT"
  } else if n.contains("office") {
    "OFFICE"
  } else {
    "OTHER"
  }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpenseCategoryOption {
  pub id: String,
  pub label: String,
}

#[tauri::command]
pub fn list_expense_categories(state: State<'_, AppState>) -> Result<Vec<ExpenseCategoryOption>, AppError> {
  {
    let conn = state.db.lock();
    let _actor = require_screen(&state, &conn, "expenses")?;
  }
  Ok(
    CATEGORIES
      .iter()
      .map(|(id, label)| ExpenseCategoryOption {
        id: (*id).into(),
        label: (*label).into(),
      })
      .collect(),
  )
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PostExpenseInput {
  pub category: String,
  pub currency_code: String,
  pub amount: String,
  /// Optional — shop cash is always Main Vault.
  pub cash_wallet_id: Option<String>,
  pub notes: Option<String>,
  pub value_date: Option<String>,
  pub created_by_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PostExpenseResult {
  pub transaction_id: String,
  pub reference: String,
  pub display_ref: String,
  pub category: String,
  pub amount: String,
  pub currency_code: String,
}

#[tauri::command]
pub fn post_expense(
  state: State<'_, AppState>,
  input: PostExpenseInput,
) -> Result<PostExpenseResult, AppError> {
  let _ = input.created_by_id.trim();
  let wallet_name = category_wallet_name(&input.category)?;
  let category_id = input.category.trim().to_ascii_uppercase();

  let conn = state.db.lock();
  let actor = require_screen(&state, &conn, "expenses")?;
  let created_by = actor.id.clone();
  let cash_wallet_id = resolve_shop_cash_wallet_id(&conn, input.cash_wallet_id.as_deref())?;
  let expense_wallet_id = ensure_expense_wallet(&conn, wallet_name)?;
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
  let reference = format!("EXP-{}-{}", category_id, chrono::Utc::now().timestamp_millis());
  let description = notes
    .clone()
    .unwrap_or_else(|| format!("Expense — {wallet_name}"));

  // Cash out (CREDIT) + expense in (DEBIT).
  let posted = post_transaction(
    &conn,
    PostTransactionInput {
      reference: reference.clone(),
      r#type: "EXPENSE".into(),
      value_date,
      customer_id: None,
      walk_in_name: None,
      walk_in_phone: None,
      description: Some(description),
      created_by_id: Some(created_by),
      entries: vec![
        PostingLineDto {
          wallet_id: cash_wallet_id,
          currency: code.clone(),
          direction: "CREDIT".into(),
          amount_minor: minor.to_string(),
          exchange_rate_id: None,
          memo: Some(format!("Expense paid — {wallet_name}")),
        },
        PostingLineDto {
          wallet_id: expense_wallet_id,
          currency: code.clone(),
          direction: "DEBIT".into(),
          amount_minor: minor.to_string(),
          exchange_rate_id: None,
          memo: Some(format!("Expense — {wallet_name}")),
        },
      ],
    },
  )?;

  Ok(PostExpenseResult {
    transaction_id: posted.id,
    reference: posted.reference,
    display_ref: posted.display_ref,
    category: category_id,
    amount: amount_major,
    currency_code: code,
  })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListExpensesInput {
  pub page: Option<i64>,
  pub page_size: Option<i64>,
  pub category: Option<String>,
  pub currency_code: Option<String>,
  pub date_from: Option<String>,
  pub date_to: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpenseRow {
  pub transaction_id: String,
  pub reference: String,
  pub display_ref: String,
  pub category: String,
  pub category_label: String,
  pub amount: String,
  pub currency_code: String,
  pub currency_name: String,
  pub currency_symbol: Option<String>,
  pub notes: Option<String>,
  pub value_date: String,
  pub created_by_name: Option<String>,
  pub cash_wallet_name: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpensePage {
  pub items: Vec<ExpenseRow>,
  pub total: i64,
  pub page: i64,
  pub page_size: i64,
}

#[tauri::command]
pub fn list_expenses(
  state: State<'_, AppState>,
  input: ListExpensesInput,
) -> Result<ExpensePage, AppError> {
  let page = input.page.unwrap_or(1).max(1);
  let page_size = input.page_size.unwrap_or(25).clamp(1, 100);
  let offset = (page - 1) * page_size;
  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "expenses")?;

  let mut where_parts: Vec<String> = vec![
    "t.deletedAt IS NULL".into(),
    "t.type = 'EXPENSE'".into(),
    "w.type = 'SYSTEM'".into(),
    "le.direction = 'DEBIT'".into(),
    expense_wallet_filter_sql().into(),
  ];
  let mut params_dyn: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

  if let Some(cat) = input.category.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
    let wallet = category_wallet_name(cat)?;
    where_parts.push("w.name = ?".into());
    params_dyn.push(Box::new(wallet.to_string()));
  }
  if let Some(code) = input
    .currency_code
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
  {
    where_parts.push("c.code = ?".into());
    params_dyn.push(Box::new(code.to_ascii_uppercase()));
  }
  if let Some(from) = input
    .date_from
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
  {
    where_parts.push("t.valueDate >= ?".into());
    params_dyn.push(Box::new(from.to_string()));
  }
  if let Some(to) = input
    .date_to
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
  {
    where_parts.push("t.valueDate < date(?, '+1 day')".into());
    params_dyn.push(Box::new(to.to_string()));
  }

  let where_sql = format!("WHERE {}", where_parts.join(" AND "));
  let count_sql = format!(
    r#"SELECT COUNT(*)
       FROM "Transaction" t
       INNER JOIN LedgerEntry le ON le.transactionId = t.id
       INNER JOIN Wallet w ON w.id = le.walletId
       INNER JOIN Currency c ON c.id = le.currencyId
       {where_sql}"#
  );
  let param_refs: Vec<&dyn rusqlite::types::ToSql> = params_dyn.iter().map(|p| p.as_ref()).collect();
  let total: i64 = conn.query_row(&count_sql, param_refs.as_slice(), |row| row.get(0))?;

  let list_sql = format!(
    r#"SELECT t.id, t.reference, IFNULL(t.displayRef,''), w.name, CAST(le.amount AS TEXT), c.code, c.name, c.symbol,
              t.description, t.valueDate, u.fullName,
              (
                SELECT cw.name FROM LedgerEntry cle
                INNER JOIN Wallet cw ON cw.id = cle.walletId
                WHERE cle.transactionId = t.id AND cle.direction = 'CREDIT'
                  AND cw.type IN ('VAULT','TILL')
                LIMIT 1
              )
       FROM "Transaction" t
       INNER JOIN LedgerEntry le ON le.transactionId = t.id
       INNER JOIN Wallet w ON w.id = le.walletId
       INNER JOIN Currency c ON c.id = le.currencyId
       LEFT JOIN User u ON u.id = t.createdById
       {where_sql}
       ORDER BY t.valueDate DESC, t.createdAt DESC
       LIMIT ? OFFSET ?"#,
  );
  let mut list_params: Vec<Box<dyn rusqlite::types::ToSql>> = params_dyn;
  list_params.push(Box::new(page_size));
  list_params.push(Box::new(offset));
  let list_refs: Vec<&dyn rusqlite::types::ToSql> =
    list_params.iter().map(|p| p.as_ref()).collect();

  let mut stmt = conn.prepare(&list_sql)?;
  let items = stmt
    .query_map(list_refs.as_slice(), |row| {
      let wallet_name: String = row.get(3)?;
      let cat = categorize_wallet_name(&wallet_name);
      let label = CATEGORIES
        .iter()
        .find(|(id, _)| *id == cat)
        .map(|(_, l)| (*l).to_string())
        .unwrap_or_else(|| wallet_name.clone());
      Ok(ExpenseRow {
        transaction_id: row.get(0)?,
        reference: row.get(1)?,
        display_ref: row.get(2)?,
        category: cat.into(),
        category_label: label,
        amount: row.get(4)?,
        currency_code: row.get(5)?,
        currency_name: row.get(6)?,
        currency_symbol: row.get(7)?,
        notes: row.get(8)?,
        value_date: row.get(9)?,
        created_by_name: row.get(10)?,
        cash_wallet_name: row.get(11)?,
      })
    })?
    .collect::<Result<Vec<_>, _>>()?;

  Ok(ExpensePage {
    items,
    total,
    page,
    page_size,
  })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpenseSummaryInput {
  pub date_from: Option<String>,
  pub date_to: Option<String>,
  pub currency_code: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpenseCategoryTotal {
  pub category: String,
  pub label: String,
  pub amount: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpenseSummary {
  pub rent: String,
  pub salary: String,
  pub utilities: String,
  pub transport: String,
  pub office: String,
  pub other: String,
  pub total: String,
  pub by_category: Vec<ExpenseCategoryTotal>,
}

#[tauri::command]
pub fn get_expense_summary(
  state: State<'_, AppState>,
  input: ExpenseSummaryInput,
) -> Result<ExpenseSummary, AppError> {
  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "expenses")?;
  let mut where_parts: Vec<String> = vec![
    "t.deletedAt IS NULL".into(),
    "w.type = 'SYSTEM'".into(),
    expense_wallet_filter_sql().into(),
  ];
  let mut params_dyn: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

  // Prefer typed EXPENSE rows; also include legacy adjustments that hit expense wallets.
  where_parts.push("(t.type = 'EXPENSE' OR t.type = 'ADJUSTMENT')".into());

  if let Some(from) = input
    .date_from
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
  {
    where_parts.push("t.valueDate >= ?".into());
    params_dyn.push(Box::new(from.to_string()));
  }
  if let Some(to) = input
    .date_to
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
  {
    where_parts.push("t.valueDate < date(?, '+1 day')".into());
    params_dyn.push(Box::new(to.to_string()));
  }
  if let Some(code) = input
    .currency_code
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
  {
    where_parts.push("c.code = ?".into());
    params_dyn.push(Box::new(code.to_ascii_uppercase()));
  }

  let where_sql = format!("WHERE {}", where_parts.join(" AND "));
  let sql = format!(
    r#"SELECT LOWER(w.name),
              COALESCE(SUM(CAST(le.amount AS REAL)), 0)
       FROM Wallet w
       INNER JOIN LedgerEntry le ON le.walletId = w.id AND le.direction = 'DEBIT'
       INNER JOIN "Transaction" t ON t.id = le.transactionId
       INNER JOIN Currency c ON c.id = le.currencyId
       {where_sql}
       GROUP BY LOWER(w.name)"#
  );
  let param_refs: Vec<&dyn rusqlite::types::ToSql> = params_dyn.iter().map(|p| p.as_ref()).collect();
  let mut stmt = conn.prepare(&sql)?;
  let mut rent = 0.0;
  let mut salary = 0.0;
  let mut utilities = 0.0;
  let mut transport = 0.0;
  let mut office = 0.0;
  let mut other = 0.0;
  for row in stmt.query_map(param_refs.as_slice(), |row| {
    Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
  })? {
    let (name, amt) = row?;
    let amt = amt.abs();
    match categorize_wallet_name(&name) {
      "RENT" => rent += amt,
      "SALARY" => salary += amt,
      "UTILITIES" => utilities += amt,
      "TRANSPORT" => transport += amt,
      "OFFICE" => office += amt,
      _ => other += amt,
    }
  }
  let total = rent + salary + utilities + transport + office + other;
  let by_category = vec![
    ("RENT", "Rent", rent),
    ("SALARY", "Salary", salary),
    ("UTILITIES", "Utilities", utilities),
    ("TRANSPORT", "Transport", transport),
    ("OFFICE", "Office", office),
    ("OTHER", "Expense", other),
  ]
  .into_iter()
  .map(|(category, label, amount)| ExpenseCategoryTotal {
    category: category.into(),
    label: label.into(),
    amount: format_f64(amount),
  })
  .collect();

  Ok(ExpenseSummary {
    rent: format_f64(rent),
    salary: format_f64(salary),
    utilities: format_f64(utilities),
    transport: format_f64(transport),
    office: format_f64(office),
    other: format_f64(other),
    total: format_f64(total),
    by_category,
  })
}
