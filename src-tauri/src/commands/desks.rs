//! Latest exchange rates + hawala list (SQL pagination).

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::AppError;
use crate::state::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExchangeRateItem {
  pub id: String,
  pub base_code: String,
  pub quote_code: String,
  pub rate: String,
  pub effective_at: String,
}

#[tauri::command]
pub fn list_latest_exchange_rates(
  state: State<'_, AppState>,
) -> Result<Vec<ExchangeRateItem>, AppError> {
  let conn = state.db.lock();
  // Latest non-deleted rate per base/quote pair (as-of now).
  let mut stmt = conn.prepare(
    "SELECT er.id, bc.code, qc.code, CAST(er.rate AS TEXT), er.effectiveAt
     FROM ExchangeRate er
     INNER JOIN Currency bc ON bc.id = er.baseCurrencyId
     INNER JOIN Currency qc ON qc.id = er.quoteCurrencyId
     INNER JOIN (
       SELECT baseCurrencyId, quoteCurrencyId, MAX(effectiveAt) AS maxEffective
       FROM ExchangeRate
       WHERE deletedAt IS NULL
       GROUP BY baseCurrencyId, quoteCurrencyId
     ) latest
       ON latest.baseCurrencyId = er.baseCurrencyId
      AND latest.quoteCurrencyId = er.quoteCurrencyId
      AND latest.maxEffective = er.effectiveAt
     WHERE er.deletedAt IS NULL
     ORDER BY bc.code ASC, qc.code ASC",
  )?;
  let items = stmt
    .query_map([], |row| {
      Ok(ExchangeRateItem {
        id: row.get(0)?,
        base_code: row.get(1)?,
        quote_code: row.get(2)?,
        rate: row.get(3)?,
        effective_at: row.get(4)?,
      })
    })?
    .collect::<Result<Vec<_>, _>>()?;
  Ok(items)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListHawalaInput {
  pub page: Option<i64>,
  pub page_size: Option<i64>,
  pub direction: Option<String>,
  pub search: Option<String>,
  pub archive_filter: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HawalaListItem {
  pub id: String,
  pub reference: String,
  pub direction: String,
  pub status: String,
  pub sender_name: Option<String>,
  pub receiver_name: Option<String>,
  pub partner_sarafi: Option<String>,
  pub amount: String,
  pub currency_code: String,
  pub value_date: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HawalaListPage {
  pub items: Vec<HawalaListItem>,
  pub total: i64,
  pub page: i64,
  pub page_size: i64,
}

#[tauri::command]
pub fn list_hawala_page(
  state: State<'_, AppState>,
  input: ListHawalaInput,
) -> Result<HawalaListPage, AppError> {
  let page_size = input.page_size.unwrap_or(25).clamp(1, 100);
  let mut page = input.page.unwrap_or(1).max(1);
  let archive = input
    .archive_filter
    .as_deref()
    .unwrap_or("active")
    .to_ascii_lowercase();

  let conn = state.db.lock();
  let mut where_sql = String::from("WHERE 1=1");
  let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

  match archive.as_str() {
    "archived" => where_sql.push_str(" AND h.deletedAt IS NOT NULL"),
    "all" => {}
    _ => where_sql.push_str(" AND h.deletedAt IS NULL"),
  }

  if let Some(ref d) = input.direction {
    let d = d.trim().to_ascii_uppercase();
    if d == "SEND" || d == "RECEIVE" {
      where_sql.push_str(" AND h.direction = ?");
      params.push(Box::new(d));
    }
  }

  if let Some(ref q) = input.search {
    let q = q.trim();
    if !q.is_empty() {
      where_sql.push_str(
        " AND (
          h.reference LIKE ?
          OR IFNULL(h.senderName,'') LIKE ?
          OR IFNULL(h.receiverName,'') LIKE ?
          OR IFNULL(h.partnerSarafi,'') LIKE ?
        )",
      );
      let like = format!("%{q}%");
      params.push(Box::new(like.clone()));
      params.push(Box::new(like.clone()));
      params.push(Box::new(like.clone()));
      params.push(Box::new(like));
    }
  }

  let count_sql = format!("SELECT COUNT(*) FROM HawalaTransfer h {where_sql}");
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

  let list_sql = format!(
    "SELECT h.id, h.reference, h.direction, h.status, h.senderName, h.receiverName,
            h.partnerSarafi, CAST(h.amount AS TEXT), c.code, h.valueDate
     FROM HawalaTransfer h
     INNER JOIN Currency c ON c.id = h.currencyId
     {where_sql}
     ORDER BY h.valueDate DESC, h.createdAt DESC
     LIMIT ? OFFSET ?"
  );
  let mut list_params = params;
  list_params.push(Box::new(page_size));
  list_params.push(Box::new(offset));
  let list_refs: Vec<&dyn rusqlite::types::ToSql> =
    list_params.iter().map(|p| p.as_ref()).collect();

  let mut stmt = conn.prepare(&list_sql)?;
  let items = stmt
    .query_map(list_refs.as_slice(), |row| {
      Ok(HawalaListItem {
        id: row.get(0)?,
        reference: row.get(1)?,
        direction: row.get(2)?,
        status: row.get(3)?,
        sender_name: row.get(4)?,
        receiver_name: row.get(5)?,
        partner_sarafi: row.get(6)?,
        amount: row.get(7)?,
        currency_code: row.get(8)?,
        value_date: row.get(9)?,
      })
    })?
    .collect::<Result<Vec<_>, _>>()?;

  Ok(HawalaListPage {
    items,
    total,
    page,
    page_size,
  })
}
