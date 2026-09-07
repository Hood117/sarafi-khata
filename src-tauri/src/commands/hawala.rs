//! Hawala SEND / RECEIVE posting (ADR-041) + partner list.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::commands::hawala_desk::record_hawala_event;
use crate::error::AppError;
use crate::ledger::{
  find_currency_by_code, money_from_major_units, money_to_major_unit_string, post_transaction_in_tx,
  resolve_shop_cash_wallet_id, PostTransactionInput, PostingLineDto,
};
use crate::state::AppState;
use crate::util::{now_sqlite};
use crate::commands::authorize::{require_screen, require_screen_write};

const HAWALA_WALK_IN_OUTBOUND: &str = "Hawala Walk-in Outbound";
const HAWALA_COMMISSION_INCOME: &str = "Hawala Commission Income";
const HAWALA_CLEARING: &str = "Hawala Clearing";
const OPENING_EQUITY_WALLET_NAME: &str = "Opening Equity";

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
      "Customer has no account wallet.".into(),
    )),
    1 => Ok(ids[0].clone()),
    _ => Err(AppError::Validation(
      "Sender customer has more than one wallet.".into(),
    )),
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
    "INSERT INTO Wallet (id, name, type, customerId, userId, isActive, deletedAt, createdAt, updatedAt)
     VALUES (?1, ?2, 'SYSTEM', NULL, NULL, 1, NULL, ?3, ?3)",
    params![id, OPENING_EQUITY_WALLET_NAME, now],
  )?;
  Ok(id)
}

fn own_commission_split(
  principal_minor: i128,
  own_amount: &Option<String>,
  hawala_currency: &str,
  commission_currency: &str,
  commission_places: i64,
) -> Result<(i128, i128), AppError> {
  let own_minor = if let Some(own_major) = own_amount {
    if commission_currency != hawala_currency {
      return Err(AppError::Validation(
        "Our commission must use the same currency as the hawala amount.".into(),
      ));
    }
    money_from_major_units(own_major, commission_places)?
  } else {
    0
  };
  if own_minor >= principal_minor {
    return Err(AppError::Validation(
      "Commission must be less than the received amount.".into(),
    ));
  }
  Ok((own_minor, principal_minor - own_minor))
}

fn lookup_partner_by_customer(
  conn: &Connection,
  customer_id: &str,
) -> Result<Option<(String, String, Option<String>, Option<String>)>, AppError> {
  Ok(conn
    .query_row(
      "SELECT id, name, city, country FROM PartnerSarafi
       WHERE customerId = ?1 AND deletedAt IS NULL
       LIMIT 1",
      [customer_id],
      |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    )
    .optional()?)
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

fn normalize_phone_digits(raw: &str) -> String {
  raw.chars().filter(|c| c.is_ascii_digit()).collect()
}

/// Phone is optional; when present it must not belong to another active customer.
fn assert_phone_available(
  conn: &Connection,
  phone: Option<&str>,
  exclude_customer_id: Option<&str>,
) -> Result<(), AppError> {
  let Some(raw) = phone.map(str::trim).filter(|s| !s.is_empty()) else {
    return Ok(());
  };
  let digits = normalize_phone_digits(raw);
  if digits.is_empty() {
    return Ok(());
  }

  let mut stmt = conn.prepare(
    "SELECT id, phone FROM Customer
     WHERE deletedAt IS NULL AND phone IS NOT NULL AND TRIM(phone) != ''",
  )?;
  let rows = stmt
    .query_map([], |row| {
      Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?
    .collect::<Result<Vec<_>, _>>()?;

  for (id, existing) in rows {
    if exclude_customer_id.is_some_and(|ex| ex == id) {
      continue;
    }
    if normalize_phone_digits(&existing) == digits {
      return Err(AppError::Validation(
        "This phone number is already used by another customer.".into(),
      ));
    }
  }
  Ok(())
}

fn hawala_reference_taken(conn: &Connection, reference: &str) -> Result<bool, AppError> {
  let on_hawala: bool = conn.query_row(
    "SELECT EXISTS(SELECT 1 FROM HawalaTransfer WHERE reference = ?1 AND deletedAt IS NULL)",
    [reference],
    |row| row.get(0),
  )?;
  if on_hawala {
    return Ok(true);
  }
  let on_tx: bool = conn.query_row(
    r#"SELECT EXISTS(SELECT 1 FROM "Transaction" WHERE reference = ?1 AND deletedAt IS NULL)"#,
    [reference],
    |row| row.get(0),
  )?;
  Ok(on_tx)
}

fn parse_daily_hawala_seq(reference: &str, prefix: &str) -> Option<u32> {
  let rest = reference.strip_prefix(prefix)?;
  if rest.is_empty() || rest.contains('_') {
    return None;
  }
  rest.parse().ok()
}

/// Next unused `HW-YYYYMMDD-0002` for today. Ignores soft-deleted `__DEL__` suffixes
/// that otherwise sort last and reset the sequence back to 0001.
pub fn next_daily_hawala_reference(conn: &Connection) -> Result<String, AppError> {
  let day = chrono::Local::now().format("%Y%m%d").to_string();
  let prefix = format!("HW-{day}-");
  let mut stmt = conn.prepare(
    r#"SELECT reference FROM HawalaTransfer
       WHERE deletedAt IS NULL
         AND reference LIKE ?1
         AND instr(reference, '__DEL__') = 0"#,
  )?;
  let mut max_seq: u32 = 0;
  let rows = stmt.query_map([format!("{prefix}%")], |row| row.get::<_, String>(0))?;
  for row in rows {
    let reference = row?;
    if let Some(n) = parse_daily_hawala_seq(&reference, &prefix) {
      max_seq = max_seq.max(n);
    }
  }
  Ok(format!("{prefix}{:04}", max_seq + 1))
}

fn looks_like_daily_hawala_number(value: &str) -> bool {
  let mut parts = value.split('-');
  matches!(parts.next(), Some("HW"))
    && parts.next().is_some_and(|day| day.len() == 8 && day.chars().all(|c| c.is_ascii_digit()))
    && parts.next().is_some_and(|seq| !seq.is_empty() && seq.chars().all(|c| c.is_ascii_digit()))
    && parts.next().is_none()
}

fn allocate_hawala_reference(conn: &Connection, preferred: &str) -> Result<String, AppError> {
  let trimmed = preferred.trim();
  if trimmed.chars().count() > 64 {
    return Err(AppError::Validation(
      "Hawala number must be at most 64 characters.".into(),
    ));
  }
  let candidate = if trimmed.is_empty() {
    next_daily_hawala_reference(conn)?
  } else {
    trimmed.to_string()
  };
  if !hawala_reference_taken(conn, &candidate)? {
    return Ok(candidate);
  }
  if trimmed.is_empty() || looks_like_daily_hawala_number(&candidate) {
    let next = next_daily_hawala_reference(conn)?;
    if hawala_reference_taken(conn, &next)? {
      return Err(AppError::Validation(
        format!("Hawala number \"{next}\" already exists. Enter a unique number."),
      ));
    }
    return Ok(next);
  }
  Err(AppError::Validation(format!(
    "Hawala number \"{candidate}\" already exists. Enter a unique number."
  )))
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
  pub phone: Option<String>,
  pub city: Option<String>,
  pub country: Option<String>,
}

#[tauri::command]
pub fn list_partners(
  state: State<'_, AppState>,
) -> Result<Vec<PartnerListItem>, AppError> {
  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "hawala")?;
  let mut stmt = conn.prepare(
    "SELECT p.id,
            COALESCE(NULLIF(TRIM(cust.fullName), ''), p.name),
            COALESCE(NULLIF(TRIM(cust.phone), ''), p.phone),
            p.city, p.country
     FROM PartnerSarafi p
     LEFT JOIN Customer cust ON cust.id = p.customerId
     WHERE p.deletedAt IS NULL AND p.isActive = 1
     ORDER BY p.name ASC
     LIMIT 500",
  )?;
  let items = stmt
    .query_map([], |row| {
      Ok(PartnerListItem {
        id: row.get(0)?,
        name: row.get(1)?,
        phone: row.get(2)?,
        city: row.get(3)?,
        country: row.get(4)?,
      })
    })?
    .collect::<Result<Vec<_>, _>>()?;
  Ok(items)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HawalaPostInput {
  pub reference: String,
  pub partner_sarafi_id: Option<String>,
  pub currency_code: String,
  pub amount: String,
  /// Optional — shop cash is always Main Vault.
  pub cash_wallet_id: Option<String>,
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
  /// Currency for own + partner commission (defaults to hawala currency).
  pub commission_currency_code: Option<String>,
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
  /// Soft-delete this prior HAWALA transaction (and linked transfer) before posting.
  pub replace_transaction_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HawalaPostResult {
  pub id: String,
  pub reference: String,
  pub display_ref: String,
  pub direction: String,
  pub status: String,
  pub transaction_id: String,
}

fn post_hawala(
  conn: &Connection,
  direction: &str,
  input: HawalaPostInput,
) -> Result<HawalaPostResult, AppError> {
  let replace_id = input
    .replace_transaction_id
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(|s| s.to_string());
  if let Some(ref rid) = replace_id {
    let tx_type: String = conn
      .query_row(
        r#"SELECT type FROM "Transaction"
           WHERE id = ?1 AND deletedAt IS NULL LIMIT 1"#,
        [rid.as_str()],
        |row| row.get(0),
      )
      .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(
          "Transaction to replace was not found (or already deleted).".into(),
        ),
        other => other.into(),
      })?;
    if !tx_type.eq_ignore_ascii_case("HAWALA") {
      return Err(AppError::Validation(format!(
        "Cannot replace a {tx_type} transaction with a HAWALA."
      )));
    }
  }

  let preferred_reference = input.reference.clone();
  let created_by_id = require_nonempty(&input.created_by_id, "createdById")?;
  let mut origin_city = require_nonempty(&input.origin_city, "originCity")?;
  let origin_country = require_nonempty(&input.origin_country, "originCountry")?;
  let mut destination_city = require_nonempty(&input.destination_city, "destinationCity")?;
  let mut destination_country = require_nonempty(&input.destination_country, "destinationCountry")?;

  let cash_wallet_id = resolve_shop_cash_wallet_id(conn, input.cash_wallet_id.as_deref())?;

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

  // Walk-in phones must not collide with another customer's unique phone.
  if sender_customer_id.is_none() {
    assert_phone_available(conn, sender_phone.as_deref(), None)?;
  }
  if receiver_customer_id.is_none() {
    assert_phone_available(conn, receiver_phone.as_deref(), None)?;
  }

  // Desk Quick Action: destination / local receiver is an existing customer.
  // Net = amount − our commission; cashier never types the net.
  let simple_desk = receiver_customer_id.is_some();

  let mut partner_id = trim_opt(input.partner_sarafi_id);
  if partner_id.is_none() && simple_desk {
    let link_customer = if direction == "SEND" {
      receiver_customer_id.as_deref()
    } else {
      sender_customer_id.as_deref()
    };
    if let Some(cid) = link_customer {
      if let Some((pid, _pname, city, country)) = lookup_partner_by_customer(conn, cid)? {
        partner_id = Some(pid);
        if direction == "SEND" {
          if destination_city == "—" {
            if let Some(c) = city.filter(|s| !s.trim().is_empty()) {
              destination_city = c;
            }
          }
          if destination_country == "Afghanistan" {
            if let Some(c) = country.filter(|s| !s.trim().is_empty()) {
              destination_country = c;
            }
          }
        } else if origin_city == "Kabul" {
          if let Some(c) = city.filter(|s| !s.trim().is_empty()) {
            origin_city = c;
          }
        }
      }
    }
  }

  let partner_name = if let Some(ref pid) = partner_id {
    let partner: (String, String, i64, Option<String>) = conn
      .query_row(
        "SELECT id, name, isActive, deletedAt FROM PartnerSarafi WHERE id = ?1 LIMIT 1",
        [pid],
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
    partner.1
  } else if simple_desk {
    if direction == "SEND" {
      receiver_name.clone()
    } else {
      sender_name.clone()
    }
  } else {
    return Err(AppError::Validation("Partner is required.".into()));
  };

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
  let commission_currency_code = trim_opt(input.commission_currency_code)
    .map(|s| s.to_ascii_uppercase())
    .unwrap_or_else(|| currency_code.clone());
  let (commission_currency_id, commission_currency_code, commission_places) =
    find_currency_by_code(conn, &commission_currency_code)?;
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
  let mut receive_amount = if simple_desk {
    None
  } else {
    positive_major(input.receive_amount.as_deref())
  };
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
  // Desk posts send/receive as finished immediately — no manual Complete step.
  let initial_status = "COMPLETED";

  // Build ledger entries before opening the write transaction.
  let mut entries: Vec<PostingLineDto> = Vec::new();
  let mut walk_in_name_for_tx: Option<String> = None;
  let mut walk_in_phone_for_tx: Option<String> = None;
  if simple_desk {
    let dest_id = receiver_customer_id.as_ref().expect("validated above");
    if sender_customer_id.as_ref() == Some(dest_id) {
      return Err(AppError::Validation(
        "Sender and destination customer must be different.".into(),
      ));
    }
    let dest_wallet = resolve_sole_customer_wallet(conn, dest_id)?;
    let (own_minor, net_minor) = own_commission_split(
      principal_minor,
      &own_amount,
      &currency_code,
      &commission_currency_code,
      commission_places,
    )?;
    receive_amount = Some(money_to_major_unit_string(net_minor, places)?);

    if sender_customer_id.is_none() {
      walk_in_name_for_tx = Some(sender_name.clone());
      walk_in_phone_for_tx = sender_phone.clone();
      entries.push(PostingLineDto {
        wallet_id: cash_wallet_id.clone(),
        currency: currency_code.clone(),
        direction: "DEBIT".into(),
        amount_minor: principal_minor.to_string(),
        exchange_rate_id: None,
        memo: Some("Hawala — cash in".into()),
      });
      entries.push(PostingLineDto {
        wallet_id: dest_wallet,
        currency: currency_code.clone(),
        direction: "DEBIT".into(),
        amount_minor: net_minor.to_string(),
        exchange_rate_id: None,
        memo: Some("Hawala — destination account".into()),
      });
      if own_minor > 0 {
        let income_id = ensure_system_wallet(conn, HAWALA_COMMISSION_INCOME)?;
        entries.push(PostingLineDto {
          wallet_id: income_id,
          currency: currency_code.clone(),
          direction: "CREDIT".into(),
          amount_minor: own_minor.to_string(),
          exchange_rate_id: None,
          memo: Some("Hawala commission income".into()),
        });
      }
      let equity_id = ensure_opening_equity(conn)?;
      let equity_minor = principal_minor
        .checked_add(net_minor)
        .and_then(|v| v.checked_sub(own_minor))
        .ok_or_else(|| AppError::Validation("Amount too large.".into()))?;
      entries.push(PostingLineDto {
        wallet_id: equity_id,
        currency: currency_code.clone(),
        direction: "CREDIT".into(),
        amount_minor: equity_minor.to_string(),
        exchange_rate_id: None,
        memo: Some("Balancing equity leg".into()),
      });
    } else {
      let sid = sender_customer_id.as_ref().expect("validated above");
      let src_wallet = resolve_sole_customer_wallet(conn, sid)?;
      entries.push(PostingLineDto {
        wallet_id: src_wallet,
        currency: currency_code.clone(),
        direction: "CREDIT".into(),
        amount_minor: principal_minor.to_string(),
        exchange_rate_id: None,
        memo: Some("Hawala — sender account".into()),
      });
      entries.push(PostingLineDto {
        wallet_id: dest_wallet,
        currency: currency_code.clone(),
        direction: "DEBIT".into(),
        amount_minor: net_minor.to_string(),
        exchange_rate_id: None,
        memo: Some("Hawala — destination account".into()),
      });
      if own_minor > 0 {
        let income_id = ensure_system_wallet(conn, HAWALA_COMMISSION_INCOME)?;
        entries.push(PostingLineDto {
          wallet_id: income_id,
          currency: currency_code.clone(),
          direction: "CREDIT".into(),
          amount_minor: own_minor.to_string(),
          exchange_rate_id: None,
          memo: Some("Hawala commission income".into()),
        });
        let equity_id = ensure_opening_equity(conn)?;
        let equity_minor = principal_minor
          .checked_add(own_minor)
          .and_then(|v| v.checked_sub(net_minor))
          .ok_or_else(|| AppError::Validation("Amount too large.".into()))?;
        entries.push(PostingLineDto {
          wallet_id: equity_id,
          currency: currency_code.clone(),
          direction: "DEBIT".into(),
          amount_minor: equity_minor.to_string(),
          exchange_rate_id: None,
          memo: Some("Balancing equity leg".into()),
        });
      }
    }
  } else if direction == "SEND" {
    if let Some(ref sid) = sender_customer_id {
      // Customer account send without a destination customer (legacy partner corridor).
      let credit_wallet = resolve_sole_customer_wallet(conn, sid)?;
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
      // Walk-in pays cash now: cash into Main Vault (visible in daybook) + clearing.
      walk_in_name_for_tx = Some(sender_name.clone());
      walk_in_phone_for_tx = sender_phone.clone();
      entries.push(PostingLineDto {
        wallet_id: cash_wallet_id.clone(),
        currency: currency_code.clone(),
        direction: "DEBIT".into(),
        amount_minor: principal_minor.to_string(),
        exchange_rate_id: None,
        memo: Some("Hawala send".into()),
      });
      entries.push(PostingLineDto {
        wallet_id: clearing_wallet_id.clone(),
        currency: currency_code.clone(),
        direction: "CREDIT".into(),
        amount_minor: principal_minor.to_string(),
        exchange_rate_id: None,
        memo: Some("Hawala send".into()),
      });
    }
  } else {
    if sender_customer_id.is_none() && receiver_customer_id.is_none() {
      walk_in_name_for_tx = Some(receiver_name.clone());
      walk_in_phone_for_tx = receiver_phone.clone();
    }
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
    if !simple_desk {
      let own_minor = money_from_major_units(own_major, commission_places)?;
      let income_id = ensure_system_wallet(conn, HAWALA_COMMISSION_INCOME)?;
      entries.push(PostingLineDto {
        wallet_id: cash_wallet_id.clone(),
        currency: commission_currency_code.clone(),
        direction: "DEBIT".into(),
        amount_minor: own_minor.to_string(),
        exchange_rate_id: None,
        memo: Some("Hawala commission income".into()),
      });
      entries.push(PostingLineDto {
        wallet_id: income_id,
        currency: commission_currency_code.clone(),
        direction: "CREDIT".into(),
        amount_minor: own_minor.to_string(),
        exchange_rate_id: None,
        memo: Some("Hawala commission income".into()),
      });
    }
  }

  let hawala_description = if direction == "SEND" {
    format!(
      "{} sent {} {} Hawala to {}",
      sender_name,
      crate::util::format_amount_commas(&amount_major),
      currency_code,
      receiver_name
    )
  } else {
    format!(
      "{} received {} {} Hawala from {}",
      receiver_name,
      crate::util::format_amount_commas(&amount_major),
      currency_code,
      sender_name
    )
  };

  conn.execute_batch("BEGIN IMMEDIATE;")?;
  let result = (|| -> Result<HawalaPostResult, AppError> {
    if let Some(ref rid) = replace_id {
      crate::commands::trading::util::soft_delete_desk_transaction(conn, rid)?;
    }

    let reference = allocate_hawala_reference(conn, &preferred_reference)?;

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
         ?28, ?29, NULL, NULL, ?29, ?29,
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
          Some(commission_currency_id.clone())
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

    let posted = post_transaction_in_tx(
      conn,
      PostTransactionInput {
        reference: reference.clone(),
        r#type: "HAWALA".into(),
        value_date: value_date.clone(),
        customer_id,
        walk_in_name: walk_in_name_for_tx,
        walk_in_phone: walk_in_phone_for_tx,
        description: Some(hawala_description),
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
      display_ref: posted.display_ref,
      direction: direction.to_string(),
      status: initial_status.into(),
      transaction_id: posted.id,
    })
  })();
  match result {
    Ok(out) => {
      conn.execute_batch("COMMIT;")?;
      Ok(out)
    }
    Err(e) => {
      let _ = conn.execute_batch("ROLLBACK;");
      Err(e)
    }
  }
}

#[tauri::command]
pub fn send_hawala(
  state: State<'_, AppState>,
  mut input: HawalaPostInput,
) -> Result<HawalaPostResult, AppError> {
  let conn = state.db.lock();
  let actor = require_screen_write(&state, &conn, "hawala")?;
  input.created_by_id = actor.id.clone();
  post_hawala(&conn, "SEND", input)
}

#[tauri::command]
pub fn receive_hawala(
  state: State<'_, AppState>,
  mut input: HawalaPostInput,
) -> Result<HawalaPostResult, AppError> {
  let conn = state.db.lock();
  let actor = require_screen_write(&state, &conn, "hawala")?;
  input.created_by_id = actor.id.clone();
  post_hawala(&conn, "RECEIVE", input)
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::commands::trading::util::soft_delete_desk_transaction;
  use crate::ledger::{
    ensure_wallet_balance_cache, post_transaction, wallet_currency_balance_minor,
    PostTransactionInput, PostingLineDto,
  };
  use rusqlite::Connection;

  fn setup() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    conn
      .execute_batch(
        r#"
        CREATE TABLE HawalaTransfer (
          id TEXT PRIMARY KEY,
          reference TEXT NOT NULL,
          deletedAt TEXT
        );
        CREATE TABLE "Transaction" (
          id TEXT PRIMARY KEY,
          reference TEXT NOT NULL,
          deletedAt TEXT
        );
        "#,
      )
      .unwrap();
    conn
  }

  fn setup_posting() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    conn
      .execute_batch(
        r#"
        CREATE TABLE Currency (
          id TEXT PRIMARY KEY,
          code TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          symbol TEXT,
          decimalPlaces INTEGER NOT NULL DEFAULT 0,
          isActive INTEGER NOT NULL DEFAULT 1,
          deletedAt TEXT
        );
        CREATE TABLE Wallet (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          customerId TEXT,
          partnerSarafiId TEXT,
          userId TEXT,
          code TEXT,
          isActive INTEGER NOT NULL DEFAULT 1,
          deletedAt TEXT,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        );
        CREATE TABLE Customer (
          id TEXT PRIMARY KEY,
          fullName TEXT NOT NULL,
          phone TEXT,
          customerType TEXT NOT NULL DEFAULT 'PERMANENT',
          isActive INTEGER NOT NULL DEFAULT 1,
          deletedAt TEXT
        );
        CREATE TABLE User (
          id TEXT PRIMARY KEY,
          isActive INTEGER NOT NULL DEFAULT 1
        );
        CREATE TABLE PartnerSarafi (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          city TEXT,
          country TEXT,
          customerId TEXT,
          isActive INTEGER NOT NULL DEFAULT 1,
          deletedAt TEXT
        );
        CREATE TABLE HawalaTransfer (
          id TEXT PRIMARY KEY,
          reference TEXT NOT NULL,
          direction TEXT,
          status TEXT,
          senderName TEXT,
          senderPhone TEXT,
          receiverName TEXT,
          receiverPhone TEXT,
          partnerSarafi TEXT,
          partnerSarafiId TEXT,
          originCity TEXT,
          originCountry TEXT,
          destinationCity TEXT,
          destinationCountry TEXT,
          currencyId TEXT,
          amount TEXT,
          commissionAmount TEXT,
          commissionCurrencyId TEXT,
          commissionSide TEXT,
          ownCommissionAmount TEXT,
          commissionRatePerAmount TEXT,
          commissionRateFeeAmount TEXT,
          notes TEXT,
          customerId TEXT,
          senderCustomerId TEXT,
          receiverCustomerId TEXT,
          cashWalletId TEXT,
          clearingWalletId TEXT,
          transactionId TEXT,
          createdById TEXT,
          valueDate TEXT,
          completedAt TEXT,
          cancelledAt TEXT,
          deletedAt TEXT,
          createdAt TEXT,
          updatedAt TEXT,
          senderNationalId TEXT,
          senderAddress TEXT,
          receiverNationalId TEXT,
          receiverAddress TEXT,
          receiverReference TEXT,
          partnerBranch TEXT,
          specialInstructions TEXT,
          purpose TEXT,
          priority TEXT,
          expectedDeliveryDate TEXT,
          expectedDeliveryTime TEXT,
          receiveCurrencyId TEXT,
          receiveAmount TEXT,
          exchangeRate TEXT,
          additionalCharges TEXT,
          discountAmount TEXT,
          ownCommissionMode TEXT,
          partnerCommissionMode TEXT,
          settlementType TEXT,
          settlementNotes TEXT,
          internalNotes TEXT,
          customerNotes TEXT,
          privateNotes TEXT,
          sentAt TEXT,
          receivedAt TEXT
        );
        CREATE TABLE "Transaction" (
          id TEXT PRIMARY KEY,
          reference TEXT NOT NULL UNIQUE,
          displaySeq INTEGER,
          displayRef TEXT,
          type TEXT NOT NULL,
          status TEXT NOT NULL,
          valueDate TEXT NOT NULL,
          postedAt TEXT,
          description TEXT,
          walkInName TEXT,
          walkInPhone TEXT,
          customerId TEXT,
          createdById TEXT,
          deletedAt TEXT,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        );
        CREATE TABLE LedgerEntry (
          id TEXT PRIMARY KEY,
          transactionId TEXT NOT NULL,
          walletId TEXT NOT NULL,
          currencyId TEXT NOT NULL,
          direction TEXT NOT NULL,
          amount TEXT NOT NULL,
          exchangeRateId TEXT,
          memo TEXT,
          createdAt TEXT NOT NULL
        );
        "#,
      )
      .unwrap();
    ensure_wallet_balance_cache(&conn).unwrap();
    crate::ledger::ensure_display_seq_schema(&conn).unwrap();
    let now = now_sqlite();
    conn
      .execute(
        "INSERT INTO Currency (id, code, name, decimalPlaces, isActive)
         VALUES ('c1','AFN','Afghani',0,1)",
        [],
      )
      .unwrap();
    conn
      .execute(
        "INSERT INTO User (id, isActive) VALUES ('u1', 1)",
        [],
      )
      .unwrap();
    conn
      .execute(
        "INSERT INTO Customer (id, fullName, phone, isActive, deletedAt)
         VALUES ('cust-ghazni', 'Ghazni Saraf', NULL, 1, NULL)",
        [],
      )
      .unwrap();
    conn
      .execute(
        "INSERT INTO Wallet (id, name, type, customerId, isActive, deletedAt, createdAt, updatedAt, code)
         VALUES ('cash', 'Main Vault', 'VAULT', NULL, 1, NULL, ?1, ?1, '1')",
        [&now],
      )
      .unwrap();
    conn
      .execute(
        "INSERT INTO Wallet (id, name, type, customerId, isActive, deletedAt, createdAt, updatedAt)
         VALUES ('w-ghazni', 'Ghazni Saraf', 'CUSTOMER', 'cust-ghazni', 1, NULL, ?1, ?1)",
        [&now],
      )
      .unwrap();
    conn
      .execute(
        "INSERT INTO Customer (id, fullName, phone, isActive, deletedAt)
         VALUES ('cust-ahmad', 'Ahmad', NULL, 1, NULL)",
        [],
      )
      .unwrap();
    conn
      .execute(
        "INSERT INTO Wallet (id, name, type, customerId, isActive, deletedAt, createdAt, updatedAt)
         VALUES ('w-ahmad', 'Ahmad', 'CUSTOMER', 'cust-ahmad', 1, NULL, ?1, ?1)",
        [&now],
      )
      .unwrap();
    conn
  }

  fn dest_send_input(
    amount: &str,
    commission: Option<&str>,
    dest_customer: &str,
    sender: &str,
  ) -> HawalaPostInput {
    desk_input("HW-TEST-5000", amount, commission, None, sender, dest_customer)
  }

  fn desk_input(
    reference: &str,
    amount: &str,
    commission: Option<&str>,
    sender_customer: Option<&str>,
    sender_name: &str,
    dest_customer: &str,
  ) -> HawalaPostInput {
    HawalaPostInput {
      reference: reference.into(),
      partner_sarafi_id: None,
      currency_code: "AFN".into(),
      amount: amount.into(),
      cash_wallet_id: None,
      clearing_wallet_id: None,
      sender_name: Some(sender_name.into()),
      sender_phone: None,
      receiver_name: None,
      receiver_phone: None,
      sender_customer_id: sender_customer.map(|s| s.to_string()),
      receiver_customer_id: Some(dest_customer.into()),
      origin_city: "Kabul".into(),
      origin_country: "Afghanistan".into(),
      destination_city: "—".into(),
      destination_country: "Afghanistan".into(),
      notes: None,
      partner_commission_amount: None,
      own_commission_amount: commission.map(|s| s.to_string()),
      commission_currency_code: Some("AFN".into()),
      additional_charges: None,
      discount_amount: None,
      own_commission_mode: Some("FIXED".into()),
      partner_commission_mode: None,
      sender_national_id: None,
      sender_address: None,
      receiver_national_id: None,
      receiver_address: None,
      receiver_reference: None,
      partner_branch: None,
      special_instructions: None,
      purpose: None,
      priority: None,
      expected_delivery_date: None,
      expected_delivery_time: None,
      receive_currency_code: None,
      receive_amount: None,
      exchange_rate: None,
      settlement_type: None,
      settlement_notes: None,
      internal_notes: None,
      customer_notes: None,
      private_notes: None,
      value_date: None,
      created_by_id: "u1".into(),
      replace_transaction_id: None,
    }
  }

  fn seed_customer_balance(conn: &Connection, wallet_id: &str, amount: &str) {
    post_transaction(
      conn,
      PostTransactionInput {
        reference: format!("SEED-{wallet_id}-{amount}"),
        r#type: "DEPOSIT".into(),
        value_date: now_sqlite(),
        customer_id: None,
        walk_in_name: None,
        walk_in_phone: None,
        description: Some("test seed".into()),
        created_by_id: Some("u1".into()),
        entries: vec![
          PostingLineDto {
            wallet_id: wallet_id.into(),
            currency: "AFN".into(),
            direction: "DEBIT".into(),
            amount_minor: amount.into(),
            exchange_rate_id: None,
            memo: None,
          },
          PostingLineDto {
            wallet_id: {
              let id = ensure_opening_equity(conn).unwrap();
              id
            },
            currency: "AFN".into(),
            direction: "CREDIT".into(),
            amount_minor: amount.into(),
            exchange_rate_id: None,
            memo: None,
          },
        ],
      },
    )
    .unwrap();
  }

  fn live_hawala_tx(conn: &Connection, hawala_id: &str) -> (String, String, i64) {
    conn
      .query_row(
        r#"SELECT t.id, t.type, t.deletedAt IS NULL
           FROM HawalaTransfer h
           INNER JOIN "Transaction" t ON t.id = h.transactionId
           WHERE h.id = ?1"#,
        [hawala_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get::<_, i64>(2)?)),
      )
      .unwrap()
  }

  fn wallet_named_balance(conn: &Connection, name: &str) -> i128 {
    let id: String = conn
      .query_row(
        "SELECT id FROM Wallet WHERE name = ?1 AND deletedAt IS NULL LIMIT 1",
        [name],
        |row| row.get(0),
      )
      .unwrap();
    wallet_currency_balance_minor(conn, &id, "c1", 0).unwrap()
  }

  fn ledger_lines(conn: &Connection) -> Vec<(String, String, String)> {
    let mut stmt = conn
      .prepare(
        "SELECT w.name, le.direction, le.amount
         FROM LedgerEntry le
         INNER JOIN Wallet w ON w.id = le.walletId
         ORDER BY w.name, le.direction",
      )
      .unwrap();
    stmt
      .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
      .unwrap()
      .collect::<Result<Vec<_>, _>>()
      .unwrap()
  }

  #[test]
  fn next_skips_deleted_del_suffix_and_uses_live_0001() {
    let conn = setup();
    let day = chrono::Local::now().format("%Y%m%d").to_string();
    let live = format!("HW-{day}-0001");
    let deleted = format!("HW-{day}-0001__DEL__abc");
    conn
      .execute(
        "INSERT INTO HawalaTransfer (id, reference, deletedAt) VALUES ('d1', ?1, '2026-09-01')",
        [&deleted],
      )
      .unwrap();
    conn
      .execute(
        "INSERT INTO HawalaTransfer (id, reference) VALUES ('l1', ?1)",
        [&live],
      )
      .unwrap();
    let next = next_daily_hawala_reference(&conn).unwrap();
    assert_eq!(next, format!("HW-{day}-0002"));
  }

  #[test]
  fn allocate_bumps_taken_daily_number() {
    let conn = setup();
    let day = chrono::Local::now().format("%Y%m%d").to_string();
    let live = format!("HW-{day}-0001");
    conn
      .execute(
        "INSERT INTO HawalaTransfer (id, reference) VALUES ('l1', ?1)",
        [&live],
      )
      .unwrap();
    let got = allocate_hawala_reference(&conn, &live).unwrap();
    assert_eq!(got, format!("HW-{day}-0002"));
  }

  #[test]
  fn walk_in_destination_send_splits_5000_commission_100_net_4900() {
    let conn = setup_posting();
    let posted = post_hawala(
      &conn,
      "SEND",
      dest_send_input("5000", Some("100"), "cust-ghazni", "Walk-in"),
    )
    .expect("post walk-in destination send");

    assert_eq!(posted.direction, "SEND");
    let (tx_id, tx_type, live) = live_hawala_tx(&conn, &posted.id);
    assert_eq!(tx_type, "HAWALA");
    assert_eq!(live, 1);
    assert_eq!(posted.transaction_id, tx_id);
    assert_eq!(wallet_named_balance(&conn, "Main Vault"), 5000);
    assert_eq!(wallet_named_balance(&conn, "Ghazni Saraf"), 4900);
    assert_eq!(
      wallet_named_balance(&conn, "Hawala Commission Income"),
      -100,
      "income is recorded as CREDIT (asset convention)"
    );
    assert_ne!(
      wallet_named_balance(&conn, "Main Vault"),
      5100,
      "own commission must not also debit the vault"
    );

    let lines = ledger_lines(&conn);
    assert!(
      lines.iter().any(|(n, d, a)| n == "Main Vault" && d == "DEBIT" && a == "5000"),
      "{lines:?}"
    );
    assert!(
      lines.iter().any(|(n, d, a)| n == "Ghazni Saraf" && d == "DEBIT" && a == "4900"),
      "{lines:?}"
    );
    assert!(
      lines.iter().any(|(n, d, a)| n == "Hawala Commission Income" && d == "CREDIT" && a == "100"),
      "{lines:?}"
    );
    assert!(
      !lines.iter().any(|(n, _, _)| n == "Hawala Clearing"),
      "destination send must not use Hawala Clearing: {lines:?}"
    );

    let (amount, own, net): (String, Option<String>, Option<String>) = conn
      .query_row(
        "SELECT amount, ownCommissionAmount, receiveAmount FROM HawalaTransfer WHERE id = ?1",
        [&posted.id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
      )
      .unwrap();
    assert_eq!(amount, "5000");
    assert_eq!(own.as_deref(), Some("100"));
    assert_eq!(net.as_deref(), Some("4900"));
  }

  #[test]
  fn walk_in_destination_send_rejects_commission_not_less_than_amount() {
    let conn = setup_posting();
    let err = post_hawala(
      &conn,
      "SEND",
      dest_send_input("5000", Some("5000"), "cust-ghazni", "Walk-in"),
    )
    .expect_err("commission equal to amount must fail");
    assert!(
      err.to_string().to_lowercase().contains("commission"),
      "{err}"
    );
    assert_eq!(wallet_named_balance(&conn, "Main Vault"), 0);
  }

  #[test]
  fn customer_send_6000_commission_200_net_5800_does_not_touch_vault() {
    let conn = setup_posting();
    seed_customer_balance(&conn, "w-ahmad", "10000");
    assert_eq!(wallet_named_balance(&conn, "Ahmad"), 10000);

    let posted = post_hawala(
      &conn,
      "SEND",
      desk_input(
        "HW-TEST-6000",
        "6000",
        Some("200"),
        Some("cust-ahmad"),
        "Ahmad",
        "cust-ghazni",
      ),
    )
    .expect("post customer send");

    assert_eq!(wallet_named_balance(&conn, "Ahmad"), 4000);
    assert_eq!(wallet_named_balance(&conn, "Ghazni Saraf"), 5800);
    assert_eq!(wallet_named_balance(&conn, "Hawala Commission Income"), -200);
    assert_eq!(wallet_named_balance(&conn, "Main Vault"), 0);
    assert_ne!(wallet_named_balance(&conn, "Ahmad"), 3800, "must not debit 6200");

    let (tx_id, tx_type, live) = live_hawala_tx(&conn, &posted.id);
    assert_eq!(tx_type, "HAWALA");
    assert_eq!(live, 1);
    assert_eq!(posted.transaction_id, tx_id);

    let net: Option<String> = conn
      .query_row(
        "SELECT receiveAmount FROM HawalaTransfer WHERE id = ?1",
        [&posted.id],
        |row| row.get(0),
      )
      .unwrap();
    assert_eq!(net.as_deref(), Some("5800"));
  }

  #[test]
  fn walk_in_receive_6000_commission_200_credits_receiver_5800() {
    let conn = setup_posting();
    let posted = post_hawala(
      &conn,
      "RECEIVE",
      desk_input(
        "HW-TEST-R-WI",
        "6000",
        Some("200"),
        None,
        "Walk-in sender",
        "cust-ahmad",
      ),
    )
    .expect("post walk-in receive");

    assert_eq!(wallet_named_balance(&conn, "Main Vault"), 6000);
    assert_eq!(wallet_named_balance(&conn, "Ahmad"), 5800);
    assert_eq!(wallet_named_balance(&conn, "Hawala Commission Income"), -200);
    assert_eq!(wallet_named_balance(&conn, "Ghazni Saraf"), 0);
    let (_, tx_type, live) = live_hawala_tx(&conn, &posted.id);
    assert_eq!(tx_type, "HAWALA");
    assert_eq!(live, 1);
  }

  #[test]
  fn customer_receive_6000_commission_200_moves_between_customers() {
    let conn = setup_posting();
    seed_customer_balance(&conn, "w-ghazni", "10000");
    let posted = post_hawala(
      &conn,
      "RECEIVE",
      desk_input(
        "HW-TEST-R-CUST",
        "6000",
        Some("200"),
        Some("cust-ghazni"),
        "Ghazni Saraf",
        "cust-ahmad",
      ),
    )
    .expect("post customer receive");

    assert_eq!(wallet_named_balance(&conn, "Ghazni Saraf"), 4000);
    assert_eq!(wallet_named_balance(&conn, "Ahmad"), 5800);
    assert_eq!(wallet_named_balance(&conn, "Hawala Commission Income"), -200);
    assert_eq!(wallet_named_balance(&conn, "Main Vault"), 0);
    let (_, tx_type, live) = live_hawala_tx(&conn, &posted.id);
    assert_eq!(tx_type, "HAWALA");
    assert_eq!(live, 1);
  }

  #[test]
  fn linked_partner_reuses_customer_identity() {
    let conn = setup_posting();
    conn
      .execute(
        "INSERT INTO PartnerSarafi (id, name, city, country, customerId, isActive, deletedAt)
         VALUES ('p-ghazni', 'Ghazni Saraf Partner', 'Ghazni', 'Afghanistan', 'cust-ghazni', 1, NULL)",
        [],
      )
      .unwrap();
    let posted = post_hawala(
      &conn,
      "SEND",
      dest_send_input("5000", Some("100"), "cust-ghazni", "Walk-in"),
    )
    .unwrap();
    let (partner_id, customers): (Option<String>, i64) = conn
      .query_row(
        "SELECT h.partnerSarafiId,
                (SELECT COUNT(*) FROM Customer WHERE deletedAt IS NULL)
         FROM HawalaTransfer h WHERE h.id = ?1",
        [&posted.id],
        |row| Ok((row.get(0)?, row.get(1)?)),
      )
      .unwrap();
    assert_eq!(partner_id.as_deref(), Some("p-ghazni"));
    assert_eq!(customers, 2, "must not create a duplicate customer");
  }

  #[test]
  fn hawala_edit_replace_reverses_then_reposts() {
    let conn = setup_posting();
    let first = post_hawala(
      &conn,
      "SEND",
      dest_send_input("5000", Some("100"), "cust-ghazni", "Walk-in"),
    )
    .unwrap();
    assert_eq!(wallet_named_balance(&conn, "Main Vault"), 5000);
    assert_eq!(wallet_named_balance(&conn, "Ghazni Saraf"), 4900);

    let mut next = dest_send_input("4000", Some("50"), "cust-ghazni", "Walk-in");
    next.reference = first.reference.clone();
    next.replace_transaction_id = Some(first.transaction_id.clone());
    let second = post_hawala(&conn, "SEND", next).expect("replace hawala");

    assert_ne!(second.transaction_id, first.transaction_id);
    assert_eq!(wallet_named_balance(&conn, "Main Vault"), 4000);
    assert_eq!(wallet_named_balance(&conn, "Ghazni Saraf"), 3950);
    assert_eq!(wallet_named_balance(&conn, "Hawala Commission Income"), -50);
    let old_deleted: Option<String> = conn
      .query_row(
        r#"SELECT deletedAt FROM "Transaction" WHERE id = ?1"#,
        [&first.transaction_id],
        |row| row.get(0),
      )
      .unwrap();
    assert!(old_deleted.is_some());
    let live: i64 = conn
      .query_row(
        r#"SELECT COUNT(*) FROM "Transaction"
           WHERE reference = ?1 AND deletedAt IS NULL"#,
        [&first.reference],
        |row| row.get(0),
      )
      .unwrap();
    assert_eq!(live, 1);
  }

  #[test]
  fn hawala_delete_reverses_balances() {
    let conn = setup_posting();
    let posted = post_hawala(
      &conn,
      "SEND",
      dest_send_input("5000", Some("100"), "cust-ghazni", "Walk-in"),
    )
    .unwrap();
    soft_delete_desk_transaction(&conn, &posted.transaction_id).unwrap();
    assert_eq!(wallet_named_balance(&conn, "Main Vault"), 0);
    assert_eq!(wallet_named_balance(&conn, "Ghazni Saraf"), 0);
    assert_eq!(wallet_named_balance(&conn, "Hawala Commission Income"), 0);
  }

  #[test]
  fn failed_post_leaves_original_untouched() {
    let conn = setup_posting();
    let first = post_hawala(
      &conn,
      "SEND",
      dest_send_input("5000", Some("100"), "cust-ghazni", "Walk-in"),
    )
    .unwrap();
    let mut bad = dest_send_input("5000", Some("5000"), "cust-ghazni", "Walk-in");
    bad.reference = "HW-TEST-BAD".into();
    bad.replace_transaction_id = Some(first.transaction_id.clone());
    assert!(post_hawala(&conn, "SEND", bad).is_err());
    assert_eq!(wallet_named_balance(&conn, "Main Vault"), 5000);
    assert_eq!(wallet_named_balance(&conn, "Ghazni Saraf"), 4900);
    let deleted: Option<String> = conn
      .query_row(
        r#"SELECT deletedAt FROM "Transaction" WHERE id = ?1"#,
        [&first.transaction_id],
        |row| row.get(0),
      )
      .unwrap();
    assert!(deleted.is_none());
  }

  #[test]
  fn hawala_voucher_numbers_stay_unique() {
    let conn = setup_posting();
    post_hawala(
      &conn,
      "SEND",
      dest_send_input("5000", Some("100"), "cust-ghazni", "Walk-in"),
    )
    .unwrap();
    let err = post_hawala(
      &conn,
      "SEND",
      dest_send_input("3000", Some("50"), "cust-ghazni", "Walk-in"),
    )
    .expect_err("duplicate HW-TEST-5000 must fail");
    assert!(
      err.to_string().to_lowercase().contains("already exists"),
      "{err}"
    );
    let live: i64 = conn
      .query_row(
        r#"SELECT COUNT(*) FROM "Transaction" WHERE deletedAt IS NULL AND type = 'HAWALA'"#,
        [],
        |row| row.get(0),
      )
      .unwrap();
    assert_eq!(live, 1);
  }
}
