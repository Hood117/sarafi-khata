//! Hawala SEND / RECEIVE posting (ADR-041) + partner list.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::commands::hawala_desk::record_hawala_event;
use crate::error::AppError;
use crate::ledger::{
  find_currency_by_code, money_from_major_units, money_to_major_unit_string, post_transaction,
  PostTransactionInput, PostingLineDto,
};
use crate::state::AppState;
use crate::util::{now_sqlite};

const HAWALA_WALK_IN_OUTBOUND: &str = "Hawala Walk-in Outbound";
const HAWALA_COMMISSION_INCOME: &str = "Hawala Commission Income";
const HAWALA_CLEARING: &str = "Hawala Clearing";

fn require_nonempty(value: &str, field: &str) -> Result<String, AppError> {
  let trimmed = value.trim().to_string();
  if trimmed.is_empty() {
    return Err(AppError::Validation(format!("{field} is required.")));
  }
  Ok(trimmed)
}

fn trim_opt(value: Option<String>) -> Option<String> {
  value
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty())
}

fn positive_major(value: Option<&str>) -> Option<String> {
  let trimmed = value?.trim();
  if trimmed.is_empty() {
    return None;
  }
  if !trimmed.chars().all(|c| c.is_ascii_digit() || c == '.')
    || trimmed.matches('.').count() > 1
    || !trimmed.chars().next().is_some_and(|c| c.is_ascii_digit())
  {
    return None;
  }
  if trimmed.parse::<f64>().ok().filter(|n| *n > 0.0).is_none() {
    return None;
  }
  Some(trimmed.to_string())
}

fn ensure_system_wallet(conn: &Connection, name: &str) -> Result<String, AppError> {
  let existing: Option<String> = conn
    .query_row(
      "SELECT id FROM Wallet
       WHERE name = ?1 AND type = 'SYSTEM' AND deletedAt IS NULL AND isActive = 1
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
      "Sender customer has no account wallet.".into(),
    )),
    1 => Ok(ids[0].clone()),
    _ => Err(AppError::Validation(
      "Sender customer has more than one wallet.".into(),
    )),
  }
}

fn load_wallet_type(conn: &Connection, id: &str) -> Result<(String, i64), AppError> {
  conn
    .query_row(
      "SELECT type, isActive FROM Wallet WHERE id = ?1 AND deletedAt IS NULL LIMIT 1",
      [id],
      |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .map_err(|e| match e {
      rusqlite::Error::QueryReturnedNoRows => AppError::NotFound("Wallet was not found.".into()),
      other => other.into(),
    })
}

fn resolve_customer_name_phone(
  conn: &Connection,
  customer_id: Option<&str>,
  fallback_name: &str,
  fallback_phone: Option<&str>,
) -> Result<(String, Option<String>), AppError> {
  let Some(cid) = customer_id else {
    let name = fallback_name.trim().to_string();
    if name.is_empty() {
      return Err(AppError::Validation(
        "Select a local customer or enter the party name.".into(),
      ));
    }
    return Ok((name, fallback_phone.map(|s| s.to_string())));
  };
  let row: Option<(String, Option<String>, i64, Option<String>)> = conn
    .query_row(
      "SELECT fullName, phone, isActive, deletedAt FROM Customer WHERE id = ?1 LIMIT 1",
      [cid],
      |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    )
    .optional()?;
  let Some((name, phone, active, deleted)) = row else {
    return Err(AppError::NotFound("Customer was not found.".into()));
  };
  if deleted.is_some() || active == 0 {
    return Err(AppError::Validation("Customer is inactive.".into()));
  }
  Ok((name, phone))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PartnerListItem {
  pub id: String,
  pub name: String,
  pub city: Option<String>,
  pub country: Option<String>,
}

#[tauri::command]
pub fn list_partners(
  state: State<'_, AppState>,
) -> Result<Vec<PartnerListItem>, AppError> {
  let conn = state.db.lock();
  let mut stmt = conn.prepare(
    "SELECT id, name, city, country FROM PartnerSarafi
     WHERE deletedAt IS NULL AND isActive = 1
     ORDER BY name ASC
     LIMIT 500",
  )?;
  let items = stmt
    .query_map([], |row| {
      Ok(PartnerListItem {
        id: row.get(0)?,
        name: row.get(1)?,
        city: row.get(2)?,
        country: row.get(3)?,
      })
    })?
    .collect::<Result<Vec<_>, _>>()?;
  Ok(items)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HawalaPostInput {
  pub reference: String,
  pub partner_sarafi_id: String,
  pub currency_code: String,
  pub amount: String,
  pub cash_wallet_id: String,
  pub clearing_wallet_id: Option<String>,
  pub sender_name: Option<String>,
  pub sender_phone: Option<String>,
  pub receiver_name: Option<String>,
  pub receiver_phone: Option<String>,
  pub sender_customer_id: Option<String>,
  pub receiver_customer_id: Option<String>,
  pub origin_city: String,
  pub origin_country: String,
  pub destination_city: String,
  pub destination_country: String,
  pub notes: Option<String>,
  pub partner_commission_amount: Option<String>,
  pub own_commission_amount: Option<String>,
  pub additional_charges: Option<String>,
  pub discount_amount: Option<String>,
  pub own_commission_mode: Option<String>,
  pub partner_commission_mode: Option<String>,
  pub sender_national_id: Option<String>,
  pub sender_address: Option<String>,
  pub receiver_national_id: Option<String>,
  pub receiver_address: Option<String>,
  pub receiver_reference: Option<String>,
  pub partner_branch: Option<String>,
  pub special_instructions: Option<String>,
  pub purpose: Option<String>,
  pub priority: Option<String>,
  pub expected_delivery_date: Option<String>,
  pub expected_delivery_time: Option<String>,
  pub receive_currency_code: Option<String>,
  pub receive_amount: Option<String>,
  pub exchange_rate: Option<String>,
  pub settlement_type: Option<String>,
  pub settlement_notes: Option<String>,
  pub internal_notes: Option<String>,
  pub customer_notes: Option<String>,
  pub private_notes: Option<String>,
  pub value_date: Option<String>,
  pub created_by_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HawalaPostResult {
  pub id: String,
  pub reference: String,
  pub direction: String,
  pub status: String,
  pub transaction_id: String,
}

fn post_hawala(
  conn: &Connection,
  direction: &str,
  input: HawalaPostInput,
) -> Result<HawalaPostResult, AppError> {
  let reference = require_nonempty(&input.reference, "reference")?;
  let partner_id = require_nonempty(&input.partner_sarafi_id, "partnerSarafiId")?;
  let cash_wallet_id = require_nonempty(&input.cash_wallet_id, "cashWalletId")?;
  let created_by_id = require_nonempty(&input.created_by_id, "createdById")?;
  let origin_city = require_nonempty(&input.origin_city, "originCity")?;
  let origin_country = require_nonempty(&input.origin_country, "originCountry")?;
  let destination_city = require_nonempty(&input.destination_city, "destinationCity")?;
  let destination_country = require_nonempty(&input.destination_country, "destinationCountry")?;

  let existing: bool = conn.query_row(
    "SELECT EXISTS(SELECT 1 FROM HawalaTransfer WHERE reference = ?1)",
    [&reference],
    |row| row.get(0),
  )?;
  if existing {
    return Err(AppError::Validation(format!(
      "Hawala reference \"{reference}\" already exists."
    )));
  }

  let partner: (String, String, i64, Option<String>) = conn
    .query_row(
      "SELECT id, name, isActive, deletedAt FROM PartnerSarafi WHERE id = ?1 LIMIT 1",
      [&partner_id],
      |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    )
    .map_err(|e| match e {
      rusqlite::Error::QueryReturnedNoRows => {
        AppError::NotFound("Partner sarafi was not found.".into())
      }
      other => other.into(),
    })?;
  if partner.3.is_some() || partner.2 == 0 {
    return Err(AppError::Validation(
      "Partner sarafi is inactive and cannot be used.".into(),
    ));
  }
  let partner_name = partner.1;

  let (cash_type, cash_active) = load_wallet_type(conn, &cash_wallet_id)?;
  if cash_active == 0 || (cash_type != "VAULT" && cash_type != "TILL") {
    return Err(AppError::Validation(
      "Cash wallet must be a vault or till.".into(),
    ));
  }

  let clearing_wallet_id = match input.clearing_wallet_id.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
    Some(id) => id.to_string(),
    None => ensure_system_wallet(conn, HAWALA_CLEARING)?,
  };
  if clearing_wallet_id == cash_wallet_id {
    return Err(AppError::Validation(
      "Cash wallet and clearing wallet must be different.".into(),
    ));
  }
  let (clear_type, clear_active) = load_wallet_type(conn, &clearing_wallet_id)?;
  if clear_active == 0 || clear_type != "SYSTEM" {
    return Err(AppError::Validation(
      "Clearing wallet must be a system wallet.".into(),
    ));
  }

  let (currency_id, currency_code, places) = find_currency_by_code(conn, &input.currency_code)?;
  let principal_minor = money_from_major_units(&input.amount, places)?;
  let amount_major = money_to_major_unit_string(principal_minor, places)?;

  let sender_customer_id = trim_opt(input.sender_customer_id);
  let receiver_customer_id = trim_opt(input.receiver_customer_id);
  let (sender_name, sender_phone) = resolve_customer_name_phone(
    conn,
    sender_customer_id.as_deref(),
    input.sender_name.as_deref().unwrap_or(""),
    input.sender_phone.as_deref(),
  )?;
  let (receiver_name, receiver_phone) = resolve_customer_name_phone(
    conn,
    receiver_customer_id.as_deref(),
    input.receiver_name.as_deref().unwrap_or(""),
    input.receiver_phone.as_deref(),
  )?;

  let own_amount = positive_major(input.own_commission_amount.as_deref());
  let partner_amount = positive_major(input.partner_commission_amount.as_deref());
  let commission_side = if partner_amount.is_some() {
    // SEND: we owe the remote partner. RECEIVE: they owe us.
    Some(if direction == "SEND" {
      "PAYABLE".to_string()
    } else {
      "RECEIVABLE".to_string()
    })
  } else {
    None
  };
  let additional = positive_major(input.additional_charges.as_deref());
  let discount = positive_major(input.discount_amount.as_deref());
  let priority = input
    .priority
    .as_deref()
    .map(|s| s.trim().to_ascii_uppercase())
    .filter(|s| matches!(s.as_str(), "NORMAL" | "URGENT" | "IMMEDIATE"))
    .unwrap_or_else(|| "NORMAL".into());
  let purpose = trim_opt(input.purpose);
  let receive_currency_code = trim_opt(input.receive_currency_code).map(|s| s.to_ascii_uppercase());
  let receive_currency_id = if let Some(ref code) = receive_currency_code {
    Some(find_currency_by_code(conn, code)?.0)
  } else {
    None
  };
  let receive_amount = positive_major(input.receive_amount.as_deref());
  let exchange_rate = positive_major(input.exchange_rate.as_deref());

  let customer_id = sender_customer_id
    .clone()
    .or_else(|| receiver_customer_id.clone());
  let value_date = input
    .value_date
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty())
    .unwrap_or_else(now_sqlite);
  let notes = trim_opt(input.notes);
  let now = now_sqlite();
  let hawala_id = uuid::Uuid::new_v4().to_string();
  let initial_status = if direction == "SEND" { "SENT" } else { "RECEIVED" };

  conn.execute(
    "INSERT INTO HawalaTransfer (
       id, reference, direction, status, senderName, senderPhone, receiverName, receiverPhone,
       partnerSarafi, partnerSarafiId, originCity, originCountry, destinationCity, destinationCountry,
       currencyId, amount, commissionAmount, commissionCurrencyId, commissionSide,
       ownCommissionAmount, commissionRatePerAmount, commissionRateFeeAmount,
       notes, customerId, senderCustomerId, receiverCustomerId,
       cashWalletId, clearingWalletId, transactionId, createdById,
       valueDate, completedAt, cancelledAt, deletedAt, createdAt, updatedAt,
       senderNationalId, senderAddress, receiverNationalId, receiverAddress, receiverReference,
       partnerBranch, specialInstructions, purpose, priority,
       expectedDeliveryDate, expectedDeliveryTime,
       receiveCurrencyId, receiveAmount, exchangeRate,
       additionalCharges, discountAmount, ownCommissionMode, partnerCommissionMode,
       settlementType, settlementNotes, internalNotes, customerNotes, privateNotes,
       sentAt, receivedAt
     ) VALUES (
       ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8,
       ?9, ?10, ?11, ?12, ?13, ?14,
       ?15, ?16, ?17, ?18, ?19,
       ?20, NULL, NULL,
       ?21, ?22, ?23, ?24,
       ?25, ?26, NULL, ?27,
       ?28, NULL, NULL, NULL, ?29, ?29,
       ?30, ?31, ?32, ?33, ?34,
       ?35, ?36, ?37, ?38,
       ?39, ?40,
       ?41, ?42, ?43,
       ?44, ?45, ?46, ?47,
       ?48, ?49, ?50, ?51, ?52,
       ?53, ?54
     )",
    params![
      hawala_id,
      reference,
      direction,
      initial_status,
      sender_name,
      sender_phone,
      receiver_name,
      receiver_phone,
      partner_name,
      partner_id,
      origin_city,
      origin_country,
      destination_city,
      destination_country,
      currency_id,
      amount_major,
      partner_amount,
      if partner_amount.is_some() {
        Some(currency_id.clone())
      } else {
        None
      },
      commission_side,
      own_amount,
      notes,
      customer_id,
      sender_customer_id,
      receiver_customer_id,
      cash_wallet_id,
      clearing_wallet_id,
      created_by_id,
      value_date,
      now,
      trim_opt(input.sender_national_id),
      trim_opt(input.sender_address),
      trim_opt(input.receiver_national_id),
      trim_opt(input.receiver_address),
      trim_opt(input.receiver_reference),
      trim_opt(input.partner_branch),
      trim_opt(input.special_instructions),
      purpose,
      priority,
      trim_opt(input.expected_delivery_date),
      trim_opt(input.expected_delivery_time),
      receive_currency_id,
      receive_amount,
      exchange_rate,
      additional,
      discount,
      trim_opt(input.own_commission_mode),
      trim_opt(input.partner_commission_mode),
      trim_opt(input.settlement_type),
      trim_opt(input.settlement_notes),
      trim_opt(input.internal_notes),
      trim_opt(input.customer_notes),
      trim_opt(input.private_notes),
      if direction == "SEND" {
        Some(now.clone())
      } else {
        None
      },
      if direction == "RECEIVE" {
        Some(now.clone())
      } else {
        None
      },
    ],
  )?;

  // Build ledger entries
  let mut entries: Vec<PostingLineDto> = Vec::new();
  if direction == "SEND" {
    let credit_wallet = if let Some(ref sid) = sender_customer_id {
      resolve_sole_customer_wallet(conn, sid)?
    } else {
      ensure_system_wallet(conn, HAWALA_WALK_IN_OUTBOUND)?
    };
    entries.push(PostingLineDto {
      wallet_id: credit_wallet,
      currency: currency_code.clone(),
      direction: "CREDIT".into(),
      amount_minor: principal_minor.to_string(),
      exchange_rate_id: None,
      memo: Some("Hawala send".into()),
    });
    entries.push(PostingLineDto {
      wallet_id: clearing_wallet_id.clone(),
      currency: currency_code.clone(),
      direction: "DEBIT".into(),
      amount_minor: principal_minor.to_string(),
      exchange_rate_id: None,
      memo: Some("Hawala send".into()),
    });
  } else {
    entries.push(PostingLineDto {
      wallet_id: clearing_wallet_id.clone(),
      currency: currency_code.clone(),
      direction: "DEBIT".into(),
      amount_minor: principal_minor.to_string(),
      exchange_rate_id: None,
      memo: Some("Hawala receive".into()),
    });
    entries.push(PostingLineDto {
      wallet_id: cash_wallet_id.clone(),
      currency: currency_code.clone(),
      direction: "CREDIT".into(),
      amount_minor: principal_minor.to_string(),
      exchange_rate_id: None,
      memo: Some("Hawala receive".into()),
    });
  }

  if let Some(ref own_major) = own_amount {
    let own_minor = money_from_major_units(own_major, places)?;
    let income_id = ensure_system_wallet(conn, HAWALA_COMMISSION_INCOME)?;
    entries.push(PostingLineDto {
      wallet_id: cash_wallet_id.clone(),
      currency: currency_code.clone(),
      direction: "DEBIT".into(),
      amount_minor: own_minor.to_string(),
      exchange_rate_id: None,
      memo: Some("Hawala commission income".into()),
    });
    entries.push(PostingLineDto {
      wallet_id: income_id,
      currency: currency_code.clone(),
      direction: "CREDIT".into(),
      amount_minor: own_minor.to_string(),
      exchange_rate_id: None,
      memo: Some("Hawala commission income".into()),
    });
  }

  let posted = post_transaction(
    conn,
    PostTransactionInput {
      reference: reference.clone(),
      r#type: "HAWALA".into(),
      value_date: value_date.clone(),
      customer_id,
      walk_in_name: None,
      walk_in_phone: None,
      description: notes.clone(),
      created_by_id: Some(created_by_id.clone()),
      entries,
    },
  )?;

  let stamp = now_sqlite();
  conn.execute(
    "UPDATE HawalaTransfer SET
       transactionId = ?1,
       updatedAt = ?2
     WHERE id = ?3",
    params![posted.id, stamp, hawala_id],
  )?;
  let _ = record_hawala_event(
    conn,
    &hawala_id,
    "CREATED",
    None,
    Some(initial_status),
    &format!("Hawala {direction} posted"),
    None,
    Some(initial_status),
    None,
    Some(created_by_id.as_str()),
  );

  Ok(HawalaPostResult {
    id: hawala_id,
    reference,
    direction: direction.to_string(),
    status: initial_status.into(),
    transaction_id: posted.id,
  })
}

#[tauri::command]
pub fn send_hawala(
  state: State<'_, AppState>,
  input: HawalaPostInput,
) -> Result<HawalaPostResult, AppError> {
  let conn = state.db.lock();
  post_hawala(&conn, "SEND", input)
}

#[tauri::command]
pub fn receive_hawala(
  state: State<'_, AppState>,
  input: HawalaPostInput,
) -> Result<HawalaPostResult, AppError> {
  let conn = state.db.lock();
  post_hawala(&conn, "RECEIVE", input)
}
