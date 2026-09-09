use rusqlite::{params, Connection, OptionalExtension};

use crate::error::AppError;
use crate::ledger::{
  money_from_major_units, money_from_major_units_allow_zero, money_from_major_units_signed,
  money_to_major_unit_string, signed_balance_to_display,
};
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

pub fn assert_cash_wallet(conn: &Connection, wallet_id: Option<&str>) -> Result<String, AppError> {
  crate::ledger::resolve_shop_cash_wallet_id(conn, wallet_id)
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
  let has_settings: bool = conn.query_row(
    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='SystemSetting')",
    [],
    |row| row.get(0),
  )?;
  if !has_settings {
    return Ok(false);
  }
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
/// Renames `reference` to a unique tombstone so a replacement edit can keep the
/// original transaction number without violating `Transaction_reference_key`.
pub fn soft_delete_transaction(conn: &Connection, transaction_id: &str) -> Result<(), AppError> {
  let already = conn
    .query_row(
      r#"SELECT deletedAt IS NOT NULL FROM "Transaction" WHERE id = ?1"#,
      [transaction_id],
      |row| row.get::<_, bool>(0),
    )
    .optional()?
    .unwrap_or(true);
  if already {
    return Ok(());
  }
  crate::ledger::reverse_transaction_balances(conn, transaction_id)?;
  let now = now_sqlite();
  let old_ref: String = conn.query_row(
    r#"SELECT reference FROM "Transaction" WHERE id = ?1"#,
    [transaction_id],
    |row| row.get(0),
  )?;
  let tombstone = format!(
    "{old_ref}__DEL__{}",
    &uuid::Uuid::new_v4().to_string().replace('-', "")[..12]
  );
  conn.execute(
    r#"UPDATE "Transaction"
       SET deletedAt = ?1, updatedAt = ?1, reference = ?2
       WHERE id = ?3 AND deletedAt IS NULL"#,
    params![now, tombstone, transaction_id],
  )?;
  crate::ledger::maybe_auto_archive_temporary_customers_for_transaction(conn, transaction_id)?;
  Ok(())
}

fn tombstone_unique_ref(prefix: &str) -> String {
  format!(
    "{prefix}__DEL__{}",
    &uuid::Uuid::new_v4().to_string().replace('-', "")[..12]
  )
}

/// Soft-delete a desk transaction and any linked hawala / exchange / trading rows.
pub fn soft_delete_desk_transaction(
  conn: &Connection,
  transaction_id: &str,
) -> Result<(), AppError> {
  let now = now_sqlite();

  let has_hawala: bool = conn.query_row(
    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='HawalaTransfer')",
    [],
    |row| row.get(0),
  )?;
  if has_hawala {
    let has_payout_col: i64 = conn
      .query_row(
        "SELECT COUNT(*) FROM pragma_table_info('HawalaTransfer') WHERE name = 'payoutTransactionId'",
        [],
        |row| row.get(0),
      )
      .unwrap_or(0);
    let find_sql = if has_payout_col > 0 {
      "SELECT id, reference, transactionId, payoutTransactionId FROM HawalaTransfer
       WHERE deletedAt IS NULL AND (transactionId = ?1 OR payoutTransactionId = ?1)"
    } else {
      "SELECT id, reference, transactionId, NULL FROM HawalaTransfer
       WHERE deletedAt IS NULL AND transactionId = ?1"
    };
    let mut stmt = conn.prepare(find_sql)?;
    let rows: Vec<(String, String, Option<String>, Option<String>)> = stmt
      .query_map([transaction_id], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
      })?
      .collect::<Result<Vec<_>, _>>()?;
    drop(stmt);
    for (hid, href, orig_tid, pay_tid) in rows {
      let pay_tid = pay_tid.filter(|s| !s.trim().is_empty());
      let orig_tid = orig_tid.filter(|s| !s.trim().is_empty());
      let deleting_payout = pay_tid.as_deref() == Some(transaction_id);
      let deleting_original = orig_tid.as_deref() == Some(transaction_id);
      if deleting_payout && !deleting_original {
        conn.execute(
          "UPDATE HawalaTransfer
           SET status = 'PENDING',
               completedAt = NULL,
               payoutTransactionId = NULL,
               updatedAt = ?1
           WHERE id = ?2 AND deletedAt IS NULL",
          params![now, hid],
        )?;
        continue;
      }
      if deleting_original {
        if let Some(ref pid) = pay_tid {
          if pid != transaction_id {
            soft_delete_transaction(conn, pid)?;
          }
        }
        let freed = tombstone_unique_ref(&href);
        conn.execute(
          "UPDATE HawalaTransfer SET deletedAt = ?1, updatedAt = ?1, reference = ?2
           WHERE id = ?3 AND deletedAt IS NULL",
          params![now, freed, hid],
        )?;
      }
    }
  }

  let has_deal: bool = conn.query_row(
    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='ExchangeDeal')",
    [],
    |row| row.get(0),
  )?;
  if has_deal {
    conn.execute(
      "UPDATE ExchangeDeal SET deletedAt = ?1, updatedAt = ?1
       WHERE transactionId = ?2 AND deletedAt IS NULL",
      params![now, transaction_id],
    )?;
  }

  let has_trade: bool = conn.query_row(
    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='TradingTrade')",
    [],
    |row| row.get(0),
  )?;
  if has_trade {
    let mut stmt = conn.prepare(
      "SELECT DISTINCT inventoryCurrencyId FROM TradingTrade
       WHERE transactionId = ?1 AND deletedAt IS NULL",
    )?;
    let inv_ids: Vec<String> = stmt
      .query_map([transaction_id], |row| row.get(0))?
      .collect::<Result<Vec<_>, _>>()?;
    drop(stmt);

    let mut stmt = conn.prepare(
      "SELECT id, reference FROM TradingTrade
       WHERE transactionId = ?1 AND deletedAt IS NULL",
    )?;
    let trades: Vec<(String, String)> = stmt
      .query_map([transaction_id], |row| Ok((row.get(0)?, row.get(1)?)))?
      .collect::<Result<Vec<_>, _>>()?;
    drop(stmt);
    for (tid, tref) in trades {
      let freed = tombstone_unique_ref(&tref);
      conn.execute(
        "UPDATE TradingTrade SET deletedAt = ?1, status = 'ARCHIVED', updatedAt = ?1, reference = ?2
         WHERE id = ?3 AND deletedAt IS NULL",
        params![now, freed, tid],
      )?;
    }
    for inv_id in inv_ids {
      rebuild_inventory_for_currency(conn, &inv_id)?;
    }
  }

  soft_delete_transaction(conn, transaction_id)?;

  let has_salary_pay: bool = conn.query_row(
    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='EmployeeSalaryPayment')",
    [],
    |row| row.get(0),
  )?;
  if has_salary_pay {
    // Hard-remove salary payment rows so history does not keep voided cash hits.
    conn.execute(
      "DELETE FROM EmployeeSalaryPayment WHERE transactionId = ?1",
      [transaction_id],
    )?;
  }

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

  let qty_major = signed_balance_to_display(qty_minor, inv_places)?;
  let avg_major = if qty_minor <= 0 {
    "0".into()
  } else {
    scaled_to_major(avg_scaled, pay_places)?
  };
  let abs_qty_major = qty_major.trim_start_matches('-');
  let cost_value = if qty_minor <= 0 {
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

/// Mirror a desk EXCHANGE deal into TradingTrade + TradingInventory (high currency leg).
/// Does not post extra ledger — cash already moved by `exchange_funds`.
pub fn record_exchange_as_trade(
  conn: &Connection,
  transaction_id: &str,
  reference: &str,
  side: &str,
  high_currency_id: &str,
  low_currency_id: &str,
  high_qty: &str,
  low_qty: &str,
  deal_rate: &str,
  customer_id: Option<&str>,
  walk_in_name: Option<&str>,
  value_date: &str,
  created_by_id: &str,
  cash_wallet_id: &str,
) -> Result<(), AppError> {
  let has_trade: bool = conn.query_row(
    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='TradingTrade')",
    [],
    |row| row.get(0),
  )?;
  if !has_trade {
    return Ok(());
  }

  let buy = side.eq_ignore_ascii_case("BUY_HIGH");
  let direction = if buy { "BUY" } else { "SELL" };

  let inv_places: i64 = conn.query_row(
    "SELECT decimalPlaces FROM Currency WHERE id = ?1",
    [high_currency_id],
    |row| row.get(0),
  )?;
  let pay_places: i64 = conn.query_row(
    "SELECT decimalPlaces FROM Currency WHERE id = ?1",
    [low_currency_id],
    |row| row.get(0),
  )?;

  let qty_s = parse_positive_major(high_qty, "quantity")?;
  let rate_s = parse_positive_major(deal_rate, "dealRate")?;
  let payment_major = parse_positive_major(low_qty, "paymentAmount")?;
  let qty_minor = money_from_major_units(&qty_s, inv_places)?;
  let rate_scaled = major_to_scaled(&rate_s, pay_places)?;

  let (new_qty_major, new_avg, cost_value, avg_at_post, cogs, gross) = if buy {
    match load_inventory(conn, high_currency_id)? {
      Some((old_qty, old_avg, old_pay_ccy, old_pay_places)) => {
        if old_pay_ccy != low_currency_id {
          let _ = old_pay_places;
          (
            qty_s.clone(),
            rate_s.clone(),
            payment_major.clone(),
            Some(rate_s.clone()),
            None,
            None,
          )
        } else {
          let old_qty_minor = money_from_major_units_signed(&old_qty, inv_places)?;
          let new_qty_minor = old_qty_minor + qty_minor;
          // Negative / zero starting stock: reset avg to this purchase rate.
          let (new_avg, avg_at_post) = if old_qty_minor <= 0 {
            (rate_s.clone(), Some(rate_s.clone()))
          } else {
            let old_avg_scaled = major_to_scaled(&old_avg, old_pay_places)?;
            let new_avg_scaled =
              weighted_avg_scaled(old_qty_minor, old_avg_scaled, qty_minor, rate_scaled);
            let new_avg = scaled_to_major(new_avg_scaled, pay_places)?;
            (new_avg.clone(), Some(new_avg))
          };
          let new_qty = signed_balance_to_display(new_qty_minor, inv_places)?;
          let cost_value = if new_qty_minor <= 0 {
            "0".into()
          } else {
            let avg_scaled = major_to_scaled(avg_at_post.as_deref().unwrap_or(&rate_s), pay_places)?;
            scaled_to_major(
              major_to_scaled(&new_qty, inv_places)?.saturating_mul(avg_scaled) / 100_000_000,
              pay_places,
            )?
          };
          (
            new_qty,
            new_avg,
            cost_value,
            avg_at_post,
            None,
            None,
          )
        }
      }
      None => (
        qty_s.clone(),
        rate_s.clone(),
        payment_major.clone(),
        Some(rate_s.clone()),
        None,
        None,
      ),
    }
  } else {
    let inv_code: String = conn.query_row(
      "SELECT code FROM Currency WHERE id = ?1",
      [high_currency_id],
      |row| row.get(0),
    )?;
    let (old_qty, old_avg, old_pay_ccy) = cover_inventory_shortfall_from_vault(
      conn,
      high_currency_id,
      &inv_code,
      inv_places,
      low_currency_id,
      pay_places,
      qty_minor,
      &rate_s,
      cash_wallet_id,
      created_by_id,
      true, // exchange already posted vault cash
    )?;
    let old_qty_minor = money_from_major_units_signed(&old_qty, inv_places)?;
    let avg_for_cogs = if old_qty_minor > 0 && old_pay_ccy == low_currency_id {
      old_avg.clone()
    } else {
      rate_s.clone()
    };
    let avg_scaled = major_to_scaled(&avg_for_cogs, pay_places)?;
    let cogs_major = scaled_to_major(
      major_to_scaled(&qty_s, inv_places)?.saturating_mul(avg_scaled) / 100_000_000,
      pay_places,
    )?;
    let pay_minor = money_from_major_units(&payment_major, pay_places)?;
    let cogs_minor = money_from_major_units_allow_zero(&cogs_major, pay_places)?;
    let profit_minor = pay_minor - cogs_minor;
    let profit_abs = money_to_major_unit_string(profit_minor.abs(), pay_places)?;
    let profit_signed = if profit_minor < 0 {
      format!("-{profit_abs}")
    } else {
      profit_abs
    };
    let new_qty_minor = old_qty_minor - qty_minor;
    let new_qty = signed_balance_to_display(new_qty_minor, inv_places)?;
    let new_avg = if new_qty_minor <= 0 {
      "0".into()
    } else if old_pay_ccy == low_currency_id {
      old_avg
    } else {
      rate_s.clone()
    };
    let cost_value = if new_qty_minor <= 0 {
      "0".into()
    } else {
      let abs_q = new_qty.trim_start_matches('-');
      scaled_to_major(
        major_to_scaled(abs_q, inv_places)?.saturating_mul(avg_scaled) / 100_000_000,
        pay_places,
      )?
    };
    (
      new_qty,
      new_avg.clone(),
      cost_value,
      Some(avg_for_cogs),
      Some(cogs_major),
      Some(profit_signed),
    )
  };

  upsert_inventory(
    conn,
    high_currency_id,
    &new_qty_major,
    &new_avg,
    low_currency_id,
    &cost_value,
    buy,
  )?;

  let (ct, cust, partner, cp_name) = if let Some(cid) = customer_id {
    let full: String = conn.query_row(
      "SELECT fullName FROM Customer WHERE id = ?1 AND deletedAt IS NULL",
      [cid],
      |row| row.get(0),
    )?;
    (
      "CUSTOMER".to_string(),
      Some(cid.to_string()),
      None::<String>,
      Some(full),
    )
  } else if let Some(name) = walk_in_name {
    (
      "WALK_IN".to_string(),
      None::<String>,
      None::<String>,
      Some(name.to_string()),
    )
  } else {
    (
      "WALK_IN".to_string(),
      None::<String>,
      None::<String>,
      Some("Walk-in".into()),
    )
  };

  let trade_id = uuid::Uuid::new_v4().to_string();
  let now = now_sqlite();
  conn.execute(
    "INSERT INTO TradingTrade (
       id, reference, direction, status, inventoryCurrencyId, quantity, rate,
       paymentCurrencyId, paymentAmount, counterpartyType, customerId, partnerSarafiId,
       counterpartyName, cashWalletId, avgCostAtPost, cogsAmount, grossProfit,
       inventoryQtyAfter, notes, transactionId, valueDate, createdById, deletedAt,
       createdAt, updatedAt
     ) VALUES (
       ?1,?2,?3,'POSTED',?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,NULL,?22,?22
     )",
    params![
      trade_id,
      reference,
      direction,
      high_currency_id,
      qty_s,
      rate_s,
      low_currency_id,
      payment_major,
      ct,
      cust,
      partner,
      cp_name,
      cash_wallet_id,
      avg_at_post,
      cogs,
      gross,
      new_qty_major,
      format!("Exchange {side}"),
      transaction_id,
      value_date,
      created_by_id,
      now,
    ],
  )?;
  Ok(())
}

/// Seed / increase trading inventory after Main Vault Cash In (no extra ledger).
/// Cost currency is typically AFN: `1 inventory = costRate costCurrency`.
pub fn apply_cash_in_to_trading_inventory(
  conn: &Connection,
  inventory_currency_code: &str,
  qty_major: &str,
  cost_rate: &str,
  cost_currency_code: &str,
  transaction_id: Option<&str>,
  reference: &str,
  value_date: &str,
  created_by_id: &str,
  cash_wallet_id: &str,
  notes: Option<&str>,
) -> Result<(), AppError> {
  let has_trade: bool = conn.query_row(
    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='TradingTrade')",
    [],
    |row| row.get(0),
  )?;
  if !has_trade {
    return Ok(());
  }

  let inv_code = inventory_currency_code.trim().to_ascii_uppercase();
  let pay_code = cost_currency_code.trim().to_ascii_uppercase();
  if inv_code.is_empty() || pay_code.is_empty() {
    return Err(AppError::Validation(
      "Inventory and cost currencies are required.".into(),
    ));
  }
  if inv_code == pay_code {
    return Err(AppError::Validation(
      "Cost rate currency must differ from the cash-in currency.".into(),
    ));
  }

  let (inv_id, _, inv_places) = crate::ledger::find_currency_by_code(conn, &inv_code)?;
  let (pay_id, _, pay_places) = crate::ledger::find_currency_by_code(conn, &pay_code)?;
  let qty_s = parse_positive_major(qty_major, "amount")?;
  let rate_s = parse_positive_major(cost_rate, "costRate")?;
  let qty_minor = money_from_major_units(&qty_s, inv_places)?;
  let rate_scaled = major_to_scaled(&rate_s, pay_places)?;
  let payment_major = payment_from_qty_rate(&qty_s, inv_places, &rate_s, pay_places)?;

  let (new_qty_major, new_avg, cost_value) = match load_inventory(conn, &inv_id)? {
    Some((old_qty, old_avg, old_pay_ccy, old_pay_places)) => {
      if old_pay_ccy != pay_id {
        let old_qty_minor = money_from_major_units_signed(&old_qty, inv_places)?;
        if old_qty_minor > 0 {
          return Err(AppError::Validation(format!(
            "Trading inventory for {inv_code} already uses a different cost currency. Cash in using the same cost currency, or sell/clear the position first."
          )));
        }
        // Short / empty stock with mismatched cost ccy: restart avg at this purchase.
        let new_qty_minor = old_qty_minor + qty_minor;
        let new_qty = signed_balance_to_display(new_qty_minor, inv_places)?;
        let (new_avg, cost_value) = if new_qty_minor <= 0 {
          ("0".into(), "0".into())
        } else {
          (
            rate_s.clone(),
            scaled_to_major(
              major_to_scaled(new_qty.trim_start_matches('-'), inv_places)?
                .saturating_mul(rate_scaled)
                / 100_000_000,
              pay_places,
            )?,
          )
        };
        (new_qty, new_avg, cost_value)
      } else {
        let old_qty_minor = money_from_major_units_signed(&old_qty, inv_places)?;
        let new_qty_minor = old_qty_minor + qty_minor;
        let (new_avg, new_avg_scaled) = if old_qty_minor <= 0 {
          (rate_s.clone(), rate_scaled)
        } else {
          let old_avg_scaled = major_to_scaled(&old_avg, old_pay_places)?;
          let new_avg_scaled =
            weighted_avg_scaled(old_qty_minor, old_avg_scaled, qty_minor, rate_scaled);
          (scaled_to_major(new_avg_scaled, pay_places)?, new_avg_scaled)
        };
        let new_qty = signed_balance_to_display(new_qty_minor, inv_places)?;
        let cost_value = if new_qty_minor <= 0 {
          "0".into()
        } else {
          scaled_to_major(
            major_to_scaled(new_qty.trim_start_matches('-'), inv_places)?
              .saturating_mul(new_avg_scaled)
              / 100_000_000,
            pay_places,
          )?
        };
        (new_qty, new_avg, cost_value)
      }
    }
    None => (qty_s.clone(), rate_s.clone(), payment_major.clone()),
  };

  upsert_inventory(
    conn,
    &inv_id,
    &new_qty_major,
    &new_avg,
    &pay_id,
    &cost_value,
    true,
  )?;

  let trade_id = uuid::Uuid::new_v4().to_string();
  let now = now_sqlite();
  let note = notes
    .map(|s| s.trim())
    .filter(|s| !s.is_empty())
    .map(|s| format!("Vault cash-in seed — {s}"))
    .unwrap_or_else(|| "Vault cash-in seed".into());

  conn.execute(
    "INSERT INTO TradingTrade (
       id, reference, direction, status, inventoryCurrencyId, quantity, rate,
       paymentCurrencyId, paymentAmount, counterpartyType, customerId, partnerSarafiId,
       counterpartyName, cashWalletId, avgCostAtPost, cogsAmount, grossProfit,
       inventoryQtyAfter, notes, transactionId, valueDate, createdById, deletedAt,
       createdAt, updatedAt
     ) VALUES (
       ?1,?2,'BUY','POSTED',?3,?4,?5,?6,?7,'OTHER',NULL,NULL,?8,?9,?10,NULL,NULL,?11,?12,?13,?14,?15,NULL,?16,?16
     )",
    params![
      trade_id,
      reference,
      inv_id,
      qty_s,
      rate_s,
      pay_id,
      payment_major,
      format!("Cash in {inv_code}"),
      cash_wallet_id,
      new_avg,
      new_qty_major,
      note,
      transaction_id,
      value_date,
      created_by_id,
      now,
    ],
  )?;

  // Bring trading stock up to Main Vault cash for this currency (closes historical gaps).
  align_inventory_up_to_vault(
    conn,
    &inv_id,
    &inv_code,
    inv_places,
    &pay_id,
    pay_places,
    &rate_s,
    cash_wallet_id,
    reference,
    value_date,
    created_by_id,
  )?;

  Ok(())
}

/// If trading inventory is below Main Vault cash, seed the difference at `rate_s`.
fn align_inventory_up_to_vault(
  conn: &Connection,
  inv_id: &str,
  inv_code: &str,
  inv_places: i64,
  pay_id: &str,
  pay_places: i64,
  rate_s: &str,
  cash_wallet_id: &str,
  reference: &str,
  value_date: &str,
  created_by_id: &str,
) -> Result<(), AppError> {
  let vault_minor =
    crate::ledger::wallet_currency_balance_minor(conn, cash_wallet_id, inv_id, inv_places)?;
  if vault_minor <= 0 {
    return Ok(());
  }
  let (old_qty, old_avg, old_pay_ccy, old_pay_places) = match load_inventory(conn, inv_id)? {
    Some(row) => row,
    None => ("0".into(), rate_s.to_string(), pay_id.to_string(), pay_places),
  };
  let old_qty_minor = money_from_major_units_signed(&old_qty, inv_places)?;
  if old_qty_minor >= vault_minor {
    return Ok(());
  }
  if old_qty_minor > 0 && old_pay_ccy != pay_id {
    return Ok(()); // don't mix cost currencies silently
  }
  let seed_minor = vault_minor - old_qty_minor;
  if seed_minor <= 0 {
    return Ok(());
  }
  seed_inventory_buy(
    conn,
    inv_id,
    inv_code,
    inv_places,
    pay_id,
    pay_places,
    seed_minor,
    rate_s,
    old_qty_minor,
    &old_avg,
    &old_pay_ccy,
    old_pay_places,
    cash_wallet_id,
    &format!("{reference}-align"),
    value_date,
    created_by_id,
    "Align inventory to Main Vault cash",
  )
}

fn seed_inventory_buy(
  conn: &Connection,
  inv_id: &str,
  inv_code: &str,
  inv_places: i64,
  pay_id: &str,
  pay_places: i64,
  seed_minor: i128,
  rate_s: &str,
  old_qty_minor: i128,
  old_avg: &str,
  old_pay_ccy: &str,
  old_pay_places: i64,
  cash_wallet_id: &str,
  reference: &str,
  value_date: &str,
  created_by_id: &str,
  note: &str,
) -> Result<(), AppError> {
  if seed_minor <= 0 {
    return Ok(());
  }
  let seed_s = money_to_major_unit_string(seed_minor, inv_places)?;
  let rate_s = parse_positive_major(rate_s, "rate")?;
  let rate_scaled = major_to_scaled(&rate_s, pay_places)?;
  let payment_major = payment_from_qty_rate(&seed_s, inv_places, &rate_s, pay_places)?;
  let new_qty_minor = old_qty_minor + seed_minor;
  let (new_avg, new_avg_scaled) = if old_qty_minor <= 0 || old_pay_ccy != pay_id {
    (rate_s.clone(), rate_scaled)
  } else {
    let old_avg_scaled = major_to_scaled(old_avg, old_pay_places)?;
    let new_avg_scaled =
      weighted_avg_scaled(old_qty_minor, old_avg_scaled, seed_minor, rate_scaled);
    (scaled_to_major(new_avg_scaled, pay_places)?, new_avg_scaled)
  };
  let new_qty = signed_balance_to_display(new_qty_minor, inv_places)?;
  let cost_value = if new_qty_minor <= 0 {
    "0".into()
  } else {
    scaled_to_major(
      major_to_scaled(new_qty.trim_start_matches('-'), inv_places)?
        .saturating_mul(new_avg_scaled)
        / 100_000_000,
      pay_places,
    )?
  };
  upsert_inventory(conn, inv_id, &new_qty, &new_avg, pay_id, &cost_value, true)?;

  let trade_id = uuid::Uuid::new_v4().to_string();
  let now = now_sqlite();
  conn.execute(
    "INSERT INTO TradingTrade (
       id, reference, direction, status, inventoryCurrencyId, quantity, rate,
       paymentCurrencyId, paymentAmount, counterpartyType, customerId, partnerSarafiId,
       counterpartyName, cashWalletId, avgCostAtPost, cogsAmount, grossProfit,
       inventoryQtyAfter, notes, transactionId, valueDate, createdById, deletedAt,
       createdAt, updatedAt
     ) VALUES (
       ?1,?2,'BUY','POSTED',?3,?4,?5,?6,?7,'OTHER',NULL,NULL,?8,?9,?10,NULL,NULL,?11,?12,NULL,?13,?14,NULL,?15,?15
     )",
    params![
      trade_id,
      reference,
      inv_id,
      seed_s,
      rate_s,
      pay_id,
      payment_major,
      format!("Vault cover {inv_code}"),
      cash_wallet_id,
      new_avg,
      new_qty,
      note,
      value_date,
      created_by_id,
      now,
    ],
  )?;
  Ok(())
}

/// When selling more than booked inventory, cover the shortfall from Main Vault cash
/// by seeding inventory at `deal_rate` (so vault FX is sellable).
///
/// Set `vault_already_reduced` when the sale ledger has already removed `need_qty_minor`
/// from the cash wallet (desk exchange posts cash before inventory).
pub fn cover_inventory_shortfall_from_vault(
  conn: &Connection,
  inv_id: &str,
  inv_code: &str,
  inv_places: i64,
  pay_id: &str,
  pay_places: i64,
  need_qty_minor: i128,
  deal_rate: &str,
  cash_wallet_id: &str,
  created_by_id: &str,
  vault_already_reduced: bool,
) -> Result<(String, String, String), AppError> {
  let (old_qty, old_avg, old_pay_ccy, old_pay_places) = match load_inventory(conn, inv_id)? {
    Some(row) => row,
    None => (
      "0".into(),
      deal_rate.to_string(),
      pay_id.to_string(),
      pay_places,
    ),
  };
  let mut old_qty_minor = money_from_major_units_signed(&old_qty, inv_places)?;
  let mut old_avg = old_avg;
  let mut old_pay_ccy = old_pay_ccy;
  let old_pay_places = old_pay_places;

  if need_qty_minor <= old_qty_minor {
    return Ok((
      signed_balance_to_display(old_qty_minor, inv_places)?,
      old_avg,
      old_pay_ccy,
    ));
  }

  let vault_minor =
    crate::ledger::wallet_currency_balance_minor(conn, cash_wallet_id, inv_id, inv_places)?;
  let vault_before = if vault_already_reduced {
    vault_minor.saturating_add(need_qty_minor)
  } else {
    vault_minor
  };
  if vault_before < need_qty_minor {
    let have = signed_balance_to_display(vault_before.max(0), inv_places)?;
    let need = money_to_major_unit_string(need_qty_minor, inv_places)?;
    return Err(AppError::Validation(format!(
      "Insufficient {inv_code} in Main Vault to sell (available {have}, need {need})."
    )));
  }

  // Bring inventory up to vault cash (not only the sale qty), so remaining stock stays tracked.
  let seed_minor = vault_before - old_qty_minor;
  if seed_minor > 0 {
    let rate_s = parse_positive_major(deal_rate, "dealRate")?;
    seed_inventory_buy(
      conn,
      inv_id,
      inv_code,
      inv_places,
      pay_id,
      pay_places,
      seed_minor,
      &rate_s,
      old_qty_minor,
      &old_avg,
      &old_pay_ccy,
      old_pay_places,
      cash_wallet_id,
      &format!(
        "COVER-{}-{}",
        inv_code,
        chrono::Utc::now().timestamp_millis()
      ),
      &now_sqlite(),
      created_by_id,
      "Align inventory to Main Vault cash before sale",
    )?;
  }

  if let Some((q, a, p, _)) = load_inventory(conn, inv_id)? {
    old_qty_minor = money_from_major_units_signed(&q, inv_places)?;
    old_avg = a;
    old_pay_ccy = p;
  } else {
    old_qty_minor = vault_before;
    old_avg = parse_positive_major(deal_rate, "dealRate")?;
    old_pay_ccy = pay_id.to_string();
  }

  if need_qty_minor > old_qty_minor {
    return Err(AppError::Validation(format!(
      "Insufficient {inv_code} trading stock after vault align."
    )));
  }

  Ok((
    signed_balance_to_display(old_qty_minor, inv_places)?,
    old_avg,
    old_pay_ccy,
  ))
}
