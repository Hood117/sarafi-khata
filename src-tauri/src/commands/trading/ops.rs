use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::AppError;
use crate::ledger::{
  find_currency_by_code, money_from_major_units, money_from_major_units_allow_zero,
  money_from_major_units_signed, money_to_major_unit_string, post_transaction,
  signed_balance_to_display, PostTransactionInput, PostingLineDto,
};
use crate::state::AppState;
use crate::commands::authorize::{require_screen};

use super::util::{
  assert_cash_wallet, cover_inventory_shortfall_from_vault, ensure_system_wallet, load_inventory,
  major_to_scaled, next_trade_reference, normalize_counterparty, now_sqlite, parse_positive_major,
  payment_from_qty_rate, require_nonempty, scaled_to_major, trading_allow_negative, trim_opt,
  upsert_inventory, weighted_avg_scaled, TRADING_CLEARING, TRADING_INVENTORY,
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TradeBuyInput {
  pub reference: Option<String>,
  pub inventory_currency_code: String,
  pub quantity: String,
  pub rate: String,
  pub payment_currency_code: String,
  pub payment_amount: Option<String>,
  /// Optional — shop cash is always Main Vault.
  pub cash_wallet_id: Option<String>,
  pub counterparty_type: String,
  pub customer_id: Option<String>,
  pub partner_sarafi_id: Option<String>,
  pub counterparty_name: Option<String>,
  pub walk_in_phone: Option<String>,
  pub notes: Option<String>,
  pub value_date: Option<String>,
  pub created_by_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TradeSellInput {
  pub reference: Option<String>,
  pub inventory_currency_code: String,
  pub quantity: String,
  pub rate: String,
  pub payment_currency_code: String,
  pub payment_amount: Option<String>,
  /// Optional — shop cash is always Main Vault.
  pub cash_wallet_id: Option<String>,
  pub counterparty_type: String,
  pub customer_id: Option<String>,
  pub partner_sarafi_id: Option<String>,
  pub counterparty_name: Option<String>,
  pub walk_in_phone: Option<String>,
  pub notes: Option<String>,
  pub value_date: Option<String>,
  pub created_by_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TradeResult {
  pub id: String,
  pub reference: String,
  pub direction: String,
  pub transaction_id: String,
  pub quantity: String,
  pub rate: String,
  pub payment_amount: String,
  pub avg_cost: Option<String>,
  pub cogs_amount: Option<String>,
  pub gross_profit: Option<String>,
  pub inventory_qty_after: String,
}

#[tauri::command]
pub fn trade_buy(state: State<'_, AppState>, input: TradeBuyInput) -> Result<TradeResult, AppError> {
  let _ = input.created_by_id.trim();
  let qty_s = parse_positive_major(&input.quantity, "quantity")?;
  let rate_s = parse_positive_major(&input.rate, "rate")?;
  let inv_code = require_nonempty(&input.inventory_currency_code, "inventoryCurrencyCode")?
    .to_ascii_uppercase();
  let pay_code = require_nonempty(&input.payment_currency_code, "paymentCurrencyCode")?
    .to_ascii_uppercase();
  if inv_code == pay_code {
    return Err(AppError::Validation(
      "Inventory and payment currencies must differ.".into(),
    ));
  }

  let conn = state.db.lock();
  let actor = require_screen(&state, &conn, "trading")?;
  let created_by = actor.id.clone();
  let cash_wallet_id = assert_cash_wallet(&conn, input.cash_wallet_id.as_deref())?;
  let (inv_id, inv_code, inv_places) = find_currency_by_code(&conn, &inv_code)?;
  let (pay_id, pay_code, pay_places) = find_currency_by_code(&conn, &pay_code)?;
  let qty_minor = money_from_major_units(&qty_s, inv_places)?;
  let rate_scaled = major_to_scaled(&rate_s, pay_places)?;
  let payment_major = match input.payment_amount.as_deref() {
    Some(p) => parse_positive_major(p, "paymentAmount")?,
    None => payment_from_qty_rate(&qty_s, inv_places, &rate_s, pay_places)?,
  };
  let pay_minor = money_from_major_units(&payment_major, pay_places)?;

  let (ct, customer_id, partner_id, cp_name) = normalize_counterparty(
    &conn,
    &input.counterparty_type,
    input.customer_id,
    input.partner_sarafi_id,
    input.counterparty_name,
  )?;
  let walk_in_name = if ct == "WALK_IN" {
    cp_name.clone()
  } else {
    None
  };
  let walk_in_phone = if ct == "WALK_IN" {
    trim_opt(input.walk_in_phone)
  } else {
    None
  };

  let (new_qty_major, new_avg, cost_value) = match load_inventory(&conn, &inv_id)? {
    Some((old_qty, old_avg, old_pay_ccy, old_pay_places)) => {
      if old_pay_ccy != pay_id {
        return Err(AppError::Validation(
          "Payment currency must match this inventory's average-cost currency.".into(),
        ));
      }
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
    None => (qty_s.clone(), rate_s.clone(), payment_major.clone()),
  };

  let inventory_wallet = ensure_system_wallet(&conn, TRADING_INVENTORY)?;
  let clearing = ensure_system_wallet(&conn, TRADING_CLEARING)?;
  let reference = match trim_opt(input.reference) {
    Some(r) => r,
    None => next_trade_reference(&conn)?,
  };
  let value_date = trim_opt(input.value_date).unwrap_or_else(now_sqlite);
  let notes = trim_opt(input.notes);
  let memo = format!("Trade BUY {qty_s} {inv_code} @ {rate_s}");

  let posted = post_transaction(
    &conn,
    PostTransactionInput {
      reference: reference.clone(),
      r#type: "TRADE_BUY".into(),
      value_date: value_date.clone(),
      customer_id: customer_id.clone(),
      walk_in_name: walk_in_name.clone(),
      walk_in_phone: walk_in_phone.clone(),
      description: Some(format!(
        "Trading purchase {qty_s} {inv_code} for {payment_major} {pay_code}"
      )),
      created_by_id: Some(created_by.clone()),
      entries: vec![
        PostingLineDto {
          wallet_id: inventory_wallet,
          currency: inv_code.clone(),
          direction: "DEBIT".into(),
          amount_minor: qty_minor.to_string(),
          exchange_rate_id: None,
          memo: Some(memo.clone()),
        },
        PostingLineDto {
          wallet_id: clearing.clone(),
          currency: inv_code.clone(),
          direction: "CREDIT".into(),
          amount_minor: qty_minor.to_string(),
          exchange_rate_id: None,
          memo: Some(memo.clone()),
        },
        PostingLineDto {
          wallet_id: clearing,
          currency: pay_code.clone(),
          direction: "DEBIT".into(),
          amount_minor: pay_minor.to_string(),
          exchange_rate_id: None,
          memo: Some(memo.clone()),
        },
        PostingLineDto {
          wallet_id: cash_wallet_id.clone(),
          currency: pay_code.clone(),
          direction: "CREDIT".into(),
          amount_minor: pay_minor.to_string(),
          exchange_rate_id: None,
          memo: Some(memo),
        },
      ],
    },
  )?;

  upsert_inventory(
    &conn,
    &inv_id,
    &new_qty_major,
    &new_avg,
    &pay_id,
    &cost_value,
    true,
  )?;

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
       ?1,?2,'BUY','POSTED',?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,NULL,NULL,?14,?15,?16,?17,?18,NULL,?19,?19
     )",
    params![
      trade_id,
      reference,
      inv_id,
      qty_s,
      rate_s,
      pay_id,
      payment_major,
      ct,
      customer_id,
      partner_id,
      cp_name,
      cash_wallet_id,
      new_avg,
      new_qty_major,
      notes,
      posted.id,
      value_date,
      created_by,
      now,
    ],
  )?;

  Ok(TradeResult {
    id: trade_id,
    reference,
    direction: "BUY".into(),
    transaction_id: posted.id,
    quantity: qty_s,
    rate: rate_s,
    payment_amount: payment_major,
    avg_cost: Some(new_avg),
    cogs_amount: None,
    gross_profit: None,
    inventory_qty_after: new_qty_major,
  })
}

#[tauri::command]
pub fn trade_sell(
  state: State<'_, AppState>,
  input: TradeSellInput,
) -> Result<TradeResult, AppError> {
  let _ = input.created_by_id.trim();
  let qty_s = parse_positive_major(&input.quantity, "quantity")?;
  let rate_s = parse_positive_major(&input.rate, "rate")?;
  let inv_code = require_nonempty(&input.inventory_currency_code, "inventoryCurrencyCode")?
    .to_ascii_uppercase();
  let pay_code = require_nonempty(&input.payment_currency_code, "paymentCurrencyCode")?
    .to_ascii_uppercase();
  if inv_code == pay_code {
    return Err(AppError::Validation(
      "Inventory and payment currencies must differ.".into(),
    ));
  }

  let conn = state.db.lock();
  let actor = require_screen(&state, &conn, "trading")?;
  let created_by = actor.id.clone();
  let cash_wallet_id = assert_cash_wallet(&conn, input.cash_wallet_id.as_deref())?;
  let (inv_id, inv_code, inv_places) = find_currency_by_code(&conn, &inv_code)?;
  let (pay_id, pay_code, pay_places) = find_currency_by_code(&conn, &pay_code)?;
  let qty_minor = money_from_major_units(&qty_s, inv_places)?;
  let payment_major = match input.payment_amount.as_deref() {
    Some(p) => parse_positive_major(p, "paymentAmount")?,
    None => payment_from_qty_rate(&qty_s, inv_places, &rate_s, pay_places)?,
  };
  let pay_minor = money_from_major_units(&payment_major, pay_places)?;

  let (ct, customer_id, partner_id, cp_name) = normalize_counterparty(
    &conn,
    &input.counterparty_type,
    input.customer_id,
    input.partner_sarafi_id,
    input.counterparty_name,
  )?;
  let walk_in_name = if ct == "WALK_IN" {
    cp_name.clone()
  } else {
    None
  };
  let walk_in_phone = if ct == "WALK_IN" {
    trim_opt(input.walk_in_phone)
  } else {
    None
  };

  let allow_neg = trading_allow_negative(&conn)?;
  let (old_qty, old_avg, old_pay_ccy) = if allow_neg {
    match load_inventory(&conn, &inv_id)? {
      Some((q, a, p, _)) => (q, a, p),
      None => ("0".into(), rate_s.clone(), pay_id.clone()),
    }
  } else {
    cover_inventory_shortfall_from_vault(
      &conn,
      &inv_id,
      &inv_code,
      inv_places,
      &pay_id,
      pay_places,
      qty_minor,
      &rate_s,
      &cash_wallet_id,
      &created_by,
      false, // trade_sell posts cash after this check
    )?
  };
  if old_pay_ccy != pay_id {
    return Err(AppError::Validation(
      "Payment currency must match inventory average-cost currency.".into(),
    ));
  }
  let old_qty_minor = money_from_major_units_signed(&old_qty, inv_places)?;
  if qty_minor > old_qty_minor && allow_neg {
    // allowed short sale
  } else if qty_minor > old_qty_minor {
    return Err(AppError::Validation(
      "Insufficient inventory for this sale.".into(),
    ));
  }

  let avg_scaled = major_to_scaled(&old_avg, pay_places)?;
  let cogs_major = scaled_to_major(
    major_to_scaled(&qty_s, inv_places)?.saturating_mul(avg_scaled) / 100_000_000,
    pay_places,
  )?;
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
  } else {
    old_avg.clone()
  };
  let cost_value = if new_qty_minor <= 0 {
    "0".into()
  } else {
    scaled_to_major(
      major_to_scaled(new_qty.trim_start_matches('-'), inv_places)?
        .saturating_mul(avg_scaled)
        / 100_000_000,
      pay_places,
    )?
  };

  let inventory_wallet = ensure_system_wallet(&conn, TRADING_INVENTORY)?;
  let clearing = ensure_system_wallet(&conn, TRADING_CLEARING)?;
  let reference = match trim_opt(input.reference) {
    Some(r) => r,
    None => next_trade_reference(&conn)?,
  };
  let value_date = trim_opt(input.value_date).unwrap_or_else(now_sqlite);
  let notes = trim_opt(input.notes);
  let memo = format!("Trade SELL {qty_s} {inv_code} @ {rate_s}");

  let posted = post_transaction(
    &conn,
    PostTransactionInput {
      reference: reference.clone(),
      r#type: "TRADE_SELL".into(),
      value_date: value_date.clone(),
      customer_id: customer_id.clone(),
      walk_in_name: walk_in_name.clone(),
      walk_in_phone: walk_in_phone.clone(),
      description: Some(format!(
        "Trading sale {qty_s} {inv_code} for {payment_major} {pay_code} (P/L {profit_signed})"
      )),
      created_by_id: Some(created_by.clone()),
      entries: vec![
        PostingLineDto {
          wallet_id: inventory_wallet,
          currency: inv_code.clone(),
          direction: "CREDIT".into(),
          amount_minor: qty_minor.to_string(),
          exchange_rate_id: None,
          memo: Some(memo.clone()),
        },
        PostingLineDto {
          wallet_id: clearing.clone(),
          currency: inv_code.clone(),
          direction: "DEBIT".into(),
          amount_minor: qty_minor.to_string(),
          exchange_rate_id: None,
          memo: Some(memo.clone()),
        },
        PostingLineDto {
          wallet_id: cash_wallet_id.clone(),
          currency: pay_code.clone(),
          direction: "DEBIT".into(),
          amount_minor: pay_minor.to_string(),
          exchange_rate_id: None,
          memo: Some(memo.clone()),
        },
        PostingLineDto {
          wallet_id: clearing,
          currency: pay_code.clone(),
          direction: "CREDIT".into(),
          amount_minor: pay_minor.to_string(),
          exchange_rate_id: None,
          memo: Some(memo),
        },
      ],
    },
  )?;

  upsert_inventory(&conn, &inv_id, &new_qty, &new_avg, &pay_id, &cost_value, false)?;

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
       ?1,?2,'SELL','POSTED',?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,NULL,?21,?21
     )",
    params![
      trade_id,
      reference,
      inv_id,
      qty_s,
      rate_s,
      pay_id,
      payment_major,
      ct,
      customer_id,
      partner_id,
      cp_name,
      cash_wallet_id,
      old_avg,
      cogs_major,
      profit_signed,
      new_qty,
      notes,
      posted.id,
      value_date,
      created_by,
      now,
    ],
  )?;

  Ok(TradeResult {
    id: trade_id,
    reference,
    direction: "SELL".into(),
    transaction_id: posted.id,
    quantity: qty_s,
    rate: rate_s,
    payment_amount: payment_major,
    avg_cost: Some(old_avg),
    cogs_amount: Some(cogs_major),
    gross_profit: Some(profit_signed),
    inventory_qty_after: new_qty,
  })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TradeIdInput {
  pub id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TradeDetail {
  pub id: String,
  pub reference: String,
  pub direction: String,
  pub status: String,
  pub inventory_currency_code: String,
  pub quantity: String,
  pub rate: String,
  pub payment_currency_code: String,
  pub payment_amount: String,
  pub cash_wallet_id: String,
  pub counterparty_type: String,
  pub customer_id: Option<String>,
  pub partner_sarafi_id: Option<String>,
  pub counterparty_name: Option<String>,
  pub notes: Option<String>,
  pub avg_cost_at_post: Option<String>,
  pub cogs_amount: Option<String>,
  pub gross_profit: Option<String>,
  pub inventory_qty_after: Option<String>,
  pub value_date: String,
  pub transaction_id: Option<String>,
}

#[tauri::command]
pub fn get_trade(
  state: State<'_, AppState>,
  input: TradeIdInput,
) -> Result<TradeDetail, AppError> {
  let id = require_nonempty(&input.id, "id")?;
  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "trading")?;
  conn
    .query_row(
      "SELECT t.id, t.reference, t.direction, t.status, ic.code, CAST(t.quantity AS TEXT),
              CAST(t.rate AS TEXT), pc.code, CAST(t.paymentAmount AS TEXT), t.cashWalletId,
              t.counterpartyType, t.customerId, t.partnerSarafiId, t.counterpartyName, t.notes,
              CAST(t.avgCostAtPost AS TEXT), CAST(t.cogsAmount AS TEXT), CAST(t.grossProfit AS TEXT),
              CAST(t.inventoryQtyAfter AS TEXT), t.valueDate, t.transactionId
       FROM TradingTrade t
       INNER JOIN Currency ic ON ic.id = t.inventoryCurrencyId
       INNER JOIN Currency pc ON pc.id = t.paymentCurrencyId
       WHERE t.id = ?1 AND t.deletedAt IS NULL
       LIMIT 1",
      [&id],
      |row| {
        Ok(TradeDetail {
          id: row.get(0)?,
          reference: row.get(1)?,
          direction: row.get(2)?,
          status: row.get(3)?,
          inventory_currency_code: row.get(4)?,
          quantity: row.get(5)?,
          rate: row.get(6)?,
          payment_currency_code: row.get(7)?,
          payment_amount: row.get(8)?,
          cash_wallet_id: row.get(9)?,
          counterparty_type: row.get(10)?,
          customer_id: row.get(11)?,
          partner_sarafi_id: row.get(12)?,
          counterparty_name: row.get(13)?,
          notes: row.get(14)?,
          avg_cost_at_post: row.get(15)?,
          cogs_amount: row.get(16)?,
          gross_profit: row.get(17)?,
          inventory_qty_after: row.get(18)?,
          value_date: row.get(19)?,
          transaction_id: row.get(20)?,
        })
      },
    )
    .map_err(|e| match e {
      rusqlite::Error::QueryReturnedNoRows => AppError::NotFound("Trade not found.".into()),
      other => other.into(),
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTradeInput {
  pub id: String,
  pub notes: Option<String>,
  pub value_date: Option<String>,
  pub counterparty_type: String,
  pub customer_id: Option<String>,
  pub partner_sarafi_id: Option<String>,
  pub counterparty_name: Option<String>,
}

#[tauri::command]
pub fn update_trade(
  state: State<'_, AppState>,
  input: UpdateTradeInput,
) -> Result<TradeDetail, AppError> {
  let id = require_nonempty(&input.id, "id")?;
  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "trading")?;
  let exists: i64 = conn.query_row(
    "SELECT COUNT(*) FROM TradingTrade WHERE id = ?1 AND deletedAt IS NULL",
    [&id],
    |row| row.get(0),
  )?;
  if exists == 0 {
    return Err(AppError::NotFound("Trade not found.".into()));
  }

  let (ct, customer_id, partner_id, cp_name) = normalize_counterparty(
    &conn,
    &input.counterparty_type,
    input.customer_id,
    input.partner_sarafi_id,
    input.counterparty_name,
  )?;
  let notes = trim_opt(input.notes);
  let value_date = trim_opt(input.value_date);
  let now = now_sqlite();

  conn.execute(
    "UPDATE TradingTrade SET
       notes = ?1,
       valueDate = COALESCE(?2, valueDate),
       counterpartyType = ?3,
       customerId = ?4,
       partnerSarafiId = ?5,
       counterpartyName = ?6,
       updatedAt = ?7
     WHERE id = ?8 AND deletedAt IS NULL",
    params![
      notes,
      value_date,
      ct,
      customer_id,
      partner_id,
      cp_name,
      now,
      id
    ],
  )?;
  get_trade_conn(&conn, &id)
}

fn get_trade_conn(conn: &rusqlite::Connection, id: &str) -> Result<TradeDetail, AppError> {
  conn
    .query_row(
      "SELECT t.id, t.reference, t.direction, t.status, ic.code, CAST(t.quantity AS TEXT),
              CAST(t.rate AS TEXT), pc.code, CAST(t.paymentAmount AS TEXT), t.cashWalletId,
              t.counterpartyType, t.customerId, t.partnerSarafiId, t.counterpartyName, t.notes,
              CAST(t.avgCostAtPost AS TEXT), CAST(t.cogsAmount AS TEXT), CAST(t.grossProfit AS TEXT),
              CAST(t.inventoryQtyAfter AS TEXT), t.valueDate, t.transactionId
       FROM TradingTrade t
       INNER JOIN Currency ic ON ic.id = t.inventoryCurrencyId
       INNER JOIN Currency pc ON pc.id = t.paymentCurrencyId
       WHERE t.id = ?1 AND t.deletedAt IS NULL
       LIMIT 1",
      [id],
      |row| {
        Ok(TradeDetail {
          id: row.get(0)?,
          reference: row.get(1)?,
          direction: row.get(2)?,
          status: row.get(3)?,
          inventory_currency_code: row.get(4)?,
          quantity: row.get(5)?,
          rate: row.get(6)?,
          payment_currency_code: row.get(7)?,
          payment_amount: row.get(8)?,
          cash_wallet_id: row.get(9)?,
          counterparty_type: row.get(10)?,
          customer_id: row.get(11)?,
          partner_sarafi_id: row.get(12)?,
          counterparty_name: row.get(13)?,
          notes: row.get(14)?,
          avg_cost_at_post: row.get(15)?,
          cogs_amount: row.get(16)?,
          gross_profit: row.get(17)?,
          inventory_qty_after: row.get(18)?,
          value_date: row.get(19)?,
          transaction_id: row.get(20)?,
        })
      },
    )
    .map_err(|e| match e {
      rusqlite::Error::QueryReturnedNoRows => AppError::NotFound("Trade not found.".into()),
      other => other.into(),
    })
}

#[tauri::command]
pub fn archive_trade(
  state: State<'_, AppState>,
  input: TradeIdInput,
) -> Result<TradeDetail, AppError> {
  let id = require_nonempty(&input.id, "id")?;
  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "trading")?;
  let row: (String, Option<String>) = conn
    .query_row(
      "SELECT inventoryCurrencyId, transactionId FROM TradingTrade
       WHERE id = ?1 AND deletedAt IS NULL LIMIT 1",
      [&id],
      |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .map_err(|e| match e {
      rusqlite::Error::QueryReturnedNoRows => AppError::NotFound("Trade not found.".into()),
      other => other.into(),
    })?;
  let (inv_id, tx_id) = row;
  let now = now_sqlite();
  if let Some(tx) = tx_id.as_deref() {
    super::util::soft_delete_transaction(&conn, tx)?;
  }
  conn.execute(
    "UPDATE TradingTrade SET deletedAt = ?1, status = 'ARCHIVED', updatedAt = ?1
     WHERE id = ?2 AND deletedAt IS NULL",
    params![now, id],
  )?;
  super::util::rebuild_inventory_for_currency(&conn, &inv_id)?;

  conn
    .query_row(
      "SELECT t.id, t.reference, t.direction, t.status, ic.code, CAST(t.quantity AS TEXT),
              CAST(t.rate AS TEXT), pc.code, CAST(t.paymentAmount AS TEXT), t.cashWalletId,
              t.counterpartyType, t.customerId, t.partnerSarafiId, t.counterpartyName, t.notes,
              CAST(t.avgCostAtPost AS TEXT), CAST(t.cogsAmount AS TEXT), CAST(t.grossProfit AS TEXT),
              CAST(t.inventoryQtyAfter AS TEXT), t.valueDate, t.transactionId
       FROM TradingTrade t
       INNER JOIN Currency ic ON ic.id = t.inventoryCurrencyId
       INNER JOIN Currency pc ON pc.id = t.paymentCurrencyId
       WHERE t.id = ?1 LIMIT 1",
      [&id],
      |row| {
        Ok(TradeDetail {
          id: row.get(0)?,
          reference: row.get(1)?,
          direction: row.get(2)?,
          status: row.get(3)?,
          inventory_currency_code: row.get(4)?,
          quantity: row.get(5)?,
          rate: row.get(6)?,
          payment_currency_code: row.get(7)?,
          payment_amount: row.get(8)?,
          cash_wallet_id: row.get(9)?,
          counterparty_type: row.get(10)?,
          customer_id: row.get(11)?,
          partner_sarafi_id: row.get(12)?,
          counterparty_name: row.get(13)?,
          notes: row.get(14)?,
          avg_cost_at_post: row.get(15)?,
          cogs_amount: row.get(16)?,
          gross_profit: row.get(17)?,
          inventory_qty_after: row.get(18)?,
          value_date: row.get(19)?,
          transaction_id: row.get(20)?,
        })
      },
    )
    .map_err(AppError::from)
}
