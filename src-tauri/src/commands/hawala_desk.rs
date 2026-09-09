//! Hawala desk lifecycle: detail, list filters, status, archive, events, sender context.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::AppError;
use crate::state::AppState;
use crate::util::{format_f64, now_sqlite};
use crate::commands::authorize::{require_screen};

fn trim_opt(value: Option<String>) -> Option<String> {
  value
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty())
}

fn require_id(id: &str) -> Result<String, AppError> {
  let id = id.trim().to_string();
  if id.is_empty() {
    return Err(AppError::Validation("Hawala id is required.".into()));
  }
  Ok(id)
}

pub fn record_hawala_event(
  conn: &Connection,
  hawala_id: &str,
  event_type: &str,
  from_status: Option<&str>,
  to_status: Option<&str>,
  summary: &str,
  old_value: Option<&str>,
  new_value: Option<&str>,
  reason: Option<&str>,
  actor_user_id: Option<&str>,
) -> Result<(), AppError> {
  // Table may be missing on older DBs until migration; ignore soft-fail only if table missing.
  let exists: bool = conn.query_row(
    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='HawalaEvent')",
    [],
    |row| row.get(0),
  )?;
  if !exists {
    return Ok(());
  }
  conn.execute(
    r#"INSERT INTO HawalaEvent (
         id, hawalaTransferId, eventType, fromStatus, toStatus, summary,
         oldValue, newValue, reason, actorUserId, createdAt
       ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)"#,
    params![
      uuid::Uuid::new_v4().to_string(),
      hawala_id,
      event_type,
      from_status,
      to_status,
      summary,
      old_value,
      new_value,
      reason,
      actor_user_id,
      now_sqlite(),
    ],
  )?;
  Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HawalaIdInput {
  pub id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListHawalaDeskInput {
  pub page: Option<i64>,
  pub page_size: Option<i64>,
  pub search: Option<String>,
  pub direction: Option<String>,
  pub status: Option<String>,
  pub partner_sarafi_id: Option<String>,
  pub currency_code: Option<String>,
  pub country: Option<String>,
  pub city: Option<String>,
  pub customer_id: Option<String>,
  pub walking_only: Option<bool>,
  pub amount_min: Option<String>,
  pub amount_max: Option<String>,
  pub date_from: Option<String>,
  pub date_to: Option<String>,
  pub archive_filter: Option<String>,
  pub sort: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HawalaListItemRich {
  pub id: String,
  pub reference: String,
  pub display_ref: String,
  pub direction: String,
  pub status: String,
  pub priority: Option<String>,
  pub sender_name: Option<String>,
  pub receiver_name: Option<String>,
  pub partner_sarafi: Option<String>,
  pub destination_city: Option<String>,
  pub destination_country: Option<String>,
  pub amount: String,
  pub currency_code: String,
  pub own_commission: Option<String>,
  pub partner_commission: Option<String>,
  pub value_date: String,
  pub created_by_name: Option<String>,
  pub is_archived: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HawalaListCommissionTotal {
  pub currency_code: String,
  pub total: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HawalaListPageRich {
  pub items: Vec<HawalaListItemRich>,
  pub total: i64,
  pub page: i64,
  pub page_size: i64,
  pub pending: i64,
  pub completed: i64,
  pub commission_totals: Vec<HawalaListCommissionTotal>,
}

#[tauri::command]
pub fn list_hawala_desk(
  state: State<'_, AppState>,
  input: ListHawalaDeskInput,
) -> Result<HawalaListPageRich, AppError> {
  let page_size = input.page_size.unwrap_or(25).clamp(1, 100);
  let mut page = input.page.unwrap_or(1).max(1);
  let archive = input
    .archive_filter
    .as_deref()
    .unwrap_or("active")
    .to_ascii_lowercase();

  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "hawala")?;
  let mut where_sql = String::from("WHERE 1=1");
  let mut params_v: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

  match archive.as_str() {
    "archived" => where_sql.push_str(" AND h.deletedAt IS NOT NULL"),
    "all" => {}
    _ => where_sql.push_str(" AND h.deletedAt IS NULL"),
  }

  if let Some(ref d) = input.direction {
    let d = d.trim().to_ascii_uppercase();
    if d == "SEND" || d == "RECEIVE" {
      where_sql.push_str(" AND h.direction = ?");
      params_v.push(Box::new(d));
    }
  }
  if let Some(ref s) = input.status {
    let s = s.trim().to_ascii_uppercase();
    if !s.is_empty() && s != "ALL" {
      where_sql.push_str(" AND h.status = ?");
      params_v.push(Box::new(s));
    }
  }
  if let Some(ref pid) = input.partner_sarafi_id {
    let pid = pid.trim();
    if !pid.is_empty() {
      where_sql.push_str(" AND h.partnerSarafiId = ?");
      params_v.push(Box::new(pid.to_string()));
    }
  }
  if let Some(ref code) = input.currency_code {
    let code = code.trim().to_ascii_uppercase();
    if !code.is_empty() && code != "ALL" {
      where_sql.push_str(" AND c.code = ?");
      params_v.push(Box::new(code));
    }
  }
  if let Some(ref country) = input.country {
    let country = country.trim();
    if !country.is_empty() {
      where_sql.push_str(" AND h.destinationCountry LIKE ?");
      params_v.push(Box::new(format!("%{country}%")));
    }
  }
  if let Some(ref city) = input.city {
    let city = city.trim();
    if !city.is_empty() {
      where_sql.push_str(" AND h.destinationCity LIKE ?");
      params_v.push(Box::new(format!("%{city}%")));
    }
  }
  if let Some(ref cid) = input.customer_id {
    let cid = cid.trim();
    if !cid.is_empty() {
      where_sql.push_str(
        " AND (h.customerId = ? OR h.senderCustomerId = ? OR h.receiverCustomerId = ?)",
      );
      params_v.push(Box::new(cid.to_string()));
      params_v.push(Box::new(cid.to_string()));
      params_v.push(Box::new(cid.to_string()));
    }
  }
  if input.walking_only == Some(true) {
    where_sql.push_str(" AND h.senderCustomerId IS NULL AND h.receiverCustomerId IS NULL");
  }
  if let Some(ref amin) = input.amount_min {
    let amin = amin.trim();
    if !amin.is_empty() {
      where_sql.push_str(" AND CAST(h.amount AS REAL) >= CAST(? AS REAL)");
      params_v.push(Box::new(amin.to_string()));
    }
  }
  if let Some(ref amax) = input.amount_max {
    let amax = amax.trim();
    if !amax.is_empty() {
      where_sql.push_str(" AND CAST(h.amount AS REAL) <= CAST(? AS REAL)");
      params_v.push(Box::new(amax.to_string()));
    }
  }
  if let Some(ref from) = input.date_from {
    let from = from.trim();
    if !from.is_empty() {
      where_sql.push_str(" AND h.valueDate >= date(?)");
      params_v.push(Box::new(from.to_string()));
    }
  }
  if let Some(ref to) = input.date_to {
    let to = to.trim();
    if !to.is_empty() {
      where_sql.push_str(" AND h.valueDate < date(?, '+1 day')");
      params_v.push(Box::new(to.to_string()));
    }
  }
  if let Some(ref q) = input.search {
    let q = q.trim();
    if !q.is_empty() {
      where_sql.push_str(
        " AND (
          h.reference LIKE ?
          OR IFNULL(t.displayRef,'') LIKE ?
          OR IFNULL(t.reference,'') LIKE ?
          OR IFNULL(h.senderName,'') LIKE ?
          OR IFNULL(h.receiverName,'') LIKE ?
          OR IFNULL(h.partnerSarafi,'') LIKE ?
          OR IFNULL(h.destinationCity,'') LIKE ?
        )",
      );
      // Support * as wildcard; otherwise contains-match (%term%).
      let like = {
        let patterned = q.replace('*', "%");
        if patterned.contains('%') || patterned.contains('_') {
          patterned
        } else {
          format!("%{patterned}%")
        }
      };
      for _ in 0..7 {
        params_v.push(Box::new(like.clone()));
      }
    }
  }

  let order = match input.sort.as_deref().unwrap_or("date_desc") {
    "date_asc" => crate::ledger::HAWALA_CHRONO_ASC,
    "amount_desc" => "CAST(h.amount AS REAL) DESC, t.displaySeq IS NULL, t.displaySeq ASC",
    "amount_asc" => "CAST(h.amount AS REAL) ASC, t.displaySeq IS NULL, t.displaySeq ASC",
    "ref_asc" => "h.reference ASC, t.displaySeq IS NULL, t.displaySeq ASC",
    _ => crate::ledger::HAWALA_CHRONO_DESC,
  };

  let from_sql = r#"FROM HawalaTransfer h
     INNER JOIN Currency c ON c.id = h.currencyId
     LEFT JOIN "Transaction" t ON t.id = h.transactionId"#;
  let refs: Vec<&dyn rusqlite::types::ToSql> = params_v.iter().map(|p| p.as_ref()).collect();

  let count_sql = format!(
    "SELECT COUNT(*),
            COALESCE(SUM(CASE WHEN UPPER(h.status) = 'PENDING' THEN 1.0 ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN UPPER(h.status) = 'COMPLETED' THEN 1.0 ELSE 0 END), 0)
     {from_sql}
     {where_sql}"
  );
  let (total, pending, completed): (i64, i64, i64) =
    conn.query_row(&count_sql, refs.as_slice(), |row| {
      Ok((
        row.get::<_, i64>(0)?,
        row.get::<_, f64>(1)? as i64,
        row.get::<_, f64>(2)? as i64,
      ))
    })?;

  let commission_sql = format!(
    "SELECT c.code,
            COALESCE(SUM(CAST(COALESCE(h.ownCommissionAmount, 0) AS REAL)), 0)
     {from_sql}
     {where_sql}
     GROUP BY c.code
     ORDER BY c.code"
  );
  let mut commission_stmt = conn.prepare(&commission_sql)?;
  let commission_totals = commission_stmt
    .query_map(refs.as_slice(), |row| {
      Ok(HawalaListCommissionTotal {
        currency_code: row.get(0)?,
        total: format_f64(row.get::<_, f64>(1)?),
      })
    })?
    .collect::<Result<Vec<_>, _>>()?;
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
    "SELECT h.id, h.reference, h.direction, h.status, h.priority,
            h.senderName, h.receiverName, h.partnerSarafi,
            h.destinationCity, h.destinationCountry,
            CAST(h.amount AS TEXT), c.code,
            CAST(h.ownCommissionAmount AS TEXT), CAST(h.commissionAmount AS TEXT),
            h.valueDate, u.fullName, h.deletedAt, IFNULL(t.displayRef,'')
     FROM HawalaTransfer h
     INNER JOIN Currency c ON c.id = h.currencyId
     LEFT JOIN User u ON u.id = h.createdById
     LEFT JOIN \"Transaction\" t ON t.id = h.transactionId
     {where_sql}
     ORDER BY {order}
     LIMIT ? OFFSET ?"
  );
  let mut list_params = params_v;
  list_params.push(Box::new(page_size));
  list_params.push(Box::new(offset));
  let list_refs: Vec<&dyn rusqlite::types::ToSql> =
    list_params.iter().map(|p| p.as_ref()).collect();
  let mut stmt = conn.prepare(&list_sql)?;
  let items = stmt
    .query_map(list_refs.as_slice(), |row| {
      let deleted: Option<String> = row.get(16)?;
      Ok(HawalaListItemRich {
        id: row.get(0)?,
        reference: row.get(1)?,
        display_ref: row.get(17)?,
        direction: row.get(2)?,
        status: row.get(3)?,
        priority: row.get(4)?,
        sender_name: row.get(5)?,
        receiver_name: row.get(6)?,
        partner_sarafi: row.get(7)?,
        destination_city: row.get(8)?,
        destination_country: row.get(9)?,
        amount: row.get(10)?,
        currency_code: row.get(11)?,
        own_commission: row.get(12)?,
        partner_commission: row.get(13)?,
        value_date: row.get(14)?,
        created_by_name: row.get(15)?,
        is_archived: deleted.is_some(),
      })
    })?
    .collect::<Result<Vec<_>, _>>()?;

  Ok(HawalaListPageRich {
    items,
    total,
    page,
    page_size,
    pending,
    completed,
    commission_totals,
  })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HawalaDetail {
  pub id: String,
  pub reference: String,
  pub display_ref: String,
  pub direction: String,
  pub status: String,
  pub priority: Option<String>,
  pub purpose: Option<String>,
  pub sender_name: String,
  pub sender_phone: Option<String>,
  pub sender_national_id: Option<String>,
  pub sender_address: Option<String>,
  pub sender_customer_id: Option<String>,
  pub receiver_name: String,
  pub receiver_phone: Option<String>,
  pub receiver_national_id: Option<String>,
  pub receiver_address: Option<String>,
  pub receiver_reference: Option<String>,
  pub receiver_customer_id: Option<String>,
  pub partner_sarafi: String,
  pub partner_sarafi_id: Option<String>,
  pub partner_branch: Option<String>,
  pub origin_city: String,
  pub origin_country: String,
  pub destination_city: String,
  pub destination_country: String,
  pub special_instructions: Option<String>,
  pub currency_code: String,
  pub amount: String,
  pub receive_currency_code: Option<String>,
  pub receive_amount: Option<String>,
  pub exchange_rate: Option<String>,
  pub own_commission_amount: Option<String>,
  pub partner_commission_amount: Option<String>,
  pub additional_charges: Option<String>,
  pub discount_amount: Option<String>,
  pub own_commission_mode: Option<String>,
  pub partner_commission_mode: Option<String>,
  pub settlement_type: Option<String>,
  pub settlement_date: Option<String>,
  pub settlement_notes: Option<String>,
  pub notes: Option<String>,
  pub internal_notes: Option<String>,
  pub customer_notes: Option<String>,
  pub private_notes: Option<String>,
  pub cash_wallet_id: String,
  pub value_date: String,
  pub expected_delivery_date: Option<String>,
  pub expected_delivery_time: Option<String>,
  pub created_by_id: String,
  pub created_by_name: Option<String>,
  pub transaction_id: Option<String>,
  pub payout_transaction_id: Option<String>,
  pub payout_display_ref: Option<String>,
  pub created_at: String,
  pub updated_at: String,
  pub sent_at: Option<String>,
  pub received_at: Option<String>,
  pub completed_at: Option<String>,
  pub cancelled_at: Option<String>,
  pub returned_at: Option<String>,
  pub deleted_at: Option<String>,
  pub events: Vec<HawalaEventItem>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HawalaEventItem {
  pub id: String,
  pub event_type: String,
  pub from_status: Option<String>,
  pub to_status: Option<String>,
  pub summary: String,
  pub reason: Option<String>,
  pub actor_name: Option<String>,
  pub created_at: String,
}

fn load_events(conn: &Connection, hawala_id: &str) -> Result<Vec<HawalaEventItem>, AppError> {
  let exists: bool = conn.query_row(
    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='HawalaEvent')",
    [],
    |row| row.get(0),
  )?;
  if !exists {
    return Ok(vec![]);
  }
  let mut stmt = conn.prepare(
    r#"SELECT e.id, e.eventType, e.fromStatus, e.toStatus, e.summary, e.reason,
              u.fullName, e.createdAt
       FROM HawalaEvent e
       LEFT JOIN User u ON u.id = e.actorUserId
       WHERE e.hawalaTransferId = ?1
       ORDER BY e.createdAt ASC"#,
  )?;
  let items = stmt
    .query_map([hawala_id], |row| {
      Ok(HawalaEventItem {
        id: row.get(0)?,
        event_type: row.get(1)?,
        from_status: row.get(2)?,
        to_status: row.get(3)?,
        summary: row.get(4)?,
        reason: row.get(5)?,
        actor_name: row.get(6)?,
        created_at: row.get(7)?,
      })
    })?
    .collect::<Result<Vec<_>, _>>()?;
  Ok(items)
}

pub(crate) fn map_detail(conn: &Connection, id: &str) -> Result<HawalaDetail, AppError> {
  // Prefer extended columns; fall back carefully via COALESCE / IFNULL for missing cols is hard —
  // migration must have run. Query assumes new columns exist.
  let row = conn.query_row(
    r#"SELECT
         h.id, h.reference, h.direction, h.status, h.priority, h.purpose,
         h.senderName, h.senderPhone, h.senderNationalId, h.senderAddress, h.senderCustomerId,
         h.receiverName, h.receiverPhone, h.receiverNationalId, h.receiverAddress,
         h.receiverReference, h.receiverCustomerId,
         h.partnerSarafi, h.partnerSarafiId, h.partnerBranch,
         h.originCity, h.originCountry, h.destinationCity, h.destinationCountry,
         h.specialInstructions,
         c.code, CAST(h.amount AS TEXT),
         rc.code, CAST(h.receiveAmount AS TEXT), CAST(h.exchangeRate AS TEXT),
         CAST(h.ownCommissionAmount AS TEXT), CAST(h.commissionAmount AS TEXT),
         CAST(h.additionalCharges AS TEXT), CAST(h.discountAmount AS TEXT),
         h.ownCommissionMode, h.partnerCommissionMode,
         h.settlementType, h.settlementDate, h.settlementNotes,
         h.notes, h.internalNotes, h.customerNotes, h.privateNotes,
         h.cashWalletId, h.valueDate, h.expectedDeliveryDate, h.expectedDeliveryTime,
         h.createdById, u.fullName, h.transactionId, h.payoutTransactionId, h.createdAt, h.updatedAt,
         h.sentAt, h.receivedAt, h.completedAt, h.cancelledAt, h.returnedAt, h.deletedAt
       FROM HawalaTransfer h
       INNER JOIN Currency c ON c.id = h.currencyId
       LEFT JOIN Currency rc ON rc.id = h.receiveCurrencyId
       LEFT JOIN User u ON u.id = h.createdById
       WHERE h.id = ?1
       LIMIT 1"#,
    [id],
    |row| {
      Ok(HawalaDetail {
        id: row.get(0)?,
        reference: row.get(1)?,
        display_ref: String::new(),
        direction: row.get(2)?,
        status: row.get(3)?,
        priority: row.get(4)?,
        purpose: row.get(5)?,
        sender_name: row.get(6)?,
        sender_phone: row.get(7)?,
        sender_national_id: row.get(8)?,
        sender_address: row.get(9)?,
        sender_customer_id: row.get(10)?,
        receiver_name: row.get(11)?,
        receiver_phone: row.get(12)?,
        receiver_national_id: row.get(13)?,
        receiver_address: row.get(14)?,
        receiver_reference: row.get(15)?,
        receiver_customer_id: row.get(16)?,
        partner_sarafi: row.get(17)?,
        partner_sarafi_id: row.get(18)?,
        partner_branch: row.get(19)?,
        origin_city: row.get(20)?,
        origin_country: row.get(21)?,
        destination_city: row.get(22)?,
        destination_country: row.get(23)?,
        special_instructions: row.get(24)?,
        currency_code: row.get(25)?,
        amount: row.get(26)?,
        receive_currency_code: row.get(27)?,
        receive_amount: row.get(28)?,
        exchange_rate: row.get(29)?,
        own_commission_amount: row.get(30)?,
        partner_commission_amount: row.get(31)?,
        additional_charges: row.get(32)?,
        discount_amount: row.get(33)?,
        own_commission_mode: row.get(34)?,
        partner_commission_mode: row.get(35)?,
        settlement_type: row.get(36)?,
        settlement_date: row.get(37)?,
        settlement_notes: row.get(38)?,
        notes: row.get(39)?,
        internal_notes: row.get(40)?,
        customer_notes: row.get(41)?,
        private_notes: row.get(42)?,
        cash_wallet_id: row.get(43)?,
        value_date: row.get(44)?,
        expected_delivery_date: row.get(45)?,
        expected_delivery_time: row.get(46)?,
        created_by_id: row.get(47)?,
        created_by_name: row.get(48)?,
        transaction_id: row.get(49)?,
        payout_transaction_id: row.get(50)?,
        payout_display_ref: None,
        created_at: row.get(51)?,
        updated_at: row.get(52)?,
        sent_at: row.get(53)?,
        received_at: row.get(54)?,
        completed_at: row.get(55)?,
        cancelled_at: row.get(56)?,
        returned_at: row.get(57)?,
        deleted_at: row.get(58)?,
        events: vec![],
      })
    },
  );
  let mut detail = row.map_err(|e| match e {
    rusqlite::Error::QueryReturnedNoRows => AppError::NotFound("Hawala was not found.".into()),
    other => other.into(),
  })?;
  detail.events = load_events(conn, id)?;
  if let Some(tid) = detail
    .transaction_id
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
  {
    if let Ok(shown) = conn.query_row(
      r#"SELECT IFNULL(displayRef, '') FROM "Transaction" WHERE id = ?1"#,
      [tid],
      |row| row.get::<_, String>(0),
    ) {
      if !shown.trim().is_empty() {
        detail.display_ref = shown;
      }
    }
  }
  if let Some(tid) = detail
    .payout_transaction_id
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
  {
    if let Ok(shown) = conn.query_row(
      r#"SELECT IFNULL(displayRef, '') FROM "Transaction" WHERE id = ?1"#,
      [tid],
      |row| row.get::<_, String>(0),
    ) {
      if !shown.trim().is_empty() {
        detail.payout_display_ref = Some(shown);
      }
    }
  }
  Ok(detail)
}

#[tauri::command]
pub fn get_hawala(
  state: State<'_, AppState>,
  input: HawalaIdInput,
) -> Result<HawalaDetail, AppError> {
  let id = require_id(&input.id)?;
  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "hawala")?;
  // Accept HawalaTransfer.id or linked Transaction.id (dashboard recent activity).
  let hawala_id: String = conn
    .query_row(
      "SELECT id FROM HawalaTransfer
       WHERE (id = ?1 OR transactionId = ?1 OR payoutTransactionId = ?1) AND deletedAt IS NULL
       LIMIT 1",
      [&id],
      |row| row.get(0),
    )
    .or_else(|_| {
      conn.query_row(
        "SELECT id FROM HawalaTransfer WHERE id = ?1 OR transactionId = ?1 OR payoutTransactionId = ?1 LIMIT 1",
        [&id],
        |row| row.get(0),
      )
    })
    .map_err(|e| match e {
      rusqlite::Error::QueryReturnedNoRows => {
        AppError::NotFound("Hawala was not found.".into())
      }
      other => other.into(),
    })?;
  map_detail(&conn, &hawala_id)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetHawalaStatusInput {
  pub id: String,
  pub status: String,
  pub reason: Option<String>,
  pub actor_user_id: Option<String>,
}

fn allowed_transition(from: &str, to: &str) -> bool {
  let from = from.to_ascii_uppercase();
  let to = to.to_ascii_uppercase();
  matches!(
    (from.as_str(), to.as_str()),
    ("PENDING", "SENT")
      | ("PENDING", "CANCELLED")
      | ("PENDING", "RETURNED")
      | ("SENT", "RECEIVED")
      | ("SENT", "COMPLETED")
      | ("SENT", "CANCELLED")
      | ("SENT", "RETURNED")
      | ("RECEIVED", "COMPLETED")
      | ("RECEIVED", "RETURNED")
      | ("COMPLETED", "RETURNED")
  )
}

#[tauri::command]
pub fn set_hawala_status(
  state: State<'_, AppState>,
  input: SetHawalaStatusInput,
) -> Result<HawalaDetail, AppError> {
  let id = require_id(&input.id)?;
  let to = input.status.trim().to_ascii_uppercase();
  let allowed = [
    "PENDING", "SENT", "RECEIVED", "COMPLETED", "CANCELLED", "RETURNED",
  ];
  if !allowed.contains(&to.as_str()) {
    return Err(AppError::Validation("Invalid hawala status.".into()));
  }
  let conn = state.db.lock();
  let actor = require_screen(&state, &conn, "hawala")?;
  let (from, deleted): (String, Option<String>) = conn.query_row(
    "SELECT status, deletedAt FROM HawalaTransfer WHERE id = ?1 LIMIT 1",
    [&id],
    |row| Ok((row.get(0)?, row.get(1)?)),
  )?;
  if deleted.is_some() {
    return Err(AppError::Validation(
      "Archived hawala cannot change status. Restore it first.".into(),
    ));
  }
  if from.eq_ignore_ascii_case(&to) {
    return map_detail(&conn, &id);
  }
  if !allowed_transition(&from, &to) {
    return Err(AppError::Validation(format!(
      "Cannot change status from {from} to {to}."
    )));
  }
  if from.eq_ignore_ascii_case("COMPLETED") && to.eq_ignore_ascii_case("CANCELLED") {
    return Err(AppError::Validation(
      "Completed hawala cannot be cancelled. Archive it instead.".into(),
    ));
  }

  let now = now_sqlite();
  match to.as_str() {
    "SENT" => {
      conn.execute(
        "UPDATE HawalaTransfer SET status=?1, sentAt=?2, updatedAt=?2 WHERE id=?3",
        params![to, now, id],
      )?;
    }
    "RECEIVED" => {
      conn.execute(
        "UPDATE HawalaTransfer SET status=?1, receivedAt=?2, updatedAt=?2 WHERE id=?3",
        params![to, now, id],
      )?;
    }
    "COMPLETED" => {
      conn.execute(
        "UPDATE HawalaTransfer SET status=?1, completedAt=?2, updatedAt=?2 WHERE id=?3",
        params![to, now, id],
      )?;
    }
    "CANCELLED" => {
      conn.execute(
        "UPDATE HawalaTransfer SET status=?1, cancelledAt=?2, updatedAt=?2 WHERE id=?3",
        params![to, now, id],
      )?;
    }
    "RETURNED" => {
      conn.execute(
        "UPDATE HawalaTransfer SET status=?1, returnedAt=?2, updatedAt=?2 WHERE id=?3",
        params![to, now, id],
      )?;
    }
    _ => {
      conn.execute(
        "UPDATE HawalaTransfer SET status=?1, updatedAt=?2 WHERE id=?3",
        params![to, now, id],
      )?;
    }
  }
  let reason = trim_opt(input.reason);
  record_hawala_event(
    &conn,
    &id,
    "STATUS_CHANGE",
    Some(&from),
    Some(&to),
    &format!("Status {from} → {to}"),
    Some(&from),
    Some(&to),
    reason.as_deref(),
    Some(actor.id.as_str()),
  )?;
  map_detail(&conn, &id)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveHawalaInput {
  pub id: String,
  pub actor_user_id: Option<String>,
  pub reason: Option<String>,
}

#[tauri::command]
pub fn archive_hawala(
  state: State<'_, AppState>,
  input: ArchiveHawalaInput,
) -> Result<HawalaDetail, AppError> {
  let id = require_id(&input.id)?;
  let conn = state.db.lock();
  let actor = require_screen(&state, &conn, "hawala")?;
  let (status, deleted): (String, Option<String>) = conn.query_row(
    "SELECT status, deletedAt FROM HawalaTransfer WHERE id = ?1",
    [&id],
    |row| Ok((row.get(0)?, row.get(1)?)),
  )?;
  if deleted.is_some() {
    return Err(AppError::Validation("Hawala is already archived.".into()));
  }
  let now = now_sqlite();
  conn.execute(
    "UPDATE HawalaTransfer SET deletedAt = ?1, updatedAt = ?1 WHERE id = ?2",
    params![now, id],
  )?;
  record_hawala_event(
    &conn,
    &id,
    "ARCHIVE",
    Some(&status),
    Some(&status),
    "Hawala archived",
    None,
    None,
    trim_opt(input.reason).as_deref(),
    Some(actor.id.as_str()),
  )?;
  map_detail(&conn, &id)
}

#[tauri::command]
pub fn restore_hawala(
  state: State<'_, AppState>,
  input: ArchiveHawalaInput,
) -> Result<HawalaDetail, AppError> {
  let id = require_id(&input.id)?;
  let conn = state.db.lock();
  let actor = require_screen(&state, &conn, "hawala")?;
  let (status, deleted): (String, Option<String>) = conn.query_row(
    "SELECT status, deletedAt FROM HawalaTransfer WHERE id = ?1",
    [&id],
    |row| Ok((row.get(0)?, row.get(1)?)),
  )?;
  if deleted.is_none() {
    return Err(AppError::Validation("Hawala is not archived.".into()));
  }
  let now = now_sqlite();
  conn.execute(
    "UPDATE HawalaTransfer SET deletedAt = NULL, updatedAt = ?1 WHERE id = ?2",
    params![now, id],
  )?;
  record_hawala_event(
    &conn,
    &id,
    "RESTORE",
    Some(&status),
    Some(&status),
    "Hawala restored",
    None,
    None,
    trim_opt(input.reason).as_deref(),
    Some(actor.id.as_str()),
  )?;
  map_detail(&conn, &id)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateHawalaMetaInput {
  pub id: String,
  pub actor_user_id: Option<String>,
  pub receiver_name: Option<String>,
  pub receiver_phone: Option<String>,
  pub receiver_national_id: Option<String>,
  pub receiver_address: Option<String>,
  pub receiver_reference: Option<String>,
  pub partner_branch: Option<String>,
  pub special_instructions: Option<String>,
  pub purpose: Option<String>,
  pub priority: Option<String>,
  pub expected_delivery_date: Option<String>,
  pub expected_delivery_time: Option<String>,
  pub settlement_type: Option<String>,
  pub settlement_date: Option<String>,
  pub settlement_notes: Option<String>,
  pub notes: Option<String>,
  pub internal_notes: Option<String>,
  pub customer_notes: Option<String>,
  pub private_notes: Option<String>,
  pub reason: Option<String>,
}

#[tauri::command]
pub fn update_hawala_meta(
  state: State<'_, AppState>,
  input: UpdateHawalaMetaInput,
) -> Result<HawalaDetail, AppError> {
  let id = require_id(&input.id)?;
  let conn = state.db.lock();
  let actor = require_screen(&state, &conn, "hawala")?;
  let (status, deleted): (String, Option<String>) = conn.query_row(
    "SELECT status, deletedAt FROM HawalaTransfer WHERE id = ?1",
    [&id],
    |row| Ok((row.get(0)?, row.get(1)?)),
  )?;
  if deleted.is_some() {
    return Err(AppError::Validation(
      "Cannot edit an archived hawala.".into(),
    ));
  }
  let now = now_sqlite();
  conn.execute(
    r#"UPDATE HawalaTransfer SET
         receiverName = COALESCE(?1, receiverName),
         receiverPhone = COALESCE(?2, receiverPhone),
         receiverNationalId = COALESCE(?3, receiverNationalId),
         receiverAddress = COALESCE(?4, receiverAddress),
         receiverReference = COALESCE(?5, receiverReference),
         partnerBranch = COALESCE(?6, partnerBranch),
         specialInstructions = COALESCE(?7, specialInstructions),
         purpose = COALESCE(?8, purpose),
         priority = COALESCE(?9, priority),
         expectedDeliveryDate = COALESCE(?10, expectedDeliveryDate),
         expectedDeliveryTime = COALESCE(?11, expectedDeliveryTime),
         settlementType = COALESCE(?12, settlementType),
         settlementDate = COALESCE(?13, settlementDate),
         settlementNotes = COALESCE(?14, settlementNotes),
         notes = COALESCE(?15, notes),
         internalNotes = COALESCE(?16, internalNotes),
         customerNotes = COALESCE(?17, customerNotes),
         privateNotes = COALESCE(?18, privateNotes),
         updatedAt = ?19
       WHERE id = ?20"#,
    params![
      trim_opt(input.receiver_name),
      trim_opt(input.receiver_phone),
      trim_opt(input.receiver_national_id),
      trim_opt(input.receiver_address),
      trim_opt(input.receiver_reference),
      trim_opt(input.partner_branch),
      trim_opt(input.special_instructions),
      trim_opt(input.purpose),
      trim_opt(input.priority).map(|s| s.to_ascii_uppercase()),
      trim_opt(input.expected_delivery_date),
      trim_opt(input.expected_delivery_time),
      trim_opt(input.settlement_type),
      trim_opt(input.settlement_date),
      trim_opt(input.settlement_notes),
      trim_opt(input.notes),
      trim_opt(input.internal_notes),
      trim_opt(input.customer_notes),
      trim_opt(input.private_notes),
      now,
      id,
    ],
  )?;
  record_hawala_event(
    &conn,
    &id,
    "EDIT",
    Some(&status),
    Some(&status),
    "Hawala details updated",
    None,
    None,
    trim_opt(input.reason).as_deref(),
    Some(actor.id.as_str()),
  )?;
  map_detail(&conn, &id)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerContextInput {
  pub customer_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HawalaCustomerContext {
  pub customer_id: String,
  pub full_name: String,
  pub phone: Option<String>,
  pub address: Option<String>,
  pub national_id: Option<String>,
  pub balances: Vec<CustomerBalanceRow>,
  pub hawala_count: i64,
  pub last_hawala_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerBalanceRow {
  pub currency_code: String,
  pub balance: String,
}

#[tauri::command]
pub fn get_hawala_customer_context(
  state: State<'_, AppState>,
  input: CustomerContextInput,
) -> Result<HawalaCustomerContext, AppError> {
  let cid = input.customer_id.trim().to_string();
  if cid.is_empty() {
    return Err(AppError::Validation("Customer id is required.".into()));
  }
  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "hawala")?;
  let (full_name, phone, address, national_id): (
    String,
    Option<String>,
    Option<String>,
    Option<String>,
  ) = conn.query_row(
    "SELECT fullName, phone, address, nationalId FROM Customer
     WHERE id = ?1 AND deletedAt IS NULL LIMIT 1",
    [&cid],
    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
  )?;

  let mut bal_stmt = conn.prepare(
    r#"SELECT c.code,
              CAST(COALESCE(SUM(CASE WHEN le.direction='DEBIT' THEN le.amount ELSE -le.amount END),0) AS TEXT)
       FROM Wallet w
       INNER JOIN LedgerEntry le ON le.walletId = w.id
       INNER JOIN "Transaction" t ON t.id = le.transactionId AND t.deletedAt IS NULL
       INNER JOIN Currency c ON c.id = le.currencyId
       WHERE w.customerId = ?1 AND w.type = 'CUSTOMER' AND w.deletedAt IS NULL
       GROUP BY c.id, c.code
       HAVING ABS(COALESCE(SUM(CASE WHEN le.direction='DEBIT' THEN le.amount ELSE -le.amount END),0)) > 0
       ORDER BY c.code"#,
  )?;
  let balances = bal_stmt
    .query_map([&cid], |row| {
      Ok(CustomerBalanceRow {
        currency_code: row.get(0)?,
        balance: row.get(1)?,
      })
    })?
    .collect::<Result<Vec<_>, _>>()?;

  let hawala_count: i64 = conn.query_row(
    "SELECT COUNT(*) FROM HawalaTransfer
     WHERE deletedAt IS NULL
       AND (senderCustomerId = ?1 OR receiverCustomerId = ?1 OR customerId = ?1)",
    [&cid],
    |row| row.get(0),
  )?;
  let last_hawala_at: Option<String> = conn
    .query_row(
      "SELECT valueDate FROM HawalaTransfer
       WHERE deletedAt IS NULL
         AND (senderCustomerId = ?1 OR receiverCustomerId = ?1 OR customerId = ?1)
       ORDER BY valueDate DESC LIMIT 1",
      [&cid],
      |row| row.get(0),
    )
    .optional()?;

  Ok(HawalaCustomerContext {
    customer_id: cid,
    full_name,
    phone,
    address,
    national_id,
    balances,
    hawala_count,
    last_hawala_at,
  })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PartnerHawalaStats {
  pub partner_id: String,
  pub total: i64,
  pub pending: i64,
  pub completed: i64,
  pub cancelled: i64,
  pub last_transaction_at: Option<String>,
}

#[tauri::command]
pub fn get_partner_hawala_stats(
  state: State<'_, AppState>,
  input: crate::commands::partners::PartnerIdInput,
) -> Result<PartnerHawalaStats, AppError> {
  let id = input.id.trim().to_string();
  if id.is_empty() {
    return Err(AppError::Validation("Partner id is required.".into()));
  }
  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "hawala")?;
  let total: i64 = conn.query_row(
    "SELECT COUNT(*) FROM HawalaTransfer WHERE partnerSarafiId=?1 AND deletedAt IS NULL",
    [&id],
    |row| row.get(0),
  )?;
  let pending: i64 = conn.query_row(
    "SELECT COUNT(*) FROM HawalaTransfer
     WHERE partnerSarafiId=?1 AND deletedAt IS NULL
       AND status IN ('PENDING','SENT','RECEIVED')",
    [&id],
    |row| row.get(0),
  )?;
  let completed: i64 = conn.query_row(
    "SELECT COUNT(*) FROM HawalaTransfer
     WHERE partnerSarafiId=?1 AND deletedAt IS NULL AND status='COMPLETED'",
    [&id],
    |row| row.get(0),
  )?;
  let cancelled: i64 = conn.query_row(
    "SELECT COUNT(*) FROM HawalaTransfer
     WHERE partnerSarafiId=?1 AND deletedAt IS NULL
       AND status IN ('CANCELLED','RETURNED')",
    [&id],
    |row| row.get(0),
  )?;
  let last_transaction_at: Option<String> = conn
    .query_row(
      "SELECT valueDate FROM HawalaTransfer
       WHERE partnerSarafiId=?1 AND deletedAt IS NULL
       ORDER BY valueDate DESC LIMIT 1",
      [&id],
      |row| row.get(0),
    )
    .optional()?;
  Ok(PartnerHawalaStats {
    partner_id: id,
    total,
    pending,
    completed,
    cancelled,
    last_transaction_at,
  })
}

#[tauri::command]
pub fn next_hawala_reference(state: State<'_, AppState>) -> Result<String, AppError> {
  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "hawala")?;
  super::hawala::next_daily_hawala_reference(&conn)
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HawalaCommissionTrackingInput {
  pub date_from: Option<String>,
  pub date_to: Option<String>,
  pub direction: Option<String>,
  pub currency_code: Option<String>,
  pub search: Option<String>,
  pub page: Option<i64>,
  pub page_size: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HawalaCommissionCurrencyTotal {
  pub currency_code: String,
  pub total: String,
  pub send: String,
  pub receive: String,
  pub count: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HawalaCommissionTrackingRow {
  pub id: String,
  pub reference: String,
  pub display_ref: String,
  pub value_date: String,
  pub direction: String,
  pub sender_name: Option<String>,
  pub receiver_name: Option<String>,
  pub currency_code: String,
  pub amount: String,
  pub commission: String,
  pub status: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HawalaCommissionTrackingPage {
  pub items: Vec<HawalaCommissionTrackingRow>,
  pub totals: Vec<HawalaCommissionCurrencyTotal>,
  pub total: i64,
  pub page: i64,
  pub page_size: i64,
}

fn hawala_commission_where(
  input: &HawalaCommissionTrackingInput,
) -> (String, Vec<Box<dyn rusqlite::types::ToSql>>) {
  let mut where_sql = String::from(
    "WHERE h.deletedAt IS NULL
     AND t.deletedAt IS NULL
     AND CAST(COALESCE(h.ownCommissionAmount, 0) AS REAL) > 0",
  );
  let mut params_v: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

  if let Some(ref d) = input.direction {
    let d = d.trim().to_ascii_uppercase();
    if d == "SEND" || d == "RECEIVE" {
      where_sql.push_str(" AND h.direction = ?");
      params_v.push(Box::new(d));
    }
  }
  if let Some(ref code) = input.currency_code {
    let code = code.trim().to_ascii_uppercase();
    if !code.is_empty() && code != "ALL" {
      where_sql.push_str(" AND c.code = ?");
      params_v.push(Box::new(code));
    }
  }
  if let Some(ref from) = input.date_from {
    let from = from.trim();
    if !from.is_empty() {
      where_sql.push_str(" AND h.valueDate >= date(?)");
      params_v.push(Box::new(from.to_string()));
    }
  }
  if let Some(ref to) = input.date_to {
    let to = to.trim();
    if !to.is_empty() {
      where_sql.push_str(" AND h.valueDate < date(?, '+1 day')");
      params_v.push(Box::new(to.to_string()));
    }
  }
  if let Some(ref q) = input.search {
    let q = q.trim();
    if !q.is_empty() {
      where_sql.push_str(
        " AND (
          h.reference LIKE ?
          OR IFNULL(t.displayRef,'') LIKE ?
          OR IFNULL(t.reference,'') LIKE ?
          OR IFNULL(h.senderName,'') LIKE ?
          OR IFNULL(h.receiverName,'') LIKE ?
        )",
      );
      let like = {
        let patterned = q.replace('*', "%");
        if patterned.contains('%') || patterned.contains('_') {
          patterned
        } else {
          format!("%{patterned}%")
        }
      };
      for _ in 0..5 {
        params_v.push(Box::new(like.clone()));
      }
    }
  }

  (where_sql, params_v)
}

/// Posted Hawala own-commission report. Does not invent amounts or post ledger rows.
pub(crate) fn query_hawala_commission_tracking(
  conn: &Connection,
  input: HawalaCommissionTrackingInput,
) -> Result<HawalaCommissionTrackingPage, AppError> {
  let page_size = input.page_size.unwrap_or(25).clamp(1, 100);
  let mut page = input.page.unwrap_or(1).max(1);
  let (where_sql, params_v) = hawala_commission_where(&input);
  let from_sql = r#"FROM HawalaTransfer h
     INNER JOIN Currency c ON c.id = h.currencyId
     INNER JOIN "Transaction" t ON t.id = h.transactionId"#;

  let count_sql = format!("SELECT COUNT(*) {from_sql} {where_sql}");
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

  let totals_sql = format!(
    "SELECT c.code,
            SUM(CAST(h.ownCommissionAmount AS REAL)),
            SUM(CASE WHEN UPPER(h.direction) = 'SEND'
                THEN CAST(h.ownCommissionAmount AS REAL) ELSE 0 END),
            SUM(CASE WHEN UPPER(h.direction) = 'RECEIVE'
                THEN CAST(h.ownCommissionAmount AS REAL) ELSE 0 END),
            COUNT(*)
     {from_sql}
     {where_sql}
     GROUP BY c.code
     ORDER BY c.code"
  );
  let mut totals_stmt = conn.prepare(&totals_sql)?;
  let totals = totals_stmt
    .query_map(refs.as_slice(), |row| {
      Ok(HawalaCommissionCurrencyTotal {
        currency_code: row.get(0)?,
        total: format_f64(row.get::<_, f64>(1)?),
        send: format_f64(row.get::<_, f64>(2)?),
        receive: format_f64(row.get::<_, f64>(3)?),
        count: row.get(4)?,
      })
    })?
    .collect::<Result<Vec<_>, _>>()?;

  let list_sql = format!(
    "SELECT h.id, h.reference, IFNULL(t.displayRef,''), h.valueDate, h.direction,
            h.senderName, h.receiverName, c.code,
            CAST(h.amount AS TEXT), CAST(h.ownCommissionAmount AS TEXT), h.status
     {from_sql}
     {where_sql}
     ORDER BY {order}
     LIMIT ? OFFSET ?",
    order = crate::ledger::HAWALA_CHRONO_DESC,
  );
  let mut list_params = params_v;
  list_params.push(Box::new(page_size));
  list_params.push(Box::new(offset));
  let list_refs: Vec<&dyn rusqlite::types::ToSql> =
    list_params.iter().map(|p| p.as_ref()).collect();
  let mut list_stmt = conn.prepare(&list_sql)?;
  let items = list_stmt
    .query_map(list_refs.as_slice(), |row| {
      Ok(HawalaCommissionTrackingRow {
        id: row.get(0)?,
        reference: row.get(1)?,
        display_ref: row.get(2)?,
        value_date: row.get(3)?,
        direction: row.get(4)?,
        sender_name: row.get(5)?,
        receiver_name: row.get(6)?,
        currency_code: row.get(7)?,
        amount: row.get(8)?,
        commission: row.get(9)?,
        status: row.get(10)?,
      })
    })?
    .collect::<Result<Vec<_>, _>>()?;

  Ok(HawalaCommissionTrackingPage {
    items,
    totals,
    total,
    page,
    page_size,
  })
}

#[tauri::command]
pub fn get_hawala_commission_tracking(
  state: State<'_, AppState>,
  input: HawalaCommissionTrackingInput,
) -> Result<HawalaCommissionTrackingPage, AppError> {
  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "hawala")?;
  query_hawala_commission_tracking(&conn, input)
}
