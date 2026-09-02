//! Employees — master list + dynamic salary payments (ledger via Salary SYSTEM wallet).

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
use crate::commands::authorize::{require_admin, require_screen};

const SALARY_WALLET: &str = "Salary";

fn trim_opt(v: Option<String>) -> Option<String> {
  v.map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

fn ensure_salary_wallet(conn: &Connection) -> Result<String, AppError> {
  let existing: Option<String> = conn
    .query_row(
      "SELECT id FROM Wallet
       WHERE name = ?1 AND type = 'SYSTEM' AND deletedAt IS NULL
       LIMIT 1",
      [SALARY_WALLET],
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
    params![id, SALARY_WALLET, now],
  )?;
  Ok(id)
}

fn assert_cash_wallet(conn: &Connection, id: Option<&str>) -> Result<String, AppError> {
  resolve_shop_cash_wallet_id(conn, id)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmployeeRow {
  pub id: String,
  pub full_name: String,
  pub father_name: Option<String>,
  pub national_id: Option<String>,
  pub id_number: Option<String>,
  pub date_of_birth: Option<String>,
  pub address: Option<String>,
  pub phone: Option<String>,
  pub title: Option<String>,
  pub notes: Option<String>,
  pub start_date: Option<String>,
  pub monthly_salary: Option<String>,
  pub salary_currency_code: Option<String>,
  pub is_active: bool,
  pub created_at: String,
  pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListEmployeesInput {
  pub search: Option<String>,
  pub active_only: Option<bool>,
  pub page: Option<i64>,
  pub page_size: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmployeeListPage {
  pub items: Vec<EmployeeRow>,
  pub total: i64,
  pub page: i64,
  pub page_size: i64,
}

#[tauri::command]
pub fn list_employees(
  state: State<'_, AppState>,
  input: ListEmployeesInput,
) -> Result<EmployeeListPage, AppError> {
  let page = input.page.unwrap_or(1).max(1);
  let page_size = input.page_size.unwrap_or(50).clamp(1, 200);
  let offset = (page - 1) * page_size;
  let active_only = input.active_only.unwrap_or(true);
  let search = trim_opt(input.search).map(|s| s.to_lowercase());

  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "employees")?;
  let table_ok: bool = conn
    .query_row(
      "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='Employee')",
      [],
      |row| row.get(0),
    )
    .unwrap_or(false);
  if !table_ok {
    return Ok(EmployeeListPage {
      items: Vec::new(),
      total: 0,
      page,
      page_size,
    });
  }
  let mut where_parts = vec!["deletedAt IS NULL".to_string()];
  let mut params_dyn: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

  if active_only {
    where_parts.push("isActive = 1".into());
  }
  if let Some(ref q) = search {
    where_parts.push(
      "(LOWER(fullName) LIKE ? OR LOWER(COALESCE(phone,'')) LIKE ? OR LOWER(COALESCE(title,'')) LIKE ? OR LOWER(COALESCE(fatherName,'')) LIKE ? OR LOWER(COALESCE(nationalId,'')) LIKE ? OR LOWER(COALESCE(idNumber,'')) LIKE ?)"
        .into(),
    );
    let like = format!("%{q}%");
    params_dyn.push(Box::new(like.clone()));
    params_dyn.push(Box::new(like.clone()));
    params_dyn.push(Box::new(like.clone()));
    params_dyn.push(Box::new(like.clone()));
    params_dyn.push(Box::new(like.clone()));
    params_dyn.push(Box::new(like));
  }

  let where_sql = format!("WHERE {}", where_parts.join(" AND "));
  let count_sql = format!("SELECT COUNT(*) FROM Employee {where_sql}");
  let total: i64 = {
    let mut stmt = conn.prepare(&count_sql)?;
    let refs: Vec<&dyn rusqlite::types::ToSql> = params_dyn.iter().map(|p| p.as_ref()).collect();
    stmt.query_row(refs.as_slice(), |row| row.get(0))?
  };

  let list_sql = format!(
    r#"SELECT id, fullName, fatherName, nationalId, idNumber, dateOfBirth, address,
              phone, title, notes, startDate, monthlySalary, salaryCurrencyCode,
              isActive, createdAt, updatedAt
       FROM Employee {where_sql}
       ORDER BY fullName COLLATE NOCASE
       LIMIT ? OFFSET ?"#,
  );
  params_dyn.push(Box::new(page_size));
  params_dyn.push(Box::new(offset));
  let mut stmt = conn.prepare(&list_sql)?;
  let refs: Vec<&dyn rusqlite::types::ToSql> = params_dyn.iter().map(|p| p.as_ref()).collect();
  let items = stmt
    .query_map(refs.as_slice(), |row| map_employee_row(row))?
    .collect::<Result<Vec<_>, _>>()?;

  Ok(EmployeeListPage {
    items,
    total,
    page,
    page_size,
  })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertEmployeeInput {
  pub id: Option<String>,
  pub full_name: String,
  pub father_name: Option<String>,
  pub national_id: Option<String>,
  pub id_number: Option<String>,
  pub date_of_birth: Option<String>,
  pub address: Option<String>,
  pub phone: Option<String>,
  pub title: Option<String>,
  pub notes: Option<String>,
  pub start_date: Option<String>,
  pub monthly_salary: Option<String>,
  pub salary_currency_code: Option<String>,
  pub is_active: Option<bool>,
}

fn map_employee_row(row: &rusqlite::Row<'_>) -> Result<EmployeeRow, rusqlite::Error> {
  Ok(EmployeeRow {
    id: row.get(0)?,
    full_name: row.get(1)?,
    father_name: row.get(2)?,
    national_id: row.get(3)?,
    id_number: row.get(4)?,
    date_of_birth: row.get(5)?,
    address: row.get(6)?,
    phone: row.get(7)?,
    title: row.get(8)?,
    notes: row.get(9)?,
    start_date: row.get(10)?,
    monthly_salary: row.get(11)?,
    salary_currency_code: row.get(12)?,
    is_active: row.get::<_, i64>(13)? == 1,
    created_at: row.get(14)?,
    updated_at: row.get(15)?,
  })
}

#[tauri::command]
pub fn upsert_employee(
  state: State<'_, AppState>,
  input: UpsertEmployeeInput,
) -> Result<EmployeeRow, AppError> {
  let full_name = input.full_name.trim().to_string();
  if full_name.is_empty() {
    return Err(AppError::Validation("Employee name is required.".into()));
  }
  let father_name = trim_opt(input.father_name);
  let national_id = trim_opt(input.national_id);
  let id_number = trim_opt(input.id_number);
  let date_of_birth = trim_opt(input.date_of_birth);
  let address = trim_opt(input.address);
  let phone = trim_opt(input.phone);
  let title = trim_opt(input.title);
  let notes = trim_opt(input.notes);
  let start_date = trim_opt(input.start_date);
  let monthly_salary = trim_opt(input.monthly_salary);
  let salary_currency_code = trim_opt(input.salary_currency_code).map(|c| c.to_uppercase());
  let is_active = if input.is_active.unwrap_or(true) { 1 } else { 0 };
  let now = now_sqlite();
  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "employees")?;

  if let Some(id) = input.id.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
    let updated = conn.execute(
      r#"UPDATE Employee
         SET fullName=?2, fatherName=?3, nationalId=?4, idNumber=?5, dateOfBirth=?6,
             address=?7, phone=?8, title=?9, notes=?10, startDate=?11,
             monthlySalary=?12, salaryCurrencyCode=?13, isActive=?14, updatedAt=?15
         WHERE id=?1 AND deletedAt IS NULL"#,
      params![
        id,
        full_name,
        father_name,
        national_id,
        id_number,
        date_of_birth,
        address,
        phone,
        title,
        notes,
        start_date,
        monthly_salary,
        salary_currency_code,
        is_active,
        now,
      ],
    )?;
    if updated == 0 {
      return Err(AppError::NotFound("Employee not found.".into()));
    }
    return get_employee_row(&conn, id);
  }

  let id = uuid::Uuid::new_v4().to_string();
  conn.execute(
    r#"INSERT INTO Employee (
         id, fullName, fatherName, nationalId, idNumber, dateOfBirth, address,
         phone, title, notes, startDate, monthlySalary, salaryCurrencyCode,
         isActive, deletedAt, createdAt, updatedAt
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, NULL, ?15, ?15)"#,
    params![
      id,
      full_name,
      father_name,
      national_id,
      id_number,
      date_of_birth,
      address,
      phone,
      title,
      notes,
      start_date,
      monthly_salary,
      salary_currency_code,
      is_active,
      now,
    ],
  )?;
  get_employee_row(&conn, &id)
}

fn get_employee_row(conn: &Connection, id: &str) -> Result<EmployeeRow, AppError> {
  conn
    .query_row(
      r#"SELECT id, fullName, fatherName, nationalId, idNumber, dateOfBirth, address,
                phone, title, notes, startDate, monthlySalary, salaryCurrencyCode,
                isActive, createdAt, updatedAt
         FROM Employee WHERE id=?1 AND deletedAt IS NULL"#,
      [id],
      map_employee_row,
    )
    .map_err(|_| AppError::NotFound("Employee not found.".into()))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveEmployeeInput {
  pub id: String,
  pub actor_user_id: Option<String>,
}

#[tauri::command]
pub fn archive_employee(
  state: State<'_, AppState>,
  input: ArchiveEmployeeInput,
) -> Result<(), AppError> {
  let id = input.id.trim();
  if id.is_empty() {
    return Err(AppError::Validation("id is required.".into()));
  }
  let now = now_sqlite();
  let conn = state.db.lock();
  let _actor = require_admin(&state, &conn)?;
  let _ = input.actor_user_id;
  let n = conn.execute(
    r#"UPDATE Employee SET isActive=0, deletedAt=?2, updatedAt=?2
       WHERE id=?1 AND deletedAt IS NULL"#,
    params![id, now],
  )?;
  if n == 0 {
    return Err(AppError::NotFound("Employee not found.".into()));
  }
  Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PayEmployeeSalaryInput {
  pub employee_id: String,
  pub currency_code: String,
  pub amount: String,
  /// Optional — shop cash is always Main Vault.
  pub cash_wallet_id: Option<String>,
  pub notes: Option<String>,
  pub value_date: Option<String>,
  pub created_by_id: String,
  /// When set, replaces an existing payment (soft-deletes old cash posting + hard-deletes old row).
  pub replace_payment_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PayEmployeeSalaryResult {
  pub payment_id: String,
  pub transaction_id: String,
  pub reference: String,
  pub display_ref: String,
  pub amount: String,
  pub currency_code: String,
  pub employee_name: String,
}

#[tauri::command]
pub fn pay_employee_salary(
  state: State<'_, AppState>,
  input: PayEmployeeSalaryInput,
) -> Result<PayEmployeeSalaryResult, AppError> {
  let _ = input.created_by_id.trim();
  let employee_id = input.employee_id.trim().to_string();
  if employee_id.is_empty() {
    return Err(AppError::Validation("employeeId is required.".into()));
  }

  let conn = state.db.lock();
  let actor = require_screen(&state, &conn, "employees")?;
  let created_by = actor.id.clone();
  let employee = get_employee_row(&conn, &employee_id)?;
  if !employee.is_active {
    return Err(AppError::Validation("Employee is inactive.".into()));
  }

  if let Some(ref rid) = trim_opt(input.replace_payment_id.clone()) {
    let old_tx: Option<String> = conn
      .query_row(
        "SELECT transactionId FROM EmployeeSalaryPayment WHERE id = ?1 LIMIT 1",
        [rid],
        |row| row.get(0),
      )
      .optional()?;
    let Some(old_tx_id) = old_tx else {
      return Err(AppError::NotFound("Salary payment was not found.".into()));
    };
    crate::commands::trading::util::soft_delete_desk_transaction(&conn, &old_tx_id)?;
  }

  let cash_wallet_id = assert_cash_wallet(&conn, input.cash_wallet_id.as_deref())?;
  let salary_wallet_id = ensure_salary_wallet(&conn)?;
  let (currency_id, code, places) = find_currency_by_code(&conn, &input.currency_code)?;
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
  let reference = format!(
    "SAL-{}-{}",
    employee.full_name.chars().take(8).collect::<String>().replace(' ', ""),
    chrono::Utc::now().timestamp_millis()
  );
  let description = notes.clone().unwrap_or_else(|| {
    format!("Salary — {}", employee.full_name)
  });

  let posted = post_transaction(
    &conn,
    PostTransactionInput {
      reference: reference.clone(),
      r#type: "EXPENSE".into(),
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
          direction: "CREDIT".into(),
          amount_minor: minor.to_string(),
          exchange_rate_id: None,
          memo: Some(format!("Salary paid — {}", employee.full_name)),
        },
        PostingLineDto {
          wallet_id: salary_wallet_id,
          currency: code.clone(),
          direction: "DEBIT".into(),
          amount_minor: minor.to_string(),
          exchange_rate_id: None,
          memo: Some(format!("Salary — {}", employee.full_name)),
        },
      ],
    },
  )?;

  let payment_id = uuid::Uuid::new_v4().to_string();
  let now = now_sqlite();
  conn.execute(
    r#"INSERT INTO EmployeeSalaryPayment (
         id, employeeId, currencyId, amount, cashWalletId, transactionId,
         notes, valueDate, createdById, createdAt, updatedAt
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)"#,
    params![
      payment_id,
      employee_id,
      currency_id,
      amount_major,
      cash_wallet_id,
      posted.id,
      notes,
      value_date,
      created_by,
      now,
    ],
  )?;

  Ok(PayEmployeeSalaryResult {
    payment_id,
    transaction_id: posted.id,
    reference,
    display_ref: posted.display_ref,
    amount: amount_major,
    currency_code: code,
    employee_name: employee.full_name,
  })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListEmployeeSalaryInput {
  pub employee_id: Option<String>,
  /// Search by employee name (optional).
  pub search: Option<String>,
  /// YYYY-MM — filter payments in that calendar month (optional if dateFrom/dateTo set)
  pub month: Option<String>,
  pub date_from: Option<String>,
  pub date_to: Option<String>,
  pub page: Option<i64>,
  pub page_size: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmployeeSalaryPaymentRow {
  pub id: String,
  pub employee_id: String,
  pub employee_name: String,
  pub currency_code: String,
  pub currency_symbol: Option<String>,
  pub amount: String,
  pub notes: Option<String>,
  pub value_date: String,
  pub reference: String,
  pub display_ref: String,
  pub transaction_id: String,
  pub cash_wallet_id: String,
  pub cash_wallet_name: String,
  pub cash_wallet_type: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmployeeSalaryMonthTotal {
  pub currency_code: String,
  pub currency_symbol: Option<String>,
  pub amount: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmployeeSalaryMonthlyBreakdown {
  /// Calendar month YYYY-MM.
  pub month: String,
  pub currency_code: String,
  pub currency_symbol: Option<String>,
  pub amount: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmployeeSalaryLedgerPage {
  pub items: Vec<EmployeeSalaryPaymentRow>,
  pub month_totals: Vec<EmployeeSalaryMonthTotal>,
  pub monthly_breakdown: Vec<EmployeeSalaryMonthlyBreakdown>,
  pub total: i64,
  pub page: i64,
  pub page_size: i64,
  pub month: Option<String>,
  pub date_from: Option<String>,
  pub date_to: Option<String>,
}

#[tauri::command]
pub fn list_employee_salary_payments(
  state: State<'_, AppState>,
  input: ListEmployeeSalaryInput,
) -> Result<EmployeeSalaryLedgerPage, AppError> {
  let page = input.page.unwrap_or(1).max(1);
  let page_size = input.page_size.unwrap_or(50).clamp(1, 200);
  let offset = (page - 1) * page_size;
  let employee_id = trim_opt(input.employee_id);
  let search = trim_opt(input.search).map(|s| s.to_lowercase());
  let month = trim_opt(input.month).filter(|m| m.len() >= 7).map(|m| m[..7].to_string());
  let date_from = trim_opt(input.date_from).map(|s| s.chars().take(10).collect::<String>());
  let date_to = trim_opt(input.date_to).map(|s| s.chars().take(10).collect::<String>());

  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "employees")?;
  let mut where_parts = vec![
    "t.deletedAt IS NULL".to_string(),
    "e.deletedAt IS NULL".to_string(),
  ];
  let mut params_dyn: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

  if let Some(ref eid) = employee_id {
    where_parts.push("p.employeeId = ?".into());
    params_dyn.push(Box::new(eid.clone()));
  }
  if let Some(ref q) = search {
    where_parts.push("LOWER(e.fullName) LIKE ?".into());
    params_dyn.push(Box::new(format!("%{q}%")));
  }
  if let (Some(ref from), Some(ref to)) = (&date_from, &date_to) {
    where_parts.push("p.valueDate >= ?".into());
    params_dyn.push(Box::new(from.clone()));
    where_parts.push("p.valueDate < date(?, '+1 day')".into());
    params_dyn.push(Box::new(to.clone()));
  } else if let Some(ref from) = date_from {
    where_parts.push("p.valueDate >= ?".into());
    params_dyn.push(Box::new(from.clone()));
  } else if let Some(ref to) = date_to {
    where_parts.push("p.valueDate < date(?, '+1 day')".into());
    params_dyn.push(Box::new(to.clone()));
  } else if let Some(ref m) = month {
    where_parts.push("p.valueDate >= ?".into());
    params_dyn.push(Box::new(format!("{m}-01")));
    where_parts.push("p.valueDate < date(?, '+1 month')".into());
    params_dyn.push(Box::new(format!("{m}-01")));
  }

  let where_sql = format!("WHERE {}", where_parts.join(" AND "));

  let count_sql = format!(
    "SELECT COUNT(*) FROM EmployeeSalaryPayment p
     INNER JOIN Employee e ON e.id = p.employeeId
     INNER JOIN \"Transaction\" t ON t.id = p.transactionId
     {where_sql}"
  );
  let total: i64 = {
    let mut stmt = conn.prepare(&count_sql)?;
    let refs: Vec<&dyn rusqlite::types::ToSql> = params_dyn.iter().map(|p| p.as_ref()).collect();
    stmt.query_row(refs.as_slice(), |row| row.get(0))?
  };

  let totals_sql = format!(
    r#"SELECT c.code, c.symbol, COALESCE(SUM(CAST(p.amount AS REAL)), 0)
       FROM EmployeeSalaryPayment p
       INNER JOIN Employee e ON e.id = p.employeeId
       INNER JOIN Currency c ON c.id = p.currencyId
       INNER JOIN "Transaction" t ON t.id = p.transactionId
       {where_sql}
       GROUP BY c.code, c.symbol
       ORDER BY c.code"#
  );
  let month_totals = {
    let mut stmt = conn.prepare(&totals_sql)?;
    let refs: Vec<&dyn rusqlite::types::ToSql> = params_dyn.iter().map(|p| p.as_ref()).collect();
    let mapped = stmt.query_map(refs.as_slice(), |row| {
      Ok(EmployeeSalaryMonthTotal {
        currency_code: row.get(0)?,
        currency_symbol: row.get(1)?,
        amount: format_f64(row.get::<_, f64>(2)?),
      })
    })?;
    mapped.collect::<Result<Vec<_>, _>>()?
  };

  let monthly_sql = format!(
    r#"SELECT strftime('%Y-%m', p.valueDate) AS ym, c.code, c.symbol,
              COALESCE(SUM(CAST(p.amount AS REAL)), 0)
       FROM EmployeeSalaryPayment p
       INNER JOIN Employee e ON e.id = p.employeeId
       INNER JOIN Currency c ON c.id = p.currencyId
       INNER JOIN "Transaction" t ON t.id = p.transactionId
       {where_sql}
       GROUP BY ym, c.code, c.symbol
       HAVING ym IS NOT NULL AND ym != ''
       ORDER BY ym DESC, c.code"#
  );
  let monthly_breakdown = {
    let mut stmt = conn.prepare(&monthly_sql)?;
    let refs: Vec<&dyn rusqlite::types::ToSql> = params_dyn.iter().map(|p| p.as_ref()).collect();
    let mapped = stmt.query_map(refs.as_slice(), |row| {
      Ok(EmployeeSalaryMonthlyBreakdown {
        month: row.get(0)?,
        currency_code: row.get(1)?,
        currency_symbol: row.get(2)?,
        amount: format_f64(row.get::<_, f64>(3)?),
      })
    })?;
    mapped.collect::<Result<Vec<_>, _>>()?
  };

  let list_sql = format!(
    r#"SELECT p.id, p.employeeId, e.fullName, c.code, c.symbol,
              CAST(p.amount AS TEXT), p.notes, p.valueDate, t.reference, IFNULL(t.displayRef,''),
              p.transactionId, p.cashWalletId, w.name, w.type
       FROM EmployeeSalaryPayment p
       INNER JOIN Employee e ON e.id = p.employeeId
       INNER JOIN Currency c ON c.id = p.currencyId
       INNER JOIN "Transaction" t ON t.id = p.transactionId
       INNER JOIN Wallet w ON w.id = p.cashWalletId
       {where_sql}
       ORDER BY p.valueDate DESC, p.createdAt DESC
       LIMIT ? OFFSET ?"#,
  );
  params_dyn.push(Box::new(page_size));
  params_dyn.push(Box::new(offset));
  let mut stmt = conn.prepare(&list_sql)?;
  let refs: Vec<&dyn rusqlite::types::ToSql> = params_dyn.iter().map(|p| p.as_ref()).collect();
  let items = stmt
    .query_map(refs.as_slice(), |row| {
      Ok(EmployeeSalaryPaymentRow {
        id: row.get(0)?,
        employee_id: row.get(1)?,
        employee_name: row.get(2)?,
        currency_code: row.get(3)?,
        currency_symbol: row.get(4)?,
        amount: row.get(5)?,
        notes: row.get(6)?,
        value_date: row.get(7)?,
        reference: row.get(8)?,
        display_ref: row.get(9)?,
        transaction_id: row.get(10)?,
        cash_wallet_id: row.get(11)?,
        cash_wallet_name: row.get(12)?,
        cash_wallet_type: row.get(13)?,
      })
    })?
    .collect::<Result<Vec<_>, _>>()?;

  Ok(EmployeeSalaryLedgerPage {
    items,
    month_totals,
    monthly_breakdown,
    total,
    page,
    page_size,
    month,
    date_from,
    date_to,
  })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteEmployeeSalaryInput {
  pub id: String,
  pub actor_user_id: Option<String>,
}

#[tauri::command]
pub fn delete_employee_salary_payment(
  state: State<'_, AppState>,
  input: DeleteEmployeeSalaryInput,
) -> Result<(), AppError> {
  let id = input.id.trim();
  if id.is_empty() {
    return Err(AppError::Validation("Payment id is required.".into()));
  }
  let _ = input.actor_user_id;
  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "employees")?;
  let tx_id: Option<String> = conn
    .query_row(
      "SELECT transactionId FROM EmployeeSalaryPayment WHERE id = ?1 LIMIT 1",
      [id],
      |row| row.get(0),
    )
    .optional()?;
  let Some(tx_id) = tx_id else {
    return Err(AppError::NotFound("Salary payment was not found.".into()));
  };
  // Soft-deletes the cash posting (restores Main Vault) and hard-deletes the payment row.
  crate::commands::trading::util::soft_delete_desk_transaction(&conn, &tx_id)?;
  Ok(())
}
