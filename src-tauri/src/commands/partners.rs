//! Partner Sarafi catalog — counterpart shops for hawala / trading.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::AppError;
use crate::ledger::{
  find_currency_by_code, money_from_major_units, money_to_major_unit_string, post_transaction,
  PostTransactionInput, PostingLineDto,
};
use crate::state::AppState;
use crate::util::{format_f64, now_sqlite};

fn trim_opt(value: Option<String>, max: usize) -> Result<Option<String>, AppError> {
  let Some(raw) = value else {
    return Ok(None);
  };
  let trimmed = raw.trim().to_string();
  if trimmed.is_empty() {
    return Ok(None);
  }
  if trimmed.chars().count() > max {
    return Err(AppError::Validation(format!(
      "Field exceeds maximum length of {max}."
    )));
  }
  Ok(Some(trimmed))
}

fn require_name(name: &str) -> Result<String, AppError> {
  let trimmed = name.trim().to_string();
  if trimmed.is_empty() {
    return Err(AppError::Validation("Partner name is required.".into()));
  }
  if trimmed.chars().count() > 200 {
    return Err(AppError::Validation(
      "Partner name exceeds maximum length of 200.".into(),
    ));
  }
  Ok(trimmed)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PartnerDetail {
  pub id: String,
  pub name: String,
  pub phone: Option<String>,
  pub city: Option<String>,
  pub country: Option<String>,
  pub notes: Option<String>,
  pub is_active: bool,
  pub is_archived: bool,
  pub commission_enabled: bool,
  pub commission_per_amount: Option<String>,
  pub commission_fee_amount: Option<String>,
  pub commission_currency_id: Option<String>,
  pub commission_currency_code: Option<String>,
  pub created_at: String,
  pub updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PartnerListPage {
  pub items: Vec<PartnerDetail>,
  pub total: i64,
  pub page: i64,
  pub page_size: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListPartnersPageInput {
  pub search: Option<String>,
  pub archive_filter: Option<String>,
  pub page: Option<i64>,
  pub page_size: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePartnerInput {
  pub name: String,
  pub phone: Option<String>,
  pub city: Option<String>,
  pub country: Option<String>,
  pub notes: Option<String>,
  pub commission_enabled: Option<bool>,
  pub commission_per_amount: Option<String>,
  pub commission_fee_amount: Option<String>,
  pub commission_currency_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePartnerInput {
  pub id: String,
  pub name: String,
  pub phone: Option<String>,
  pub city: Option<String>,
  pub country: Option<String>,
  pub notes: Option<String>,
  pub is_active: Option<bool>,
  pub commission_enabled: Option<bool>,
  pub commission_per_amount: Option<String>,
  pub commission_fee_amount: Option<String>,
  pub commission_currency_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PartnerIdInput {
  pub id: String,
}

fn map_partner_row(row: &rusqlite::Row<'_>) -> Result<PartnerDetail, rusqlite::Error> {
  let deleted_at: Option<String> = row.get(13)?;
  Ok(PartnerDetail {
    id: row.get(0)?,
    name: row.get(1)?,
    phone: row.get(2)?,
    city: row.get(3)?,
    country: row.get(4)?,
    notes: row.get(5)?,
    is_active: row.get::<_, i64>(6)? != 0,
    is_archived: deleted_at.is_some(),
    commission_enabled: row.get::<_, i64>(7)? != 0,
    commission_per_amount: row.get(8)?,
    commission_fee_amount: row.get(9)?,
    commission_currency_id: row.get(10)?,
    commission_currency_code: row.get(11)?,
    created_at: row.get(12)?,
    updated_at: row.get(14)?,
  })
}

const PARTNER_SELECT: &str = r#"
  SELECT
    p.id, p.name, p.phone, p.city, p.country, p.notes, p.isActive,
    IFNULL(p.commissionEnabled, 0),
    CAST(p.commissionPerAmount AS TEXT),
    CAST(p.commissionFeeAmount AS TEXT),
    p.commissionCurrencyId,
    c.code,
    p.createdAt,
    p.deletedAt,
    p.updatedAt
  FROM PartnerSarafi p
  LEFT JOIN Currency c ON c.id = p.commissionCurrencyId
"#;

fn load_partner(conn: &Connection, id: &str) -> Result<PartnerDetail, AppError> {
  let sql = format!("{PARTNER_SELECT} WHERE p.id = ?1 LIMIT 1");
  conn
    .query_row(&sql, [id], map_partner_row)
    .map_err(|e| match e {
      rusqlite::Error::QueryReturnedNoRows => {
        AppError::NotFound("Partner sarafi was not found.".into())
      }
      other => other.into(),
    })
}

#[tauri::command]
pub fn list_partners_page(
  state: State<'_, AppState>,
  input: ListPartnersPageInput,
) -> Result<PartnerListPage, AppError> {
  let page = input.page.unwrap_or(1).max(1);
  let page_size = input.page_size.unwrap_or(25).clamp(1, 200);
  let offset = (page - 1) * page_size;
  let search = input
    .search
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(|s| format!("%{s}%"));
  let archive = input
    .archive_filter
    .as_deref()
    .unwrap_or("active")
    .to_ascii_lowercase();

  let mut where_parts: Vec<&str> = Vec::new();
  match archive.as_str() {
    "archived" => where_parts.push("p.deletedAt IS NOT NULL"),
    "all" => {}
    _ => where_parts.push("p.deletedAt IS NULL"),
  }
  if search.is_some() {
    where_parts.push(
      "(p.name LIKE ?1 OR IFNULL(p.phone,'') LIKE ?1 OR IFNULL(p.city,'') LIKE ?1 OR IFNULL(p.country,'') LIKE ?1)",
    );
  }
  let where_sql = if where_parts.is_empty() {
    String::new()
  } else {
    format!("WHERE {}", where_parts.join(" AND "))
  };

  let conn = state.db.lock();
  let total: i64 = if let Some(ref pattern) = search {
    conn.query_row(
      &format!("SELECT COUNT(*) FROM PartnerSarafi p {where_sql}"),
      params![pattern],
      |row| row.get(0),
    )?
  } else {
    conn.query_row(
      &format!("SELECT COUNT(*) FROM PartnerSarafi p {where_sql}"),
      [],
      |row| row.get(0),
    )?
  };

  let list_sql = format!(
    "{PARTNER_SELECT} {where_sql} ORDER BY p.name ASC LIMIT ? OFFSET ?"
  );
  let mut stmt = conn.prepare(&list_sql)?;
  let items = if let Some(ref pattern) = search {
    stmt
      .query_map(params![pattern, page_size, offset], map_partner_row)?
      .collect::<Result<Vec<_>, _>>()?
  } else {
    stmt
      .query_map(params![page_size, offset], map_partner_row)?
      .collect::<Result<Vec<_>, _>>()?
  };

  Ok(PartnerListPage {
    items,
    total,
    page,
    page_size,
  })
}

#[tauri::command]
pub fn get_partner(
  state: State<'_, AppState>,
  input: PartnerIdInput,
) -> Result<PartnerDetail, AppError> {
  let id = input.id.trim();
  if id.is_empty() {
    return Err(AppError::Validation("Partner id is required.".into()));
  }
  let conn = state.db.lock();
  load_partner(&conn, id)
}

fn resolve_commission_currency(
  conn: &Connection,
  currency_id: Option<String>,
) -> Result<Option<String>, AppError> {
  let Some(raw) = currency_id else {
    return Ok(None);
  };
  let id = raw.trim().to_string();
  if id.is_empty() {
    return Ok(None);
  }
  let exists: Option<String> = conn
    .query_row(
      "SELECT id FROM Currency WHERE id = ?1 AND deletedAt IS NULL LIMIT 1",
      [&id],
      |row| row.get(0),
    )
    .optional()?;
  if exists.is_none() {
    return Err(AppError::Validation(
      "Commission currency was not found.".into(),
    ));
  }
  Ok(Some(id))
}

#[tauri::command]
pub fn create_partner(
  state: State<'_, AppState>,
  input: CreatePartnerInput,
) -> Result<PartnerDetail, AppError> {
  let name = require_name(&input.name)?;
  let phone = trim_opt(input.phone, 40)?;
  let city = trim_opt(input.city, 100)?;
  let country = trim_opt(input.country, 100)?;
  let notes = trim_opt(input.notes, 2000)?;
  let commission_enabled = input.commission_enabled.unwrap_or(false);
  let commission_per = trim_opt(input.commission_per_amount, 40)?;
  let commission_fee = trim_opt(input.commission_fee_amount, 40)?;

  let conn = state.db.lock();
  let commission_currency_id =
    resolve_commission_currency(&conn, input.commission_currency_id)?;

  let id = uuid::Uuid::new_v4().to_string();
  let now = now_sqlite();
  conn.execute(
    r#"INSERT INTO PartnerSarafi (
         id, name, phone, city, country, notes, isActive,
         commissionEnabled, commissionPerAmount, commissionFeeAmount, commissionCurrencyId,
         deletedAt, createdAt, updatedAt
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, ?8, ?9, ?10, NULL, ?11, ?11)"#,
    params![
      id,
      name,
      phone,
      city,
      country,
      notes,
      if commission_enabled { 1 } else { 0 },
      commission_per,
      commission_fee,
      commission_currency_id,
      now,
    ],
  )?;

  load_partner(&conn, &id)
}

#[tauri::command]
pub fn update_partner(
  state: State<'_, AppState>,
  input: UpdatePartnerInput,
) -> Result<PartnerDetail, AppError> {
  let id = input.id.trim().to_string();
  if id.is_empty() {
    return Err(AppError::Validation("Partner id is required.".into()));
  }
  let name = require_name(&input.name)?;
  let phone = trim_opt(input.phone, 40)?;
  let city = trim_opt(input.city, 100)?;
  let country = trim_opt(input.country, 100)?;
  let notes = trim_opt(input.notes, 2000)?;
  let commission_enabled = input.commission_enabled.unwrap_or(false);
  let commission_per = trim_opt(input.commission_per_amount, 40)?;
  let commission_fee = trim_opt(input.commission_fee_amount, 40)?;
  let is_active = input.is_active.unwrap_or(true);

  let conn = state.db.lock();
  let existing = load_partner(&conn, &id)?;
  if existing.is_archived {
    return Err(AppError::Validation(
      "Cannot update an archived partner. Restore it first.".into(),
    ));
  }
  let commission_currency_id =
    resolve_commission_currency(&conn, input.commission_currency_id)?;
  let now = now_sqlite();

  let updated = conn.execute(
    r#"UPDATE PartnerSarafi SET
         name = ?1,
         phone = ?2,
         city = ?3,
         country = ?4,
         notes = ?5,
         isActive = ?6,
         commissionEnabled = ?7,
         commissionPerAmount = ?8,
         commissionFeeAmount = ?9,
         commissionCurrencyId = ?10,
         updatedAt = ?11
       WHERE id = ?12 AND deletedAt IS NULL"#,
    params![
      name,
      phone,
      city,
      country,
      notes,
      if is_active { 1 } else { 0 },
      if commission_enabled { 1 } else { 0 },
      commission_per,
      commission_fee,
      commission_currency_id,
      now,
      id,
    ],
  )?;
  if updated == 0 {
    return Err(AppError::NotFound("Partner sarafi was not found.".into()));
  }

  load_partner(&conn, &id)
}

#[tauri::command]
pub fn archive_partner(
  state: State<'_, AppState>,
  input: PartnerIdInput,
) -> Result<PartnerDetail, AppError> {
  let id = input.id.trim().to_string();
  if id.is_empty() {
    return Err(AppError::Validation("Partner id is required.".into()));
  }
  let conn = state.db.lock();
  let now = now_sqlite();
  let updated = conn.execute(
    r#"UPDATE PartnerSarafi SET deletedAt = ?1, isActive = 0, updatedAt = ?1
       WHERE id = ?2 AND deletedAt IS NULL"#,
    params![now, id],
  )?;
  if updated == 0 {
    return Err(AppError::NotFound("Partner sarafi was not found.".into()));
  }
  load_partner(&conn, &id)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PartnerCommissionCurrencyRow {
  pub currency_id: String,
  pub currency_code: String,
  pub currency_symbol: Option<String>,
  pub payable: String,
  pub receivable: String,
  pub open_balance: String,
  pub hawala_count: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PartnerCommissionSummary {
  pub partner_id: String,
  pub partner_name: String,
  pub by_currency: Vec<PartnerCommissionCurrencyRow>,
}

#[tauri::command]
pub fn get_partner_commission_summary(
  state: State<'_, AppState>,
  input: PartnerIdInput,
) -> Result<PartnerCommissionSummary, AppError> {
  let id = input.id.trim().to_string();
  if id.is_empty() {
    return Err(AppError::Validation("Partner id is required.".into()));
  }
  let conn = state.db.lock();
  let partner_name: String = conn
    .query_row(
      "SELECT name FROM PartnerSarafi WHERE id = ?1 AND deletedAt IS NULL LIMIT 1",
      [&id],
      |row| row.get(0),
    )
    .map_err(|e| match e {
      rusqlite::Error::QueryReturnedNoRows => {
        AppError::NotFound("Partner sarafi was not found.".into())
      }
      other => other.into(),
    })?;

  let mut stmt = conn.prepare(
    r#"
    SELECT
      cur.id,
      cur.code,
      cur.symbol,
      CAST(COALESCE(SUM(CASE
        WHEN h.commissionSide = 'PAYABLE' THEN CAST(h.commissionAmount AS REAL)
        ELSE 0 END), 0) AS TEXT) AS payable,
      CAST(COALESCE(SUM(CASE
        WHEN h.commissionSide = 'RECEIVABLE' THEN CAST(h.commissionAmount AS REAL)
        ELSE 0 END), 0) AS TEXT) AS receivable,
      COUNT(*) AS hawala_count
    FROM HawalaTransfer h
    INNER JOIN Currency cur
      ON cur.id = COALESCE(h.commissionCurrencyId, h.currencyId)
    WHERE h.partnerSarafiId = ?1
      AND h.deletedAt IS NULL
      AND h.status IN ('SENT', 'RECEIVED', 'COMPLETED', 'PENDING')
      AND h.commissionAmount IS NOT NULL
      AND CAST(h.commissionAmount AS REAL) > 0
    GROUP BY cur.id, cur.code, cur.symbol
    ORDER BY cur.code ASC
    "#,
  )?;
  let rows = stmt
    .query_map([&id], |row| {
      Ok((
        row.get::<_, String>(0)?,
        row.get::<_, String>(1)?,
        row.get::<_, Option<String>>(2)?,
        row.get::<_, String>(3)?,
        row.get::<_, String>(4)?,
        row.get::<_, i64>(5)?,
      ))
    })?
    .collect::<Result<Vec<_>, _>>()?;

  let mut settled_pay: std::collections::HashMap<String, f64> =
    std::collections::HashMap::new();
  let mut settled_recv: std::collections::HashMap<String, f64> =
    std::collections::HashMap::new();
  if let Ok(mut sstmt) = conn.prepare(
    r#"
    SELECT currencyId, kind, CAST(COALESCE(SUM(CAST(amount AS REAL)), 0) AS TEXT)
    FROM PartnerCommissionSettlement
    WHERE partnerSarafiId = ?1
    GROUP BY currencyId, kind
    "#,
  ) {
    if let Ok(mapped) = sstmt.query_map([&id], |row| {
      Ok((
        row.get::<_, String>(0)?,
        row.get::<_, String>(1)?,
        row.get::<_, String>(2)?,
      ))
    }) {
      for item in mapped.flatten() {
        let (cid, kind, amt) = item;
        let v = amt.parse::<f64>().unwrap_or(0.0);
        let kind_u = kind.to_ascii_uppercase();
        if kind_u.contains("PAY") || kind_u == "PAY_TO_PARTNER" {
          *settled_pay.entry(cid).or_insert(0.0) += v;
        } else {
          *settled_recv.entry(cid).or_insert(0.0) += v;
        }
      }
    }
  }

  let by_currency = rows
    .into_iter()
    .map(|(cid, code, symbol, payable, receivable, count)| {
      let p =
        payable.parse::<f64>().unwrap_or(0.0) - settled_pay.get(&cid).copied().unwrap_or(0.0);
      let r = receivable.parse::<f64>().unwrap_or(0.0)
        - settled_recv.get(&cid).copied().unwrap_or(0.0);
      PartnerCommissionCurrencyRow {
        currency_id: cid,
        currency_code: code,
        currency_symbol: symbol,
        payable: format_f64(p),
        receivable: format_f64(r),
        open_balance: format_f64(p - r),
        hawala_count: count,
      }
    })
    .collect();

  Ok(PartnerCommissionSummary {
    partner_id: id,
    partner_name,
    by_currency,
  })
}

const PARTNER_COMMISSION_EXPENSE: &str = "Partner Commission Expense";
const PARTNER_COMMISSION_INCOME: &str = "Partner Commission Income";

fn ensure_system_wallet(conn: &Connection, name: &str) -> Result<String, AppError> {
  let existing: Option<(String, i64)> = conn
    .query_row(
      r#"SELECT id, isActive FROM Wallet
         WHERE name = ?1 AND type = 'SYSTEM' AND deletedAt IS NULL
         LIMIT 1"#,
      [name],
      |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .optional()?;
  if let Some((id, active)) = existing {
    if active == 0 {
      conn.execute("UPDATE Wallet SET isActive = 1, updatedAt = ?2 WHERE id = ?1", params![id, now_sqlite()])?;
    }
    return Ok(id);
  }
  let id = uuid::Uuid::new_v4().to_string();
  let now = now_sqlite();
  conn.execute(
    r#"INSERT INTO Wallet (id, name, type, customerId, currencyId, isActive, deletedAt, createdAt, updatedAt)
       VALUES (?1, ?2, 'SYSTEM', NULL, NULL, 1, NULL, ?3, ?3)"#,
    params![id, name, now],
  )?;
  Ok(id)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettlePartnerCommissionInput {
  pub partner_sarafi_id: String,
  /// PAY_PARTNER | COLLECT_FROM_PARTNER
  pub kind: String,
  pub currency_code: String,
  pub amount: String,
  pub cash_wallet_id: String,
  pub notes: Option<String>,
  pub value_date: Option<String>,
  pub created_by_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettlePartnerCommissionResult {
  pub settlement_id: String,
  pub transaction_id: String,
  pub reference: String,
  pub kind: String,
  pub amount: String,
  pub currency_code: String,
}

#[tauri::command]
pub fn settle_partner_commission(
  state: State<'_, AppState>,
  input: SettlePartnerCommissionInput,
) -> Result<SettlePartnerCommissionResult, AppError> {
  let partner_id = input.partner_sarafi_id.trim().to_string();
  let kind = input.kind.trim().to_ascii_uppercase();
  let cash_wallet_id = input.cash_wallet_id.trim().to_string();
  let created_by = input.created_by_id.trim().to_string();
  if partner_id.is_empty() {
    return Err(AppError::Validation("Partner is required.".into()));
  }
  if created_by.is_empty() {
    return Err(AppError::Validation("User is required.".into()));
  }
  let is_pay = match kind.as_str() {
    "PAY_PARTNER" | "PAY_TO_PARTNER" => true,
    "COLLECT_FROM_PARTNER" | "COLLECT" => false,
    _ => {
      return Err(AppError::Validation(
        "Kind must be PAY_PARTNER or COLLECT_FROM_PARTNER.".into(),
      ));
    }
  };
  let kind_stored = if is_pay {
    "PAY_PARTNER".to_string()
  } else {
    "COLLECT_FROM_PARTNER".to_string()
  };

  let conn = state.db.lock();
  let partner_name: String = conn
    .query_row(
      "SELECT name FROM PartnerSarafi WHERE id = ?1 AND deletedAt IS NULL LIMIT 1",
      [&partner_id],
      |row| row.get(0),
    )
    .map_err(|e| match e {
      rusqlite::Error::QueryReturnedNoRows => {
        AppError::NotFound("Partner sarafi was not found.".into())
      }
      other => other.into(),
    })?;

  let (currency_id, currency_code, places) = find_currency_by_code(&conn, &input.currency_code)?;
  let settle_minor = money_from_major_units(input.amount.trim(), places)?;
  if settle_minor <= 0 {
    return Err(AppError::Validation("Amount must be greater than zero.".into()));
  }
  let settle_major = money_to_major_unit_string(settle_minor, places)?;

  let (wtype, wactive): (String, i64) = conn.query_row(
    "SELECT type, isActive FROM Wallet WHERE id = ?1 AND deletedAt IS NULL",
    [&cash_wallet_id],
    |row| Ok((row.get(0)?, row.get(1)?)),
  )?;
  if wactive == 0 || (wtype != "TILL" && wtype != "VAULT") {
    return Err(AppError::Validation(
      "Choose an active cash till or vault.".into(),
    ));
  }

  let side = if is_pay { "PAYABLE" } else { "RECEIVABLE" };
  let accrued: f64 = conn.query_row(
    r#"SELECT COALESCE(SUM(CAST(h.commissionAmount AS REAL)), 0)
       FROM HawalaTransfer h
       WHERE h.partnerSarafiId = ?1
         AND h.deletedAt IS NULL
         AND h.status IN ('SENT', 'RECEIVED', 'COMPLETED', 'PENDING')
         AND h.commissionSide = ?2
         AND COALESCE(h.commissionCurrencyId, h.currencyId) = ?3
         AND h.commissionAmount IS NOT NULL"#,
    params![partner_id, side, currency_id],
    |row| row.get(0),
  )?;

  let settled_already: f64 = conn
    .query_row(
      r#"SELECT COALESCE(SUM(CAST(amount AS REAL)), 0)
         FROM PartnerCommissionSettlement
         WHERE partnerSarafiId = ?1 AND currencyId = ?2 AND kind = ?3"#,
      params![partner_id, currency_id, kind_stored],
      |row| row.get(0),
    )
    .unwrap_or(0.0);

  let open = accrued - settled_already;
  let settle_f = settle_major.parse::<f64>().unwrap_or(0.0);
  if settle_f > open + 1e-9 {
    return Err(AppError::Validation(format!(
      "{} only {} {} in commission.",
      if is_pay {
        "You only owe"
      } else {
        "Partner only owes you"
      },
      format_f64(open),
      currency_code
    )));
  }

  let pnl_wallet = ensure_system_wallet(
    &conn,
    if is_pay {
      PARTNER_COMMISSION_EXPENSE
    } else {
      PARTNER_COMMISSION_INCOME
    },
  )?;

  let value_date = input
    .value_date
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(|s| s.to_string())
    .unwrap_or_else(now_sqlite);
  let memo = if is_pay {
    format!("Commission paid to {partner_name}")
  } else {
    format!("Commission collected from {partner_name}")
  };
  let notes = input
    .notes
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(|s| s.to_string());
  let reference = format!(
    "PARTNER-COMM-{}-{}",
    if is_pay { "PAY" } else { "COLLECT" },
    &uuid::Uuid::new_v4().to_string().replace('-', "")[..8].to_ascii_uppercase()
  );

  let entries = if is_pay {
    vec![
      PostingLineDto {
        wallet_id: pnl_wallet.clone(),
        currency: currency_code.clone(),
        direction: "DEBIT".into(),
        amount_minor: settle_minor.to_string(),
        exchange_rate_id: None,
        memo: Some(memo.clone()),
      },
      PostingLineDto {
        wallet_id: cash_wallet_id.clone(),
        currency: currency_code.clone(),
        direction: "CREDIT".into(),
        amount_minor: settle_minor.to_string(),
        exchange_rate_id: None,
        memo: Some(memo.clone()),
      },
    ]
  } else {
    vec![
      PostingLineDto {
        wallet_id: cash_wallet_id.clone(),
        currency: currency_code.clone(),
        direction: "DEBIT".into(),
        amount_minor: settle_minor.to_string(),
        exchange_rate_id: None,
        memo: Some(memo.clone()),
      },
      PostingLineDto {
        wallet_id: pnl_wallet,
        currency: currency_code.clone(),
        direction: "CREDIT".into(),
        amount_minor: settle_minor.to_string(),
        exchange_rate_id: None,
        memo: Some(memo.clone()),
      },
    ]
  };

  let posted = post_transaction(
    &conn,
    PostTransactionInput {
      reference: reference.clone(),
      r#type: "ADJUSTMENT".into(),
      value_date: value_date.clone(),
      entries,
      customer_id: None,
      walk_in_name: None,
      walk_in_phone: None,
      description: notes.clone().or(Some(memo)),
      created_by_id: Some(created_by.clone()),
    },
  )?;

  let settlement_id = uuid::Uuid::new_v4().to_string();
  let now = now_sqlite();
  conn.execute(
    r#"INSERT INTO PartnerCommissionSettlement (
         id, partnerSarafiId, kind, currencyId, amount, cashWalletId,
         transactionId, notes, valueDate, createdById, createdAt, updatedAt
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)"#,
    params![
      settlement_id,
      partner_id,
      kind_stored,
      currency_id,
      settle_major,
      cash_wallet_id,
      posted.id,
      notes,
      value_date,
      created_by,
      now,
    ],
  )?;

  Ok(SettlePartnerCommissionResult {
    settlement_id,
    transaction_id: posted.id,
    reference,
    kind: kind_stored,
    amount: settle_major,
    currency_code,
  })
}
