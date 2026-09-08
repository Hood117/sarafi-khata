//! Partner Sarafi catalog — counterpart shops for hawala / trading.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::commands::customers::OpeningKataLineDetail;
use crate::commands::customers_write::OpeningKataLineInput;
use crate::commands::trading::util::soft_delete_transaction;
use crate::error::AppError;
use crate::ledger::{
  find_currency_by_code, money_from_major_units, money_to_major_unit_string, post_transaction,
  post_transaction_in_tx, resolve_shop_cash_wallet_id, PostTransactionInput, PostingLineDto,
};
use crate::state::AppState;
use crate::util::{format_f64, now_sqlite};
use crate::commands::authorize::{require_screen};

const OPENING_EQUITY_WALLET_NAME: &str = "Opening Equity";

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

fn require_phone(phone: Option<String>) -> Result<String, AppError> {
  let trimmed = phone
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(str::to_string);
  let Some(value) = trimmed else {
    return Err(AppError::Validation(
      "Partner WhatsApp phone number is required.".into(),
    ));
  };
  if value.chars().count() > 40 {
    return Err(AppError::Validation(
      "Phone exceeds maximum length of 40.".into(),
    ));
  }
  Ok(value)
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
  pub opening_kata: Vec<OpeningKataLineDetail>,
  /// Linked local customer (identity only — partner kata stays separate).
  pub customer_id: Option<String>,
  pub linked_customer_name: Option<String>,
  /// Legacy partner row with no customer link yet.
  pub needs_customer_link: bool,
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
  pub opening_kata: Option<Vec<OpeningKataLineInput>>,
  pub actor_user_id: Option<String>,
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
  pub opening_kata: Option<Vec<OpeningKataLineInput>>,
  pub actor_user_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PartnerIdInput {
  pub id: String,
}

fn map_partner_row(row: &rusqlite::Row<'_>) -> Result<PartnerDetail, rusqlite::Error> {
  let deleted_at: Option<String> = row.get(13)?;
  let customer_id: Option<String> = row.get(15)?;
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
    opening_kata: Vec::new(),
    customer_id: customer_id.clone(),
    linked_customer_name: row.get(16)?,
    needs_customer_link: customer_id.is_none() && deleted_at.is_none(),
  })
}

const PARTNER_SELECT: &str = r#"
  SELECT
    p.id,
    COALESCE(NULLIF(TRIM(cust.fullName), ''), p.name),
    COALESCE(NULLIF(TRIM(cust.phone), ''), p.phone),
    p.city, p.country, p.notes, p.isActive,
    IFNULL(p.commissionEnabled, 0),
    CAST(p.commissionPerAmount AS TEXT),
    CAST(p.commissionFeeAmount AS TEXT),
    p.commissionCurrencyId,
    cc.code,
    p.createdAt,
    p.deletedAt,
    p.updatedAt,
    p.customerId,
    cust.fullName
  FROM PartnerSarafi p
  LEFT JOIN Currency cc ON cc.id = p.commissionCurrencyId
  LEFT JOIN Customer cust ON cust.id = p.customerId AND cust.deletedAt IS NULL
"#;

fn resolve_sole_customer_wallet(conn: &Connection, customer_id: &str) -> Result<String, AppError> {
  let mut stmt = conn.prepare(
    "SELECT id FROM Wallet
     WHERE customerId = ?1 AND type = 'CUSTOMER' AND deletedAt IS NULL AND isActive = 1",
  )?;
  let ids = stmt
    .query_map([customer_id], |row| row.get::<_, String>(0))?
    .collect::<Result<Vec<_>, _>>()?;
  match ids.len() {
    0 => Err(AppError::Validation(
      "Linked customer has no account wallet.".into(),
    )),
    1 => Ok(ids[0].clone()),
    _ => Err(AppError::Validation(
      "Linked customer has more than one wallet.".into(),
    )),
  }
}

fn assert_customer_link_available(
  conn: &Connection,
  customer_id: &str,
  exclude_partner_id: Option<&str>,
) -> Result<(), AppError> {
  let mut sql = String::from(
    "SELECT id FROM PartnerSarafi
     WHERE customerId = ?1 AND deletedAt IS NULL",
  );
  if exclude_partner_id.is_some() {
    sql.push_str(" AND id != ?2");
  }
  sql.push_str(" LIMIT 1");
  let existing: Option<String> = if let Some(pid) = exclude_partner_id {
    conn
      .query_row(&sql, params![customer_id, pid], |row| row.get(0))
      .optional()?
  } else {
    conn
      .query_row(&sql, [customer_id], |row| row.get(0))
      .optional()?
  };
  if existing.is_some() {
    return Err(AppError::Validation(
      "This customer is already linked to another partner sarafi.".into(),
    ));
  }
  Ok(())
}

fn load_customer_for_partner_link(
  conn: &Connection,
  customer_id: &str,
) -> Result<(String, String, String), AppError> {
  let row: (String, Option<String>, Option<String>, i64) = conn
    .query_row(
      "SELECT fullName, phone, deletedAt, isActive FROM Customer WHERE id = ?1 LIMIT 1",
      [customer_id],
      |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    )
    .map_err(|e| match e {
      rusqlite::Error::QueryReturnedNoRows => {
        AppError::NotFound("Customer was not found.".into())
      }
      other => other.into(),
    })?;
  if row.2.is_some() {
    return Err(AppError::Validation(
      "Archived customers cannot be linked to a partner.".into(),
    ));
  }
  if row.3 == 0 {
    return Err(AppError::Validation(
      "Inactive customers cannot be linked to a partner.".into(),
    ));
  }
  let phone = row
    .1
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(str::to_string)
    .ok_or_else(|| {
      AppError::Validation(
        "Customer must have a phone number before linking as partner sarafi.".into(),
      )
    })?;
  Ok((customer_id.to_string(), row.0.trim().to_string(), phone))
}

fn format_opening_amount_display(major: &str) -> String {
  let t = major.trim();
  if t.is_empty() {
    return String::new();
  }
  if let Ok(v) = t.parse::<f64>() {
    if (v - v.round()).abs() < 1e-9 {
      return format!("{}", v.round() as i64);
    }
    return format!("{v:.8}")
      .trim_end_matches('0')
      .trim_end_matches('.')
      .to_string();
  }
  t.to_string()
}

fn iso_date_prefix(value_date: &str) -> String {
  let trimmed = value_date.trim();
  if trimmed.len() >= 10 {
    trimmed[..10].to_string()
  } else {
    trimmed.to_string()
  }
}

fn ensure_opening_equity(conn: &Connection) -> Result<String, AppError> {
  let existing: Option<String> = conn
    .query_row(
      "SELECT id FROM Wallet
       WHERE name = ?1 AND type = 'SYSTEM' AND deletedAt IS NULL AND isActive = 1
       LIMIT 1",
      [OPENING_EQUITY_WALLET_NAME],
      |row| row.get(0),
    )
    .optional()?;
  if let Some(id) = existing {
    return Ok(id);
  }
  let id = uuid::Uuid::new_v4().to_string();
  let now = now_sqlite();
  conn.execute(
    "INSERT INTO Wallet (id, name, type, customerId, partnerSarafiId, userId, isActive, deletedAt, createdAt, updatedAt)
     VALUES (?1, ?2, 'SYSTEM', NULL, NULL, NULL, 1, NULL, ?3, ?3)",
    params![id, OPENING_EQUITY_WALLET_NAME, now],
  )?;
  Ok(id)
}

fn ensure_partner_wallet(
  conn: &Connection,
  partner_id: &str,
  partner_name: &str,
) -> Result<String, AppError> {
  let existing: Option<String> = conn
    .query_row(
      "SELECT id FROM Wallet
       WHERE partnerSarafiId = ?1 AND type = 'PARTNER' AND deletedAt IS NULL AND isActive = 1
       LIMIT 1",
      [partner_id],
      |row| row.get(0),
    )
    .optional()?;
  if let Some(id) = existing {
    let wallet_name = format!("{partner_name} Wallet");
    let _ = conn.execute(
      "UPDATE Wallet SET name = ?1, updatedAt = ?2 WHERE id = ?3",
      params![wallet_name, now_sqlite(), id],
    );
    return Ok(id);
  }
  let id = uuid::Uuid::new_v4().to_string();
  let now = now_sqlite();
  let wallet_name = format!("{partner_name} Wallet");
  conn.execute(
    "INSERT INTO Wallet (id, name, type, customerId, partnerSarafiId, userId, isActive, deletedAt, createdAt, updatedAt)
     VALUES (?1, ?2, 'PARTNER', NULL, ?3, NULL, 1, NULL, ?4, ?4)",
    params![id, wallet_name, partner_id, now],
  )?;
  Ok(id)
}

fn load_partner_opening_kata(
  conn: &Connection,
  partner_id: &str,
) -> Result<Vec<OpeningKataLineDetail>, AppError> {
  let mut stmt = conn.prepare(
    r#"SELECT t.id, t.valueDate, IFNULL(t.description, ''),
              c.code, le.direction, CAST(le.amount AS TEXT), c.decimalPlaces
       FROM "Transaction" t
       INNER JOIN LedgerEntry le ON le.transactionId = t.id
       INNER JOIN Wallet w ON w.id = le.walletId
         AND w.partnerSarafiId = ?1
         AND w.type = 'PARTNER'
         AND w.deletedAt IS NULL
       INNER JOIN Currency c ON c.id = le.currencyId AND c.deletedAt IS NULL
       WHERE t.deletedAt IS NULL
         AND UPPER(t.reference) LIKE 'OB-%'
         AND (
           le.memo LIKE 'Opening Kata — money in%'
           OR le.memo LIKE 'Opening Kata — money out%'
         )
       ORDER BY t.displaySeq IS NULL, t.displaySeq ASC, t.createdAt ASC, t.rowid ASC"#,
  )?;
  let rows = stmt
    .query_map([partner_id], |row| {
      let transaction_id: String = row.get(0)?;
      let value_date: String = row.get(1)?;
      let description: String = row.get(2)?;
      let currency_code: String = row.get(3)?;
      let direction: String = row.get(4)?;
      let amount: String = row.get(5)?;
      let decimal_places: i64 = row.get(6)?;
      Ok((
        transaction_id,
        value_date,
        description,
        currency_code,
        direction,
        amount,
        decimal_places,
      ))
    })?
    .collect::<Result<Vec<_>, _>>()?;

  let mut items = Vec::with_capacity(rows.len());
  for (
    transaction_id,
    value_date,
    description,
    currency_code,
    direction,
    amount,
    decimal_places,
  ) in rows
  {
    let direction_norm = direction.trim().to_ascii_uppercase();
    let kata_direction = if direction_norm == "DEBIT" {
      "GIVE"
    } else if direction_norm == "CREDIT" {
      "TAKE"
    } else {
      continue;
    };
    let minor = money_from_major_units(amount.trim(), decimal_places)?;
    let amount_display = format_opening_amount_display(
      &money_to_major_unit_string(minor, decimal_places).unwrap_or(amount),
    );
    items.push(OpeningKataLineDetail {
      transaction_id,
      currency_code,
      amount: amount_display,
      direction: kata_direction.into(),
      description,
      notes: None,
      value_date: iso_date_prefix(&value_date),
    });
  }
  Ok(items)
}

/// Opening Kata for partners = starting claim only.
/// Does NOT touch Main Vault. Same pattern as customers:
/// GIVE (we hold for partner / you owe them): Partner DEBIT + Opening Equity CREDIT.
/// TAKE (partner owes you): Partner CREDIT + Opening Equity DEBIT.
fn post_partner_opening_kata_line(
  conn: &Connection,
  _partner_id: &str,
  wallet_id: &str,
  partner_name: &str,
  line: &OpeningKataLineInput,
  actor: &str,
) -> Result<(), AppError> {
  let direction = line
    .direction
    .as_deref()
    .unwrap_or("GIVE")
    .trim()
    .to_ascii_uppercase();
  let give = direction == "GIVE" || direction == "IN" || direction == "PARTNER_GIVES";
  let take = direction == "TAKE" || direction == "OUT" || direction == "PARTNER_TAKES";
  if !give && !take {
    return Err(AppError::Validation(
      "Opening Kata direction must be Partner Gave Money or Partner Took Money.".into(),
    ));
  }

  let (_cid, currency_code, places) = find_currency_by_code(conn, &line.currency_code)?;
  let minor = money_from_major_units(line.amount.trim(), places)?;
  if minor <= 0 {
    return Err(AppError::Validation(
      "Opening Kata amount must be positive.".into(),
    ));
  }

  let equity_id = ensure_opening_equity(conn)?;

  let value_date = line
    .value_date
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(|s| s.to_string())
    .unwrap_or_else(now_sqlite);

  let desc = line
    .description
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(|s| s.to_string())
    .or_else(|| {
      line
        .notes
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
    })
    .unwrap_or_else(|| {
      if give {
        format!("Opening Kata — {partner_name} opening credit")
      } else {
        format!("Opening Kata — {partner_name} opening debit")
      }
    });

  let reference = format!(
    "OB-{}-{}",
    chrono::Utc::now().timestamp_millis(),
    uuid::Uuid::new_v4().simple()
  );

  let (partner_dir, equity_dir, partner_memo) = if take {
    ("CREDIT", "DEBIT", "Opening Kata — money out")
  } else {
    ("DEBIT", "CREDIT", "Opening Kata — money in")
  };

  post_transaction(
    conn,
    PostTransactionInput {
      reference,
      r#type: "ADJUSTMENT".into(),
      value_date,
      customer_id: None,
      walk_in_name: Some(partner_name.to_string()),
      walk_in_phone: None,
      description: Some(desc),
      created_by_id: Some(actor.to_string()),
      entries: vec![
        PostingLineDto {
          wallet_id: wallet_id.to_string(),
          currency: currency_code.clone(),
          direction: partner_dir.into(),
          amount_minor: minor.to_string(),
          exchange_rate_id: None,
          memo: Some(partner_memo.into()),
        },
        PostingLineDto {
          wallet_id: equity_id,
          currency: currency_code,
          direction: equity_dir.into(),
          amount_minor: minor.to_string(),
          exchange_rate_id: None,
          memo: Some("Opening equity — partner claim".into()),
        },
      ],
    },
  )?;
  Ok(())
}

fn normalize_opening_direction(raw: Option<&str>) -> String {
  let direction = raw.unwrap_or("GIVE").trim().to_ascii_uppercase();
  if direction == "TAKE" || direction == "OUT" || direction == "PARTNER_TAKES" {
    "TAKE".into()
  } else {
    "GIVE".into()
  }
}

fn opening_line_matches(
  existing: &OpeningKataLineDetail,
  line: &OpeningKataLineInput,
  conn: &Connection,
) -> Result<bool, AppError> {
  let (_cid, _, places) = find_currency_by_code(conn, &line.currency_code)?;
  let new_minor = money_from_major_units(line.amount.trim(), places)?;
  let old_minor = money_from_major_units(existing.amount.trim(), places)?;
  let new_dir = normalize_opening_direction(line.direction.as_deref());
  let old_dir = normalize_opening_direction(Some(&existing.direction));
  let new_date = line
    .value_date
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(|s| if s.len() >= 10 { &s[..10] } else { s })
    .unwrap_or("");
  let old_date = if existing.value_date.len() >= 10 {
    &existing.value_date[..10]
  } else {
    existing.value_date.as_str()
  };
  let new_desc = line
    .description
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .unwrap_or("");
  let old_desc = existing.description.trim();

  Ok(new_minor == old_minor
    && new_dir == old_dir
    && existing
      .currency_code
      .eq_ignore_ascii_case(line.currency_code.trim())
    && new_date == old_date
    && new_desc == old_desc)
}

fn sync_partner_opening_kata(
  conn: &Connection,
  partner_id: &str,
  wallet_id: &str,
  partner_name: &str,
  actor: &str,
  submitted: Vec<OpeningKataLineInput>,
) -> Result<(), AppError> {
  let existing = load_partner_opening_kata(conn, partner_id)?;
  let existing_by_id: std::collections::HashMap<String, OpeningKataLineDetail> = existing
    .into_iter()
    .map(|line| (line.transaction_id.clone(), line))
    .collect();
  let mut kept_ids = std::collections::HashSet::new();

  for line in &submitted {
    if let Some(tx_id) = line
      .transaction_id
      .as_deref()
      .map(str::trim)
      .filter(|s| !s.is_empty())
    {
      if let Some(ex) = existing_by_id.get(tx_id) {
        if opening_line_matches(ex, line, conn)? {
          kept_ids.insert(tx_id.to_string());
          continue;
        }
        soft_delete_transaction(conn, tx_id)?;
      }
    }
    post_partner_opening_kata_line(conn, partner_id, wallet_id, partner_name, line, actor)?;
  }

  for tx_id in existing_by_id.keys() {
    if !kept_ids.contains(tx_id) {
      soft_delete_transaction(conn, tx_id)?;
    }
  }

  Ok(())
}

fn load_partner(conn: &Connection, id: &str) -> Result<PartnerDetail, AppError> {
  let sql = format!("{PARTNER_SELECT} WHERE p.id = ?1 LIMIT 1");
  let mut detail = conn
    .query_row(&sql, [id], map_partner_row)
    .map_err(|e| match e {
      rusqlite::Error::QueryReturnedNoRows => {
        AppError::NotFound("Partner sarafi was not found.".into())
      }
      other => other.into(),
    })?;
  detail.opening_kata = load_partner_opening_kata(conn, id)?;
  Ok(detail)
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
    "archived" => where_parts.push("(p.deletedAt IS NOT NULL OR IFNULL(p.isActive, 1) = 0)"),
    "all" => {}
    _ => where_parts.push("p.deletedAt IS NULL AND IFNULL(p.isActive, 1) != 0"),
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
  let _actor = require_screen(&state, &conn, "partners")?;
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
  let _actor = require_screen(&state, &conn, "partners")?;
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
  let phone = require_phone(input.phone)?;
  let city = trim_opt(input.city, 100)?;
  let country = trim_opt(input.country, 100)?;
  let notes = trim_opt(input.notes, 2000)?;
  let commission_enabled = input.commission_enabled.unwrap_or(false);
  let commission_per = trim_opt(input.commission_per_amount, 40)?;
  let commission_fee = trim_opt(input.commission_fee_amount, 40)?;
  let opening_lines: Vec<OpeningKataLineInput> = input
    .opening_kata
    .unwrap_or_default()
    .into_iter()
    .filter(|l| !l.amount.trim().is_empty())
    .collect();
  let _ = input.actor_user_id.as_deref();

  let conn = state.db.lock();
  let actor = require_screen(&state, &conn, "partners")?;
  let actor_id = actor.id.clone();
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

  let wallet_id = ensure_partner_wallet(&conn, &id, &name)?;
  for line in &opening_lines {
    post_partner_opening_kata_line(&conn, &id, &wallet_id, &name, line, &actor_id)?;
  }

  load_partner(&conn, &id)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePartnerFromCustomerInput {
  pub customer_id: String,
  pub city: Option<String>,
  pub country: Option<String>,
  pub notes: Option<String>,
  pub commission_enabled: Option<bool>,
  pub commission_per_amount: Option<String>,
  pub commission_fee_amount: Option<String>,
  pub commission_currency_id: Option<String>,
  pub opening_kata: Option<Vec<OpeningKataLineInput>>,
  pub actor_user_id: Option<String>,
}

/// Create a partner sarafi linked to an existing customer (same person, separate kata).
#[tauri::command]
pub fn create_partner_from_customer(
  state: State<'_, AppState>,
  input: CreatePartnerFromCustomerInput,
) -> Result<PartnerDetail, AppError> {
  let customer_id = input.customer_id.trim().to_string();
  if customer_id.is_empty() {
    return Err(AppError::Validation("customerId is required.".into()));
  }
  let city = trim_opt(input.city, 100)?;
  let country = trim_opt(input.country, 100)?;
  let notes = trim_opt(input.notes, 2000)?;
  let commission_enabled = input.commission_enabled.unwrap_or(false);
  let commission_per = trim_opt(input.commission_per_amount, 40)?;
  let commission_fee = trim_opt(input.commission_fee_amount, 40)?;
  let opening_lines: Vec<OpeningKataLineInput> = input
    .opening_kata
    .unwrap_or_default()
    .into_iter()
    .filter(|l| !l.amount.trim().is_empty())
    .collect();
  let _ = input.actor_user_id.as_deref();

  let conn = state.db.lock();
  let actor = require_screen(&state, &conn, "partners")?;
  let actor_id = actor.id.clone();
  let (cid, name, phone) = load_customer_for_partner_link(&conn, &customer_id)?;
  assert_customer_link_available(&conn, &cid, None)?;
  let commission_currency_id =
    resolve_commission_currency(&conn, input.commission_currency_id)?;

  let id = uuid::Uuid::new_v4().to_string();
  let now = now_sqlite();
  conn.execute(
    r#"INSERT INTO PartnerSarafi (
         id, name, phone, city, country, notes, isActive, customerId,
         commissionEnabled, commissionPerAmount, commissionFeeAmount, commissionCurrencyId,
         deletedAt, createdAt, updatedAt
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, ?8, ?9, ?10, ?11, NULL, ?12, ?12)"#,
    params![
      id,
      name,
      phone,
      city,
      country,
      notes,
      cid,
      if commission_enabled { 1 } else { 0 },
      commission_per,
      commission_fee,
      commission_currency_id,
      now,
    ],
  )?;

  let wallet_id = ensure_partner_wallet(&conn, &id, &name)?;
  for line in &opening_lines {
    post_partner_opening_kata_line(&conn, &id, &wallet_id, &name, line, &actor_id)?;
  }

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
  let phone = require_phone(input.phone)?;
  let city = trim_opt(input.city, 100)?;
  let country = trim_opt(input.country, 100)?;
  let notes = trim_opt(input.notes, 2000)?;
  let commission_enabled = input.commission_enabled.unwrap_or(false);
  let commission_per = trim_opt(input.commission_per_amount, 40)?;
  let commission_fee = trim_opt(input.commission_fee_amount, 40)?;
  let is_active = input.is_active.unwrap_or(true);
  let sync_opening = input.opening_kata.is_some();
  let opening_lines: Vec<OpeningKataLineInput> = input
    .opening_kata
    .unwrap_or_default()
    .into_iter()
    .filter(|l| !l.amount.trim().is_empty())
    .collect();
  let _ = input.actor_user_id.as_deref();

  let conn = state.db.lock();
  let actor = require_screen(&state, &conn, "partners")?;
  let actor_id = actor.id.clone();
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

  let wallet_id = ensure_partner_wallet(&conn, &id, &name)?;
  if sync_opening {
    sync_partner_opening_kata(&conn, &id, &wallet_id, &name, &actor_id, opening_lines)?;
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
  let _actor = require_screen(&state, &conn, "partners")?;
  let existing = load_partner(&conn, &id)?;
  if existing.is_archived {
    return Ok(existing);
  }

  let open = partner_open_money_summary(&conn, &id)?;
  if !open.is_empty() {
    return Err(AppError::Validation(format!(
      "You cannot archive this partner until the money is 0. Remaining: {}.",
      open.join(", ")
    )));
  }

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
  /// Partner commission open balances by currency.
  pub by_currency: Vec<PartnerCommissionCurrencyRow>,
  /// Hawala principal open balances (send = you owe him, receive = he owes you).
  pub principal_by_currency: Vec<PartnerCommissionCurrencyRow>,
}

fn load_settled_maps(
  conn: &Connection,
  partner_id: &str,
  balance_type: &str,
) -> Result<(std::collections::HashMap<String, f64>, std::collections::HashMap<String, f64>), AppError>
{
  let mut settled_pay: std::collections::HashMap<String, f64> =
    std::collections::HashMap::new();
  let mut settled_recv: std::collections::HashMap<String, f64> =
    std::collections::HashMap::new();
  // PRINCIPAL settlements that only reverse partner-wallet opening (no Hawala Clearing
  // leg) must not reduce hawala principal — wallet balance already drops via ledger.
  let sql = if balance_type.eq_ignore_ascii_case("PRINCIPAL") {
    r#"
    SELECT currencyId, kind, CAST(COALESCE(SUM(CAST(amount AS REAL)), 0) AS TEXT)
    FROM PartnerCommissionSettlement s
    WHERE partnerSarafiId = ?1
      AND UPPER(COALESCE(balanceType, 'COMMISSION')) = UPPER(?2)
      AND deletedAt IS NULL
      AND EXISTS (
        SELECT 1 FROM LedgerEntry le
        INNER JOIN Wallet w ON w.id = le.walletId
        WHERE le.transactionId = s.transactionId
          AND w.name = 'Hawala Clearing'
          AND w.type = 'SYSTEM'
      )
    GROUP BY currencyId, kind
    "#
  } else {
    r#"
    SELECT currencyId, kind, CAST(COALESCE(SUM(CAST(amount AS REAL)), 0) AS TEXT)
    FROM PartnerCommissionSettlement
    WHERE partnerSarafiId = ?1
      AND UPPER(COALESCE(balanceType, 'COMMISSION')) = UPPER(?2)
      AND deletedAt IS NULL
    GROUP BY currencyId, kind
    "#
  };
  let mut sstmt = conn.prepare(sql)?;
  let mapped = sstmt.query_map(params![partner_id, balance_type], |row| {
    Ok((
      row.get::<_, String>(0)?,
      row.get::<_, String>(1)?,
      row.get::<_, String>(2)?,
    ))
  })?;
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
  Ok((settled_pay, settled_recv))
}

fn partner_wallet_balance(
  conn: &Connection,
  partner_id: &str,
  currency_id: &str,
) -> Result<(Option<String>, f64), AppError> {
  let wallet_id: Option<String> = conn
    .query_row(
      "SELECT id FROM Wallet
       WHERE partnerSarafiId = ?1 AND type = 'PARTNER' AND deletedAt IS NULL AND isActive = 1
       LIMIT 1",
      [partner_id],
      |row| row.get(0),
    )
    .optional()?;
  let Some(ref wid) = wallet_id else {
    return Ok((None, 0.0));
  };
  let bal: f64 = conn.query_row(
    r#"SELECT COALESCE(SUM(CASE WHEN le.direction='DEBIT' THEN CAST(le.amount AS REAL)
                                ELSE -CAST(le.amount AS REAL) END), 0)
       FROM LedgerEntry le
       INNER JOIN "Transaction" t ON t.id = le.transactionId AND t.deletedAt IS NULL
       WHERE le.walletId = ?1 AND le.currencyId = ?2"#,
    params![wid, currency_id],
    |row| row.get(0),
  )?;
  Ok((wallet_id, bal))
}

/// Tit-for-tat per currency: SEND (you owe) and RECEIVE (he owes) cancel each other.
/// Only the remaining side stays open; Pay / Collect still settle cash against that remainder.
fn net_payable_receivable(payable: f64, receivable: f64) -> (f64, f64) {
  let mut p = payable;
  let mut r = receivable;
  // Over-collect (r < 0) → excess becomes "you owe him".
  // Over-pay (p < 0) → excess becomes "he owes you".
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
  (p, r)
}

fn rows_to_balance(
  rows: Vec<(String, String, Option<String>, String, String, i64)>,
  settled_pay: &std::collections::HashMap<String, f64>,
  settled_recv: &std::collections::HashMap<String, f64>,
) -> Vec<PartnerCommissionCurrencyRow> {
  rows
    .into_iter()
    .filter_map(|(cid, code, symbol, payable, receivable, count)| {
      let gross_p =
        payable.parse::<f64>().unwrap_or(0.0) - settled_pay.get(&cid).copied().unwrap_or(0.0);
      let gross_r = receivable.parse::<f64>().unwrap_or(0.0)
        - settled_recv.get(&cid).copied().unwrap_or(0.0);
      let (p, r) = net_payable_receivable(gross_p, gross_r);
      // Keep rows that still have open amount OR had hawala activity (for audit).
      if p.abs() < 1e-9 && r.abs() < 1e-9 && count == 0 {
        return None;
      }
      Some(PartnerCommissionCurrencyRow {
        currency_id: cid,
        currency_code: code,
        currency_symbol: symbol,
        payable: format_f64(p),
        receivable: format_f64(r),
        open_balance: format_f64(p - r),
        hawala_count: count,
      })
    })
    .collect()
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
  let _actor = require_screen(&state, &conn, "partners")?;
  compute_partner_commission_summary(&conn, &id)
}

/// Builds open commission + principal balances for a partner (must exist / not deleted).
fn compute_partner_commission_summary(
  conn: &Connection,
  id: &str,
) -> Result<PartnerCommissionSummary, AppError> {
  let partner_name: String = conn
    .query_row(
      "SELECT name FROM PartnerSarafi WHERE id = ?1 AND deletedAt IS NULL LIMIT 1",
      [id],
      |row| row.get(0),
    )
    .map_err(|e| match e {
      rusqlite::Error::QueryReturnedNoRows => {
        AppError::NotFound("Partner sarafi was not found.".into())
      }
      other => other.into(),
    })?;

  let mut comm_stmt = conn.prepare(
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
  let comm_rows = comm_stmt
    .query_map([id], |row| {
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

  // Principal: SEND → you owe partner (receiver payout amount/currency).
  // RECEIVE → partner owes you (hawala amount/currency).
  // Desk Quick Action hawalas credit the linked customer wallet directly, so they
  // must not also accrue partner principal kata (customer identity stays separate).
  let mut prin_stmt = conn.prepare(
    r#"
    SELECT
      cur.id,
      cur.code,
      cur.symbol,
      CAST(COALESCE(SUM(CASE
        WHEN UPPER(h.direction) = 'SEND' THEN CAST(COALESCE(h.receiveAmount, h.amount) AS REAL)
        ELSE 0 END), 0) AS TEXT) AS payable,
      CAST(COALESCE(SUM(CASE
        WHEN UPPER(h.direction) = 'RECEIVE' THEN CAST(h.amount AS REAL)
        ELSE 0 END), 0) AS TEXT) AS receivable,
      COUNT(*) AS hawala_count
    FROM HawalaTransfer h
    INNER JOIN Currency cur ON cur.id = CASE
      WHEN UPPER(h.direction) = 'SEND' THEN COALESCE(h.receiveCurrencyId, h.currencyId)
      ELSE h.currencyId
    END
    WHERE h.partnerSarafiId = ?1
      AND h.deletedAt IS NULL
      AND h.status IN ('SENT', 'RECEIVED', 'COMPLETED', 'PENDING')
      AND h.receiverCustomerId IS NULL
    GROUP BY cur.id, cur.code, cur.symbol
    ORDER BY cur.code ASC
    "#,
  )?;
  let prin_rows = prin_stmt
    .query_map([id], |row| {
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

  let (comm_pay, comm_recv) = load_settled_maps(conn, id, "COMMISSION")?;
  let (prin_pay, prin_recv) = load_settled_maps(conn, id, "PRINCIPAL")?;

  let mut principal = rows_to_balance(prin_rows, &prin_pay, &prin_recv);

  // Fold Opening Kata / partner-wallet claim balances into principal kata.
  // Partner DEBIT (GIVE) → you owe them; Partner CREDIT (TAKE) → they owe you.
  // Does not touch Main Vault until Pay / Collect.
  let mut open_stmt = conn.prepare(
    r#"
    SELECT cur.id, cur.code, cur.symbol,
           COALESCE(SUM(CASE WHEN le.direction='DEBIT' THEN CAST(le.amount AS REAL)
                             ELSE -CAST(le.amount AS REAL) END), 0) AS bal
    FROM Wallet w
    INNER JOIN LedgerEntry le ON le.walletId = w.id
    INNER JOIN "Transaction" t ON t.id = le.transactionId AND t.deletedAt IS NULL
    INNER JOIN Currency cur ON cur.id = le.currencyId AND cur.deletedAt IS NULL
    WHERE w.partnerSarafiId = ?1 AND w.type = 'PARTNER' AND w.deletedAt IS NULL
    GROUP BY cur.id, cur.code, cur.symbol
    HAVING ABS(COALESCE(SUM(CASE WHEN le.direction='DEBIT' THEN CAST(le.amount AS REAL)
                                 ELSE -CAST(le.amount AS REAL) END), 0)) > 1e-9
    "#,
  )?;
  let open_rows = open_stmt
    .query_map([id], |row| {
      Ok((
        row.get::<_, String>(0)?,
        row.get::<_, String>(1)?,
        row.get::<_, Option<String>>(2)?,
        row.get::<_, f64>(3)?,
      ))
    })?
    .collect::<Result<Vec<_>, _>>()?;

  for (cid, code, symbol, bal) in open_rows {
    let payable_add = if bal > 1e-9 { bal } else { 0.0 };
    let receivable_add = if bal < -1e-9 { -bal } else { 0.0 };
    if let Some(row) = principal.iter_mut().find(|r| r.currency_id == cid) {
      let gross_p = row.payable.parse::<f64>().unwrap_or(0.0) + payable_add;
      let gross_r = row.receivable.parse::<f64>().unwrap_or(0.0) + receivable_add;
      let (p, r) = net_payable_receivable(gross_p, gross_r);
      row.payable = format_f64(p);
      row.receivable = format_f64(r);
      row.open_balance = format_f64(p - r);
    } else {
      let (p, r) = net_payable_receivable(payable_add, receivable_add);
      principal.push(PartnerCommissionCurrencyRow {
        currency_id: cid,
        currency_code: code,
        currency_symbol: symbol,
        payable: format_f64(p),
        receivable: format_f64(r),
        open_balance: format_f64(p - r),
        hawala_count: 0,
      });
    }
  }
  principal.sort_by(|a, b| a.currency_code.cmp(&b.currency_code));

  Ok(PartnerCommissionSummary {
    partner_id: id.to_string(),
    partner_name,
    by_currency: rows_to_balance(comm_rows, &comm_pay, &comm_recv),
    principal_by_currency: principal,
  })
}

/// Human-readable open money lines for archive/delete guards.
fn partner_open_money_summary(conn: &Connection, id: &str) -> Result<Vec<String>, AppError> {
  let summary = compute_partner_commission_summary(conn, id)?;
  let mut by_code: std::collections::BTreeMap<String, (f64, f64)> =
    std::collections::BTreeMap::new();
  for row in summary
    .principal_by_currency
    .iter()
    .chain(summary.by_currency.iter())
  {
    let p = row.payable.parse::<f64>().unwrap_or(0.0);
    let r = row.receivable.parse::<f64>().unwrap_or(0.0);
    let entry = by_code.entry(row.currency_code.clone()).or_insert((0.0, 0.0));
    entry.0 += p;
    entry.1 += r;
  }
  let mut parts = Vec::new();
  for (code, (gross_p, gross_r)) in by_code {
    let (p, r) = net_payable_receivable(gross_p, gross_r);
    if p > 1e-9 {
      parts.push(format!("{code} we owe {}", format_f64(p)));
    }
    if r > 1e-9 {
      parts.push(format!("{code} they owe us {}", format_f64(r)));
    }
  }
  Ok(parts)
}

const PARTNER_COMMISSION_EXPENSE: &str = "Partner Commission Expense";
const PARTNER_COMMISSION_INCOME: &str = "Partner Commission Income";
const HAWALA_CLEARING: &str = "Hawala Clearing";

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
    r#"INSERT INTO Wallet (id, name, type, customerId, userId, isActive, deletedAt, createdAt, updatedAt)
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
  /// COMMISSION (default) | PRINCIPAL
  pub balance_type: Option<String>,
  pub currency_code: String,
  pub amount: String,
  /// Optional — shop cash is always Main Vault.
  pub cash_wallet_id: Option<String>,
  pub notes: Option<String>,
  pub value_date: Option<String>,
  pub created_by_id: String,
  /// Soft-delete this settlement (+ its ledger tx) then re-post (edit).
  pub replace_settlement_id: Option<String>,
  /// CASH (default) | CUSTOMER_BALANCE — pay commission to linked customer wallet instead of vault.
  pub settlement_destination: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettlePartnerCommissionResult {
  pub settlement_id: String,
  pub transaction_id: String,
  pub reference: String,
  pub display_ref: String,
  pub kind: String,
  pub balance_type: String,
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
  let _ = input.created_by_id.trim();
  if partner_id.is_empty() {
    return Err(AppError::Validation("Partner is required.".into()));
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
  let balance_type = input
    .balance_type
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(|s| s.to_ascii_uppercase())
    .unwrap_or_else(|| "COMMISSION".to_string());
  if balance_type != "COMMISSION" && balance_type != "PRINCIPAL" {
    return Err(AppError::Validation(
      "Balance type must be COMMISSION or PRINCIPAL.".into(),
    ));
  }
  let is_principal = balance_type == "PRINCIPAL";

  let conn = state.db.lock();
  let actor = require_screen(&state, &conn, "partners")?;
  let created_by = actor.id.clone();
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
  let linked_customer_id: Option<String> = conn
    .query_row(
      "SELECT customerId FROM PartnerSarafi WHERE id = ?1 AND deletedAt IS NULL LIMIT 1",
      [&partner_id],
      |row| row.get::<_, Option<String>>(0),
    )
    .optional()?
    .flatten()
    .filter(|s: &String| !s.trim().is_empty());

  let credit_customer_balance = !is_principal && is_pay && linked_customer_id.is_some();

  let (currency_id, currency_code, places) = find_currency_by_code(&conn, &input.currency_code)?;
  let settle_minor = money_from_major_units(input.amount.trim(), places)?;
  if settle_minor <= 0 {
    return Err(AppError::Validation("Amount must be greater than zero.".into()));
  }
  let settle_major = money_to_major_unit_string(settle_minor, places)?;

  let cash_wallet_id = resolve_shop_cash_wallet_id(&conn, input.cash_wallet_id.as_deref())?;

  // Edit path: reverse the old settlement before posting the replacement.
  if let Some(replace_id) = input
    .replace_settlement_id
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
  {
    let old_tx: Option<String> = conn
      .query_row(
        r#"SELECT transactionId FROM PartnerCommissionSettlement
           WHERE id = ?1 AND partnerSarafiId = ?2 AND deletedAt IS NULL LIMIT 1"#,
        params![replace_id, partner_id],
        |row| row.get(0),
      )
      .optional()?;
    let Some(old_tx_id) = old_tx else {
      return Err(AppError::NotFound("Settlement to replace was not found.".into()));
    };
    let now_del = now_sqlite();
    conn.execute(
      r#"UPDATE PartnerCommissionSettlement
         SET deletedAt = ?1, updatedAt = ?1
         WHERE id = ?2 AND deletedAt IS NULL"#,
      params![now_del, replace_id],
    )?;
    soft_delete_transaction(&conn, &old_tx_id)?;
  }

  // Amount may exceed open kata: excess flips to the opposite side in balance math.
  // PRINCIPAL: prefer reversing partner-wallet opening, remainder via Hawala Clearing.

  let value_date = input
    .value_date
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(|s| s.to_string())
    .unwrap_or_else(now_sqlite);
  let memo = if is_principal {
    if is_pay {
      format!("Partner settlement paid to {partner_name}")
    } else {
      format!("Partner settlement collected from {partner_name}")
    }
  } else if is_pay {
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
    "PARTNER-{}-{}-{}",
    if is_principal { "HAW" } else { "COMM" },
    if is_pay { "PAY" } else { "COLLECT" },
    &uuid::Uuid::new_v4().to_string().replace('-', "")[..8].to_ascii_uppercase()
  );

  let settle_major_f = settle_major.parse::<f64>().unwrap_or(0.0);

  let entries = if is_principal {
    let (partner_wallet_id, wallet_bal) =
      partner_wallet_balance(&conn, &partner_id, &currency_id)?;
    let wallet_open = if is_pay {
      wallet_bal.max(0.0)
    } else {
      (-wallet_bal).max(0.0)
    };
    let wallet_part = settle_major_f.min(wallet_open).max(0.0);
    let clearing_part = (settle_major_f - wallet_part).max(0.0);

    let mut lines: Vec<PostingLineDto> = Vec::new();
    if wallet_part > 1e-9 {
      let Some(wid) = partner_wallet_id else {
        return Err(AppError::Validation(
          "Partner wallet was not found for opening settlement.".into(),
        ));
      };
      let wallet_minor = money_from_major_units(&format_f64(wallet_part), places)?;
      let equity_id = ensure_opening_equity(&conn)?;
      let equity_minor = wallet_minor
        .checked_mul(2)
        .ok_or_else(|| AppError::Validation("Amount too large.".into()))?;
      // Same cash+claim pattern as customer deposit/withdraw (Opening Equity ×2).
      if is_pay {
        lines.push(PostingLineDto {
          wallet_id: wid,
          currency: currency_code.clone(),
          direction: "CREDIT".into(),
          amount_minor: wallet_minor.to_string(),
          exchange_rate_id: None,
          memo: Some(memo.clone()),
        });
        lines.push(PostingLineDto {
          wallet_id: cash_wallet_id.clone(),
          currency: currency_code.clone(),
          direction: "CREDIT".into(),
          amount_minor: wallet_minor.to_string(),
          exchange_rate_id: None,
          memo: Some(memo.clone()),
        });
        lines.push(PostingLineDto {
          wallet_id: equity_id,
          currency: currency_code.clone(),
          direction: "DEBIT".into(),
          amount_minor: equity_minor.to_string(),
          exchange_rate_id: None,
          memo: Some("Balancing equity leg".into()),
        });
      } else {
        lines.push(PostingLineDto {
          wallet_id: wid,
          currency: currency_code.clone(),
          direction: "DEBIT".into(),
          amount_minor: wallet_minor.to_string(),
          exchange_rate_id: None,
          memo: Some(memo.clone()),
        });
        lines.push(PostingLineDto {
          wallet_id: cash_wallet_id.clone(),
          currency: currency_code.clone(),
          direction: "DEBIT".into(),
          amount_minor: wallet_minor.to_string(),
          exchange_rate_id: None,
          memo: Some(memo.clone()),
        });
        lines.push(PostingLineDto {
          wallet_id: equity_id,
          currency: currency_code.clone(),
          direction: "CREDIT".into(),
          amount_minor: equity_minor.to_string(),
          exchange_rate_id: None,
          memo: Some("Balancing equity leg".into()),
        });
      }
    }
    if clearing_part > 1e-9 {
      let clearing_id = ensure_system_wallet(&conn, HAWALA_CLEARING)?;
      let clearing_minor = money_from_major_units(&format_f64(clearing_part), places)?;
      if is_pay {
        lines.push(PostingLineDto {
          wallet_id: clearing_id,
          currency: currency_code.clone(),
          direction: "DEBIT".into(),
          amount_minor: clearing_minor.to_string(),
          exchange_rate_id: None,
          memo: Some(memo.clone()),
        });
        lines.push(PostingLineDto {
          wallet_id: cash_wallet_id.clone(),
          currency: currency_code.clone(),
          direction: "CREDIT".into(),
          amount_minor: clearing_minor.to_string(),
          exchange_rate_id: None,
          memo: Some(memo.clone()),
        });
      } else {
        lines.push(PostingLineDto {
          wallet_id: cash_wallet_id.clone(),
          currency: currency_code.clone(),
          direction: "DEBIT".into(),
          amount_minor: clearing_minor.to_string(),
          exchange_rate_id: None,
          memo: Some(memo.clone()),
        });
        lines.push(PostingLineDto {
          wallet_id: clearing_id,
          currency: currency_code.clone(),
          direction: "CREDIT".into(),
          amount_minor: clearing_minor.to_string(),
          exchange_rate_id: None,
          memo: Some(memo.clone()),
        });
      }
    }
    if lines.is_empty() {
      // No open wallet claim — fall back to full clearing path (allows over-collect/pay).
      let clearing_id = ensure_system_wallet(&conn, HAWALA_CLEARING)?;
      if is_pay {
        vec![
          PostingLineDto {
            wallet_id: clearing_id,
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
            wallet_id: clearing_id,
            currency: currency_code.clone(),
            direction: "CREDIT".into(),
            amount_minor: settle_minor.to_string(),
            exchange_rate_id: None,
            memo: Some(memo.clone()),
          },
        ]
      }
    } else {
      lines
    }
  } else {
    let pnl_wallet = ensure_system_wallet(
      &conn,
      if is_pay {
        PARTNER_COMMISSION_EXPENSE
      } else {
        PARTNER_COMMISSION_INCOME
      },
    )?;
    if is_pay {
      if credit_customer_balance {
        let cid = linked_customer_id.as_ref().expect("validated above");
        let customer_wallet = resolve_sole_customer_wallet(&conn, cid)?;
        let equity_id = ensure_opening_equity(&conn)?;
        let equity_minor = settle_minor
          .checked_mul(2)
          .ok_or_else(|| AppError::Validation("Amount too large.".into()))?;
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
            wallet_id: customer_wallet,
            currency: currency_code.clone(),
            direction: "DEBIT".into(),
            amount_minor: settle_minor.to_string(),
            exchange_rate_id: None,
            memo: Some("Commission credited to customer account".into()),
          },
          PostingLineDto {
            wallet_id: equity_id,
            currency: currency_code.clone(),
            direction: "CREDIT".into(),
            amount_minor: equity_minor.to_string(),
            exchange_rate_id: None,
            memo: Some("Balancing equity leg".into()),
          },
        ]
      } else {
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
      }
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
    }
  };

  conn.execute_batch("BEGIN IMMEDIATE;")?;
  let posted = match post_transaction_in_tx(
    &conn,
    PostTransactionInput {
      reference: reference.clone(),
      r#type: "ADJUSTMENT".into(),
      value_date: value_date.clone(),
      entries,
      customer_id: if credit_customer_balance {
        linked_customer_id.clone()
      } else {
        None
      },
      walk_in_name: None,
      walk_in_phone: None,
      description: notes.clone().or(Some(memo)),
      created_by_id: Some(created_by.clone()),
    },
  ) {
    Ok(posted) => posted,
    Err(e) => {
      let _ = conn.execute_batch("ROLLBACK;");
      return Err(e);
    }
  };

  let settlement_id = uuid::Uuid::new_v4().to_string();
  let now = now_sqlite();
  // cashWalletId is NOT NULL on the settlement row (schema). For customer-account
  // commission pay we still store Main Vault here, but the ledger does not post to it.
  if let Err(e) = conn.execute(
    r#"INSERT INTO PartnerCommissionSettlement (
         id, partnerSarafiId, kind, balanceType, currencyId, amount, cashWalletId,
         transactionId, notes, valueDate, createdById, createdAt, updatedAt
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12)"#,
    params![
      settlement_id,
      partner_id,
      kind_stored,
      balance_type,
      currency_id,
      settle_major,
      cash_wallet_id,
      posted.id,
      notes,
      value_date,
      created_by,
      now,
    ],
  ) {
    let _ = conn.execute_batch("ROLLBACK;");
    return Err(e.into());
  }
  if let Err(e) = conn.execute_batch("COMMIT;") {
    let _ = conn.execute_batch("ROLLBACK;");
    return Err(e.into());
  }

  Ok(SettlePartnerCommissionResult {
    settlement_id,
    transaction_id: posted.id,
    reference,
    display_ref: posted.display_ref,
    kind: kind_stored,
    balance_type,
    amount: settle_major,
    currency_code,
  })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListPartnerSettlementsInput {
  pub partner_sarafi_id: String,
  pub page: Option<i64>,
  pub page_size: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PartnerSettlementRow {
  pub id: String,
  pub kind: String,
  pub balance_type: String,
  pub currency_code: String,
  pub amount: String,
  pub notes: Option<String>,
  pub value_date: String,
  pub transaction_id: String,
  pub reference: String,
  pub display_ref: String,
  pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PartnerSettlementPage {
  pub items: Vec<PartnerSettlementRow>,
  pub total: i64,
  pub page: i64,
  pub page_size: i64,
}

#[tauri::command]
pub fn list_partner_settlements(
  state: State<'_, AppState>,
  input: ListPartnerSettlementsInput,
) -> Result<PartnerSettlementPage, AppError> {
  let partner_id = input.partner_sarafi_id.trim().to_string();
  if partner_id.is_empty() {
    return Err(AppError::Validation("Partner is required.".into()));
  }
  let page_size = input.page_size.unwrap_or(25).clamp(1, 100);
  let mut page = input.page.unwrap_or(1).max(1);
  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "partners")?;

  let exists: bool = conn.query_row(
    "SELECT EXISTS(SELECT 1 FROM PartnerSarafi WHERE id = ?1 AND deletedAt IS NULL)",
    [&partner_id],
    |row| row.get(0),
  )?;
  if !exists {
    return Err(AppError::NotFound("Partner sarafi was not found.".into()));
  }

  let total: i64 = conn.query_row(
    r#"SELECT COUNT(*) FROM PartnerCommissionSettlement
       WHERE partnerSarafiId = ?1 AND deletedAt IS NULL"#,
    [&partner_id],
    |row| row.get(0),
  )?;
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
    r#"
    SELECT s.id, s.kind, COALESCE(s.balanceType, 'COMMISSION'), c.code,
           CAST(s.amount AS TEXT), s.notes, s.valueDate, s.transactionId,
           COALESCE(t.reference, ''), IFNULL(t.displayRef, ''), s.createdAt
    FROM PartnerCommissionSettlement s
    INNER JOIN Currency c ON c.id = s.currencyId
    LEFT JOIN "Transaction" t ON t.id = s.transactionId
    WHERE s.partnerSarafiId = ?1 AND s.deletedAt IS NULL
    ORDER BY s.valueDate DESC, s.createdAt DESC
    LIMIT ?2 OFFSET ?3
    "#,
  )?;
  let items = stmt
    .query_map(params![partner_id, page_size, offset], |row| {
      Ok(PartnerSettlementRow {
        id: row.get(0)?,
        kind: row.get(1)?,
        balance_type: row.get(2)?,
        currency_code: row.get(3)?,
        amount: row.get(4)?,
        notes: row.get(5)?,
        value_date: row.get(6)?,
        transaction_id: row.get(7)?,
        reference: row.get(8)?,
        display_ref: row.get(9)?,
        created_at: row.get(10)?,
      })
    })?
    .collect::<Result<Vec<_>, _>>()?;

  Ok(PartnerSettlementPage {
    items,
    total,
    page,
    page_size,
  })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeletePartnerSettlementInput {
  pub id: String,
  pub partner_sarafi_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeletePartnerSettlementResult {
  pub id: String,
  pub deleted: bool,
}

#[tauri::command]
pub fn delete_partner_settlement(
  state: State<'_, AppState>,
  input: DeletePartnerSettlementInput,
) -> Result<DeletePartnerSettlementResult, AppError> {
  let id = input.id.trim().to_string();
  let partner_id = input.partner_sarafi_id.trim().to_string();
  if id.is_empty() {
    return Err(AppError::Validation("Settlement id is required.".into()));
  }
  if partner_id.is_empty() {
    return Err(AppError::Validation("Partner is required.".into()));
  }

  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "partners")?;
  let old_tx: Option<String> = conn
    .query_row(
      r#"SELECT transactionId FROM PartnerCommissionSettlement
         WHERE id = ?1 AND partnerSarafiId = ?2 AND deletedAt IS NULL LIMIT 1"#,
      params![id, partner_id],
      |row| row.get(0),
    )
    .optional()?;
  let Some(old_tx_id) = old_tx else {
    return Err(AppError::NotFound("Settlement was not found.".into()));
  };

  let now = now_sqlite();
  conn.execute(
    r#"UPDATE PartnerCommissionSettlement
       SET deletedAt = ?1, updatedAt = ?1
       WHERE id = ?2 AND deletedAt IS NULL"#,
    params![now, id],
  )?;
  soft_delete_transaction(&conn, &old_tx_id)?;

  Ok(DeletePartnerSettlementResult {
    id,
    deleted: true,
  })
}
