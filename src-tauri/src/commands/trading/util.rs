use rusqlite::{params, Connection, OptionalExtension};

use crate::error::AppError;
use crate::ledger::{money_from_major_units, money_to_major_unit_string};
pub use crate::util::now_sqlite;

pub const TRADING_INVENTORY: &str = "Trading Inventory";
pub const TRADING_CLEARING: &str = "Trading Clearing";

pub const COUNTERPARTY_TYPES: &[&str] = &[
  "WALK_IN",
  "CUSTOMER",
  "PARTNER",
  "BANK",
  "BUSINESS",
  "SUPPLIER",
  "OTHER",
];

pub fn require_nonempty(value: &str, field: &str) -> Result<String, AppError> {
  let trimmed = value.trim().to_string();
  if trimmed.is_empty() {
    return Err(AppError::Validation(format!("{field} is required.")));
  }
  Ok(trimmed)
}

pub fn trim_opt(value: Option<String>) -> Option<String> {
  value
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty())
}

pub fn ensure_system_wallet(conn: &Connection, name: &str) -> Result<String, AppError> {
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

pub fn next_trade_reference(conn: &Connection) -> Result<String, AppError> {
  let day = chrono::Local::now().format("%Y%m%d").to_string();
  let prefix = format!("TRD-{day}-");
  let last: Option<String> = conn
    .query_row(
      "SELECT reference FROM TradingTrade
       WHERE reference LIKE ?1 ORDER BY reference DESC LIMIT 1",
      [format!("{prefix}%")],
      |row| row.get(0),
    )
    .optional()?;
  let seq = last
    .and_then(|r| r.rsplit('-').next().and_then(|s| s.parse::<u32>().ok()))
    .unwrap_or(0)
    + 1;
  Ok(format!("{prefix}{seq:04}"))
}

pub fn parse_positive_major(raw: &str, field: &str) -> Result<String, AppError> {
  let t = raw.trim();
  if t.is_empty()
    || !t.chars().all(|c| c.is_ascii_digit() || c == '.')
    || t.matches('.').count() > 1
    || !t.chars().next().is_some_and(|c| c.is_ascii_digit())
  {
    return Err(AppError::Validation(format!(
      "{field} must be a positive amount."
    )));
  }
  if t.parse::<f64>().ok().filter(|n| *n > 0.0).is_none() {
    return Err(AppError::Validation(format!(
      "{field} must be a positive amount."
    )));
  }
  Ok(t.to_string())
}

pub fn weighted_avg_scaled(old_qty: i128, old_avg: i128, add_qty: i128, add_rate: i128) -> i128 {
  let total = old_qty + add_qty;
  if total <= 0 {
    return 0;
  }
  (old_qty.saturating_mul(old_avg) + add_qty.saturating_mul(add_rate)) / total
}

pub fn major_to_scaled(major: &str, places: i64) -> Result<i128, AppError> {
  let minor = money_from_major_units(major, places)?;
  let places = places.max(0) as u32;
  if places > 8 {
    return Ok(minor);
  }
  Ok(minor.saturating_mul(10i128.pow(8 - places)))
}

pub fn scaled_to_major(scaled: i128, places: i64) -> Result<String, AppError> {
  let places_u = places.max(0) as u32;
  let factor = if places_u > 8 {
    1i128
  } else {
    10i128.pow(8 - places_u)
  };
  let minor = scaled / factor;
  money_to_major_unit_string(minor, places)
}

pub fn load_inventory(
  conn: &Connection,
  currency_id: &str,
) -> Result<Option<(String, String, String, i64)>, AppError> {
  Ok(conn
    .query_row(
      "SELECT CAST(quantity AS TEXT), CAST(avgCost AS TEXT), avgCostCurrencyId,
              (SELECT decimalPlaces FROM Currency WHERE id = avgCostCurrencyId)
       FROM TradingInventory WHERE currencyId = ?1",
      [currency_id],
      |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    )
    .optional()?)
}

pub fn upsert_inventory(
  conn: &Connection,
  currency_id: &str,
  qty_major: &str,
  avg_cost: &str,
  avg_cost_currency_id: &str,
  cost_value: &str,
  purchase: bool,
) -> Result<(), AppError> {
  let now = now_sqlite();
  let exists: Option<String> = conn
    .query_row(
      "SELECT currencyId FROM TradingInventory WHERE currencyId = ?1",
      [currency_id],
      |row| row.get(0),
    )
    .optional()?;
  if exists.is_some() {
    if purchase {
      conn.execute(
        "UPDATE TradingInventory SET quantity=?1, avgCost=?2, avgCostCurrencyId=?3,
           costValue=?4, lastPurchaseAt=?5, updatedAt=?5 WHERE currencyId=?6",
        params![qty_major, avg_cost, avg_cost_currency_id, cost_value, now, currency_id],
      )?;
    } else {
      conn.execute(
        "UPDATE TradingInventory SET quantity=?1, avgCost=?2, avgCostCurrencyId=?3,
           costValue=?4, lastSaleAt=?5, updatedAt=?5 WHERE currencyId=?6",
        params![qty_major, avg_cost, avg_cost_currency_id, cost_value, now, currency_id],
      )?;
    }
  } else {
    conn.execute(
      "INSERT INTO TradingInventory (
         currencyId, quantity, avgCost, avgCostCurrencyId, costValue,
         lastPurchaseAt, lastSaleAt, updatedAt
       ) VALUES (?1,?2,?3,?4,?5,?6,NULL,?6)",
      params![
        currency_id,
        qty_major,
        avg_cost,
        avg_cost_currency_id,
        cost_value,
        now
      ],
    )?;
  }
  Ok(())
}

pub fn assert_cash_wallet(conn: &Connection, wallet_id: &str) -> Result<(), AppError> {
  let row: Option<(String, i64)> = conn
    .query_row(
      "SELECT type, isActive FROM Wallet WHERE id = ?1 AND deletedAt IS NULL",
      [wallet_id],
      |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .optional()?;
  let (wtype, active) = row.ok_or_else(|| AppError::NotFound("Cash wallet not found.".into()))?;
  if active != 1 || (wtype != "VAULT" && wtype != "TILL") {
    return Err(AppError::Validation(
      "Cash wallet must be an active VAULT or TILL.".into(),
    ));
  }
  Ok(())
}

pub fn normalize_counterparty(
  conn: &Connection,
  counterparty_type: &str,
  customer_id: Option<String>,
  partner_id: Option<String>,
  counterparty_name: Option<String>,
) -> Result<(String, Option<String>, Option<String>, Option<String>), AppError> {
  let ct = counterparty_type.trim().to_ascii_uppercase();
  if !COUNTERPARTY_TYPES.contains(&ct.as_str()) {
    return Err(AppError::Validation("Invalid counterparty type.".into()));
  }
  let mut cust = trim_opt(customer_id);
  let mut partner = trim_opt(partner_id);
  let mut name = trim_opt(counterparty_name);
  match ct.as_str() {
    "CUSTOMER" => {
      let id = cust
        .take()
        .ok_or_else(|| AppError::Validation("Customer is required.".into()))?;
      let full: String = conn.query_row(
        "SELECT fullName FROM Customer WHERE id = ?1 AND deletedAt IS NULL",
        [&id],
        |row| row.get(0),
      )?;
      Ok((ct, Some(id), None, Some(full)))
    }
    "PARTNER" => {
      let id = partner
        .take()
        .ok_or_else(|| AppError::Validation("Partner Sarafi is required.".into()))?;
      let full: String = conn.query_row(
        "SELECT name FROM PartnerSarafi WHERE id = ?1 AND deletedAt IS NULL",
        [&id],
        |row| row.get(0),
      )?;
      Ok((ct, None, Some(id), Some(full)))
    }
    "WALK_IN" => {
      let n = name
        .filter(|s| !s.is_empty())
        .ok_or_else(|| AppError::Validation("Walk-in customer name is required.".into()))?;
      Ok((ct, None, None, Some(n)))
    }
    _ => {
      if name.is_none() {
        name = Some(ct.clone());
      }
      Ok((ct, None, None, name))
    }
  }
}

pub fn trading_allow_negative(conn: &Connection) -> Result<bool, AppError> {
  let v: Option<String> = conn
    .query_row(
      "SELECT value FROM SystemSetting WHERE key = 'trading.allowNegativeInventory'",
      [],
      |row| row.get(0),
    )
    .optional()?;
  Ok(matches!(
    v.as_deref().map(str::trim),
    Some("1") | Some("true") | Some("yes")
  ))
}

pub fn payment_from_qty_rate(
  qty: &str,
  inv_places: i64,
  rate: &str,
  pay_places: i64,
) -> Result<String, AppError> {
  let qty_scaled = major_to_scaled(qty, inv_places)?;
  let rate_scaled = major_to_scaled(rate, pay_places)?;
  scaled_to_major(
    qty_scaled.saturating_mul(rate_scaled) / 100_000_000i128,
    pay_places,
  )
}

/// Soft-delete a posted transaction so balances ignore its ledger lines.
pub fn soft_delete_transaction(conn: &Connection, transaction_id: &str) -> Result<(), AppError> {
  let now = now_sqlite();
  conn.execute(
    r#"UPDATE "Transaction" SET deletedAt = ?1, updatedAt = ?1
       WHERE id = ?2 AND deletedAt IS NULL"#,
    params![now, transaction_id],
  )?;
  Ok(())
}

/// Replay non-deleted trades for one inventory currency into TradingInventory.
pub fn rebuild_inventory_for_currency(
  conn: &Connection,
  currency_id: &str,
) -> Result<(), AppError> {
  let inv_places: i64 = conn.query_row(
    "SELECT decimalPlaces FROM Currency WHERE id = ?1",
    [currency_id],
    |row| row.get(0),
  )?;

  let mut stmt = conn.prepare(
    "SELECT direction, CAST(quantity AS TEXT), CAST(rate AS TEXT), paymentCurrencyId,
            CAST(paymentAmount AS TEXT)
     FROM TradingTrade
     WHERE deletedAt IS NULL AND inventoryCurrencyId = ?1
     ORDER BY valueDate ASC, createdAt ASC, reference ASC",
  )?;
  let rows = stmt
    .query_map([currency_id], |row| {
      Ok((
        row.get::<_, String>(0)?,
        row.get::<_, String>(1)?,
        row.get::<_, String>(2)?,
        row.get::<_, String>(3)?,
        row.get::<_, String>(4)?,
      ))
    })?
    .collect::<Result<Vec<_>, _>>()?;

  let now = now_sqlite();
  if rows.is_empty() {
    conn.execute(
      "UPDATE TradingInventory SET quantity='0', avgCost='0', costValue='0', updatedAt=?1
       WHERE currencyId=?2",
      params![now, currency_id],
    )?;
    return Ok(());
  }

  let mut qty_minor: i128 = 0;
  let mut avg_scaled: i128 = 0;
  let mut pay_ccy = rows[0].3.clone();
  let mut pay_places: i64 = conn.query_row(
    "SELECT decimalPlaces FROM Currency WHERE id = ?1",
    [&pay_ccy],
    |row| row.get(0),
  )?;
  let mut last_purchase: Option<String> = None;
  let mut last_sale: Option<String> = None;

  for (direction, qty_s, rate_s, pay_id, _pay_amt) in &rows {
    let q = money_from_major_units(qty_s, inv_places)?;
    if direction == "BUY" {
      if qty_minor == 0 {
        pay_ccy = pay_id.clone();
        pay_places = conn.query_row(
          "SELECT decimalPlaces FROM Currency WHERE id = ?1",
          [&pay_ccy],
          |row| row.get(0),
        )?;
      } else if pay_id != &pay_ccy {
        return Err(AppError::Validation(
          "Cannot rebuild inventory: payment currencies differ across trades.".into(),
        ));
      }
      let rate_scaled = major_to_scaled(rate_s, pay_places)?;
      avg_scaled = if qty_minor == 0 {
        rate_scaled
      } else {
        weighted_avg_scaled(qty_minor, avg_scaled, q, rate_scaled)
      };
      qty_minor += q;
      last_purchase = Some(now.clone());
    } else {
      qty_minor -= q;
      if qty_minor == 0 {
        avg_scaled = 0;
      }
      last_sale = Some(now.clone());
    }
  }

  let qty_major = if qty_minor < 0 {
    format!("-{}", money_to_major_unit_string(-qty_minor, inv_places)?)
  } else {
    money_to_major_unit_string(qty_minor, inv_places)?
  };
  let avg_major = if qty_minor == 0 {
    "0".into()
  } else {
    scaled_to_major(avg_scaled, pay_places)?
  };
  let abs_qty_major = qty_major.trim_start_matches('-');
  let cost_value = if qty_minor == 0 {
    "0".into()
  } else {
    scaled_to_major(
      major_to_scaled(abs_qty_major, inv_places)?.saturating_mul(avg_scaled) / 100_000_000,
      pay_places,
    )?
  };

  let exists: Option<String> = conn
    .query_row(
      "SELECT currencyId FROM TradingInventory WHERE currencyId = ?1",
      [currency_id],
      |row| row.get(0),
    )
    .optional()?;
  if exists.is_some() {
    conn.execute(
      "UPDATE TradingInventory SET quantity=?1, avgCost=?2, avgCostCurrencyId=?3,
         costValue=?4, lastPurchaseAt=COALESCE(?5, lastPurchaseAt),
         lastSaleAt=COALESCE(?6, lastSaleAt), updatedAt=?7
       WHERE currencyId=?8",
      params![
        qty_major,
        avg_major,
        pay_ccy,
        cost_value,
        last_purchase,
        last_sale,
        now,
        currency_id
      ],
    )?;
  } else {
    conn.execute(
      "INSERT INTO TradingInventory (
         currencyId, quantity, avgCost, avgCostCurrencyId, costValue,
         lastPurchaseAt, lastSaleAt, updatedAt
       ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
      params![
        currency_id,
        qty_major,
        avg_major,
        pay_ccy,
        cost_value,
        last_purchase,
        last_sale,
        now
      ],
    )?;
  }
  Ok(())
}
