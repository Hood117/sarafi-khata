//! Currency exchange posting (4-leg EXCHANGE) + deal P/L vs board rate.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::AppError;
use crate::ledger::{
  find_currency_by_code, money_from_major_units, money_to_major_unit_string, post_transaction_in_tx,
  resolve_main_vault_id, restore_temporary_customers_for_movement_edit, PostTransactionInput,
  PostedTransaction, PostingLineDto,
};
use crate::state::AppState;
use crate::util::{now_sqlite, today_local};
use crate::commands::authorize::{require_any_screen, require_any_screen_write};

const EXCHANGE_DIFFERENCE_WALLET_NAME: &str = "Exchange Difference";
const RATE_MAX_DECIMALS: u32 = 8;
const SNAPSHOT_SOURCE: &str = "transaction-snapshot:deal-amounts";

fn require_nonempty(value: &str, field: &str) -> Result<String, AppError> {
  let trimmed = value.trim().to_string();
  if trimmed.is_empty() {
    return Err(AppError::Validation(format!("{field} is required.")));
  }
  Ok(trimmed)
}

fn parse_positive_f64(raw: &str, field: &str) -> Result<f64, AppError> {
  let n: f64 = raw
    .trim()
    .replace(',', "")
    .parse()
    .map_err(|_| AppError::Validation(format!("{field} must be a positive number.")))?;
  if !n.is_finite() || n <= 0.0 {
    return Err(AppError::Validation(format!(
      "{field} must be a positive number."
    )));
  }
  Ok(n)
}

fn fmt_money(v: f64) -> String {
  if !v.is_finite() {
    return "0".into();
  }
  if (v - v.round()).abs() < 1e-9 {
    format!("{}", v.round() as i64)
  } else {
    format!("{v:.6}")
      .trim_end_matches('0')
      .trim_end_matches('.')
      .to_string()
  }
}

fn load_wallet(
  conn: &Connection,
  id: &str,
) -> Result<(String, String, Option<String>, i64), AppError> {
  conn
    .query_row(
      "SELECT id, type, customerId, isActive FROM Wallet
       WHERE id = ?1 AND deletedAt IS NULL LIMIT 1",
      [id],
      |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    )
    .map_err(|e| match e {
      rusqlite::Error::QueryReturnedNoRows => AppError::NotFound("Wallet was not found.".into()),
      other => other.into(),
    })
}

fn resolve_exchange_difference_wallet(conn: &Connection) -> Result<String, AppError> {
  let existing: Option<String> = conn
    .query_row(
      "SELECT id FROM Wallet
       WHERE name = ?1 AND type = 'SYSTEM' AND deletedAt IS NULL AND isActive = 1
       LIMIT 1",
      [EXCHANGE_DIFFERENCE_WALLET_NAME],
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
    params![id, EXCHANGE_DIFFERENCE_WALLET_NAME, now],
  )?;
  Ok(id)
}

fn assert_exchange_wallet(
  wtype: &str,
  customer_link: &Option<String>,
  active: i64,
  name_hint: &str,
  customer_id: Option<&str>,
  diff_wallet_id: &str,
  wallet_id: &str,
) -> Result<(), AppError> {
  if active == 0 {
    return Err(AppError::Validation(format!(
      "Wallet \"{name_hint}\" is inactive and cannot be used for exchange."
    )));
  }
  if wallet_id == diff_wallet_id {
    return Err(AppError::Validation(format!(
      "\"{EXCHANGE_DIFFERENCE_WALLET_NAME}\" cannot be used as an exchange from/to wallet."
    )));
  }
  match customer_id {
    None => {
      if wtype != "VAULT" && wtype != "TILL" {
        return Err(AppError::Validation(
          "Walk-in exchange must use vault or till cash wallets.".into(),
        ));
      }
    }
    Some(cid) => {
      if wtype != "CUSTOMER" && wtype != "VAULT" && wtype != "TILL" {
        return Err(AppError::Validation(
          "Exchange wallets must be customer, vault, or till wallets.".into(),
        ));
      }
      if wtype == "CUSTOMER" {
        match customer_link {
          Some(link) if link == cid => {}
          _ => {
            return Err(AppError::Validation(
              "Customer wallet does not belong to the selected customer.".into(),
            ));
          }
        }
      }
    }
  }
  Ok(())
}

fn pow10(exp: u32) -> i128 {
  let mut v = 1i128;
  for _ in 0..exp {
    v = v.saturating_mul(10);
  }
  v
}

fn div_round_half_up(numerator: i128, denominator: i128) -> i128 {
  if denominator <= 0 {
    return 0;
  }
  let quotient = numerator / denominator;
  let remainder = numerator % denominator;
  if remainder * 2 >= denominator {
    quotient + 1
  } else {
    quotient
  }
}

fn rate_from_minors(
  numerator_minor: i128,
  numerator_decimals: i64,
  denominator_minor: i128,
  denominator_decimals: i64,
) -> Option<String> {
  if numerator_minor <= 0 || denominator_minor <= 0 {
    return None;
  }
  let num_dec = numerator_decimals.max(0) as u32;
  let den_dec = denominator_decimals.max(0) as u32;
  let numerator = numerator_minor.saturating_mul(pow10(den_dec + RATE_MAX_DECIMALS));
  let denominator = denominator_minor.saturating_mul(pow10(num_dec));
  let scaled = div_round_half_up(numerator, denominator);
  if scaled <= 0 {
    return None;
  }
  let scale = pow10(RATE_MAX_DECIMALS);
  let whole = scaled / scale;
  let fraction = (scaled % scale).to_string();
  let fraction = format!("{:0>width$}", fraction, width = RATE_MAX_DECIMALS as usize);
  let frac = fraction.trim_end_matches('0').to_string();
  if frac.is_empty() {
    Some(whole.to_string())
  } else {
    Some(format!("{whole}.{frac}"))
  }
}

/// 1 high = rate low. Shop buys high when customer gives high; sells high when customer receives high.
fn compute_deal_pnl(
  from_code: &str,
  to_code: &str,
  from_major: f64,
  to_major: f64,
  high_code: &str,
  deal_rate: f64,
  board_rate: Option<f64>,
) -> Result<(String, String, String, f64, String), AppError> {
  let low_code = if high_code.eq_ignore_ascii_case(from_code) {
    to_code
  } else if high_code.eq_ignore_ascii_case(to_code) {
    from_code
  } else {
    return Err(AppError::Validation(
      "High currency must be either the from or to currency.".into(),
    ));
  };

  let shop_buys_high = from_code.eq_ignore_ascii_case(high_code);
  let side = if shop_buys_high {
    "BUY_HIGH"
  } else {
    "SELL_HIGH"
  };
  let high_amount = if shop_buys_high { from_major } else { to_major };

  let profit = match board_rate {
    Some(board) if board > 0.0 => {
      if shop_buys_high {
        // Shop pays deal low per high; market is board. Profit if deal < board.
        high_amount * (board - deal_rate)
      } else {
        // Shop receives deal low per high; market is board. Profit if deal > board.
        high_amount * (deal_rate - board)
      }
    }
    _ => 0.0,
  };

  Ok((
    side.into(),
    low_code.to_string(),
    fmt_money(deal_rate),
    profit,
    fmt_money(profit),
  ))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExchangeInput {
  pub reference: String,
  pub from_wallet_id: String,
  pub to_wallet_id: String,
  pub from_currency_code: String,
  pub to_currency_code: String,
  pub amount: String,
  pub to_amount: String,
  /// 1 highCurrency = dealRate lowCurrency (customer deal).
  pub deal_rate: Option<String>,
  /// 1 highCurrency = boardRate lowCurrency (market / cost).
  pub board_rate: Option<String>,
  pub high_currency_code: Option<String>,
  pub customer_id: Option<String>,
  pub walk_in_name: Option<String>,
  pub walk_in_phone: Option<String>,
  pub value_date: Option<String>,
  pub description: Option<String>,
  pub created_by_id: String,
  /// Soft-delete this prior EXCHANGE transaction (and linked deal/trade) before posting.
  pub replace_transaction_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExchangeFundsResult {
  pub transaction: PostedTransaction,
  pub from_currency_code: String,
  pub to_currency_code: String,
  pub from_amount: String,
  pub to_amount: String,
  pub rate: String,
  pub exchange_rate_id: String,
  pub high_currency_code: String,
  pub low_currency_code: String,
  pub deal_rate: String,
  pub board_rate: Option<String>,
  pub side: String,
  pub profit_amount: String,
  pub profit_currency_code: String,
  pub is_profit: bool,
}

#[tauri::command]
pub fn exchange_funds(
  state: State<'_, AppState>,
  input: ExchangeInput,
) -> Result<ExchangeFundsResult, AppError> {
  let reference = require_nonempty(&input.reference, "reference")?;
  let _ = input.created_by_id.trim();
  let from_ccy_in = require_nonempty(&input.from_currency_code, "fromCurrencyCode")?;
  let to_ccy_in = require_nonempty(&input.to_currency_code, "toCurrencyCode")?;
  if from_ccy_in.eq_ignore_ascii_case(&to_ccy_in) {
    return Err(AppError::Validation(
      "From and to currencies must be different.".into(),
    ));
  }

  let customer_id = input
    .customer_id
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(|s| s.to_string());
  let is_walk_in = customer_id.is_none();

  let conn = state.db.lock();
  let actor = require_any_screen(&state, &conn, &["cash", "customers"])?;
  let created_by_id = actor.id.clone();

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
    if !tx_type.eq_ignore_ascii_case("EXCHANGE") {
      return Err(AppError::Validation(format!(
        "Cannot replace a {tx_type} transaction with an EXCHANGE."
      )));
    }
  }

  // Walk-in FX uses the single shop cash wallet (Main Vault) for both currencies.
  // Account FX may use one customer wallet for both currencies.
  let (from_wallet_id, to_wallet_id) = if is_walk_in {
    let main = resolve_main_vault_id(&conn)?;
    (main.clone(), main)
  } else {
    (
      require_nonempty(&input.from_wallet_id, "fromWalletId")?,
      require_nonempty(&input.to_wallet_id, "toWalletId")?,
    )
  };

  if let Some(ref cid) = customer_id {
    restore_temporary_customers_for_movement_edit(
      &conn,
      replace_id.as_deref(),
      &[cid.as_str()],
    )?;
    let row: Option<(i64, Option<String>)> = conn
      .query_row(
        "SELECT isActive, deletedAt FROM Customer WHERE id = ?1 LIMIT 1",
        [cid],
        |row| Ok((row.get(0)?, row.get(1)?)),
      )
      .optional()?;
    match row {
      None => return Err(AppError::NotFound("Customer was not found.".into())),
      Some((0, _)) | Some((_, Some(_))) => {
        return Err(AppError::Validation(
          "Customer is inactive and cannot be used for exchange.".into(),
        ));
      }
      _ => {}
    }
  }

  let diff_id = resolve_exchange_difference_wallet(&conn)?;
  let (from_id, from_type, from_cust, from_active) = load_wallet(&conn, &from_wallet_id)?;
  let (to_id, to_type, to_cust, to_active) = load_wallet(&conn, &to_wallet_id)?;
  assert_exchange_wallet(
    &from_type,
    &from_cust,
    from_active,
    "from",
    customer_id.as_deref(),
    &diff_id,
    &from_id,
  )?;
  assert_exchange_wallet(
    &to_type,
    &to_cust,
    to_active,
    "to",
    customer_id.as_deref(),
    &diff_id,
    &to_id,
  )?;

  let (from_currency_id, from_code, from_places) = find_currency_by_code(&conn, &from_ccy_in)?;
  let (to_currency_id, to_code, to_places) = find_currency_by_code(&conn, &to_ccy_in)?;
  let from_minor = money_from_major_units(&input.amount, from_places)?;
  let to_minor = money_from_major_units(&input.to_amount, to_places)?;
  let from_amount = money_to_major_unit_string(from_minor, from_places)?;
  let to_amount = money_to_major_unit_string(to_minor, to_places)?;
  let from_major = parse_positive_f64(&from_amount, "amount")?;
  let to_major = parse_positive_f64(&to_amount, "toAmount")?;

  let derived_rate =
    rate_from_minors(to_minor, to_places, from_minor, from_places).ok_or_else(|| {
      AppError::Validation("Unable to derive a deal rate from the entered amounts.".into())
    })?;

  let high_code = input
    .high_currency_code
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(|s| s.to_ascii_uppercase())
    .unwrap_or_else(|| from_code.clone());

  let deal_rate_f = if let Some(ref dr) = input.deal_rate {
    let t = dr.trim();
    if !t.is_empty() {
      parse_positive_f64(t, "dealRate")?
    } else if high_code.eq_ignore_ascii_case(&from_code) {
      // Customer gives high → derived rate is low per 1 high.
      parse_positive_f64(&derived_rate, "dealRate")?
    } else {
      // Customer receives high → 1 high = from/to low units.
      from_major / to_major
    }
  } else if high_code.eq_ignore_ascii_case(&from_code) {
    parse_positive_f64(&derived_rate, "dealRate")?
  } else {
    from_major / to_major
  };

  let board_rate_f = input
    .board_rate
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(|s| parse_positive_f64(s, "boardRate"))
    .transpose()?;

  let (side, low_code, deal_rate_s, profit_f, profit_s) = compute_deal_pnl(
    &from_code,
    &to_code,
    from_major,
    to_major,
    &high_code,
    deal_rate_f,
    board_rate_f,
  )?;

  let (high_currency_id, high_code_resolved, _) = find_currency_by_code(&conn, &high_code)?;
  let (low_currency_id, low_code_resolved, _) = find_currency_by_code(&conn, &low_code)?;

  let value_date = input
    .value_date
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty())
    .unwrap_or_else(now_sqlite);
  let now = now_sqlite();
  let rate_id = uuid::Uuid::new_v4().to_string();

  // Directions follow wallet kind (not only walk-in vs account), so mixed
  // settlements work: buy from customer account + sell cash, etc.
  // Shop receives `from`: cash DEBIT (asset↑) / customer CREDIT (liability↓).
  // Shop gives `to`: cash CREDIT (asset↓) / customer DEBIT (liability↑).
  let from_is_cash = from_type == "VAULT" || from_type == "TILL";
  let to_is_cash = to_type == "VAULT" || to_type == "TILL";
  let econ_from = if from_is_cash { "DEBIT" } else { "CREDIT" };
  let econ_to = if to_is_cash { "CREDIT" } else { "DEBIT" };
  let diff_from = if econ_from == "DEBIT" {
    "CREDIT"
  } else {
    "DEBIT"
  };
  let diff_to = if econ_to == "CREDIT" {
    "DEBIT"
  } else {
    "CREDIT"
  };

  let board_label = board_rate_f
    .map(|b| format!(" board {}", fmt_money(b)))
    .unwrap_or_default();
  let pnl_label = if board_rate_f.is_some() {
    if profit_f >= 0.0 {
      format!(" · profit {profit_s} {low_code_resolved}")
    } else {
      format!(" · loss {} {low_code_resolved}", fmt_money(profit_f.abs()))
    }
  } else {
    String::new()
  };
  let memo = format!("Currency exchange @ {deal_rate_s} (1 {high_code_resolved}){board_label}{pnl_label}");
  let walk_in_name = if is_walk_in {
    input
      .walk_in_name
      .map(|s| s.trim().to_string())
      .filter(|s| !s.is_empty())
  } else {
    None
  };
  let walk_in_phone = if is_walk_in {
    input
      .walk_in_phone
      .map(|s| s.trim().to_string())
      .filter(|s| !s.is_empty())
  } else {
    None
  };
  let rate_disp = crate::util::format_amount_commas(&deal_rate_s);
  let exchange_core = format!(
    "Exchange of {} {} to {} {} at {rate_disp} rate",
    crate::util::format_amount_commas(&from_amount),
    from_code,
    crate::util::format_amount_commas(&to_amount),
    to_code,
  );
  // Prefer localized UI description when provided; otherwise English fallback.
  let description = input
    .description
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(|s| s.to_string())
    .unwrap_or_else(|| match walk_in_name.as_deref() {
      Some(name) => format!("{name} — {exchange_core}"),
      None => exchange_core,
    });

  let customer_id_for_trade = customer_id.clone();
  let walk_in_for_trade = walk_in_name.clone();
  let reference_for_trade = reference.clone();
  let cash_wallet_for_trade = resolve_main_vault_id(&conn)?;

  conn.execute_batch("BEGIN IMMEDIATE;")?;
  let result = (|| -> Result<ExchangeFundsResult, AppError> {
    if let Some(ref rid) = replace_id {
      crate::commands::trading::util::soft_delete_desk_transaction(&conn, rid)?;
    }

    conn.execute(
      "INSERT INTO ExchangeRate (
         id, baseCurrencyId, quoteCurrencyId, rate, effectiveAt, source,
         deletedAt, createdAt, updatedAt
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7, ?7)",
      params![
        rate_id,
        from_currency_id,
        to_currency_id,
        derived_rate,
        value_date,
        SNAPSHOT_SOURCE,
        now
      ],
    )?;

    let transaction = post_transaction_in_tx(
      &conn,
      PostTransactionInput {
        reference,
        r#type: "EXCHANGE".into(),
        value_date: value_date.clone(),
        customer_id,
        walk_in_name,
        walk_in_phone,
        description: Some(description),
        created_by_id: Some(created_by_id.clone()),
        entries: vec![
          PostingLineDto {
            wallet_id: from_id,
            currency: from_code.clone(),
            direction: econ_from.into(),
            amount_minor: from_minor.to_string(),
            exchange_rate_id: Some(rate_id.clone()),
            memo: Some(memo.clone()),
          },
          PostingLineDto {
            wallet_id: to_id,
            currency: to_code.clone(),
            direction: econ_to.into(),
            amount_minor: to_minor.to_string(),
            exchange_rate_id: Some(rate_id.clone()),
            memo: Some(memo.clone()),
          },
          PostingLineDto {
            wallet_id: diff_id.clone(),
            currency: from_code.clone(),
            direction: diff_from.into(),
            amount_minor: from_minor.to_string(),
            exchange_rate_id: Some(rate_id.clone()),
            memo: Some(memo.clone()),
          },
          PostingLineDto {
            wallet_id: diff_id,
            currency: to_code.clone(),
            direction: diff_to.into(),
            amount_minor: to_minor.to_string(),
            exchange_rate_id: Some(rate_id.clone()),
            memo: Some(memo),
          },
        ],
      },
    )?;

    // Persist deal P/L when table exists.
    let has_deal: bool = conn.query_row(
      "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='ExchangeDeal')",
      [],
      |row| row.get(0),
    )?;
    if has_deal {
      conn.execute(
        r#"INSERT INTO ExchangeDeal (
             id, transactionId, fromCurrencyId, toCurrencyId, fromAmount, toAmount,
             highCurrencyId, lowCurrencyId, dealRate, boardRate, side,
             profitAmount, profitCurrencyId, valueDate, createdById, deletedAt, createdAt, updatedAt
           ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,NULL,?16,?16)"#,
        params![
          uuid::Uuid::new_v4().to_string(),
          transaction.id,
          from_currency_id,
          to_currency_id,
          from_amount,
          to_amount,
          high_currency_id,
          low_currency_id,
          deal_rate_s,
          board_rate_f.map(fmt_money),
          side,
          profit_s,
          low_currency_id,
          value_date,
          created_by_id,
          now,
        ],
      )?;
    }

    // Feed trading inventory + history (high-currency BUY/SELL).
    let (high_qty, low_qty) = if side == "BUY_HIGH" {
      (&from_amount, &to_amount)
    } else {
      (&to_amount, &from_amount)
    };
    crate::commands::trading::util::record_exchange_as_trade(
      &conn,
      &transaction.id,
      &reference_for_trade,
      &side,
      &high_currency_id,
      &low_currency_id,
      high_qty,
      low_qty,
      &deal_rate_s,
      customer_id_for_trade.as_deref(),
      walk_in_for_trade.as_deref(),
      &value_date,
      &created_by_id,
      &cash_wallet_for_trade,
    )?;

    Ok(ExchangeFundsResult {
      transaction,
      from_currency_code: from_code,
      to_currency_code: to_code,
      from_amount,
      to_amount,
      rate: derived_rate,
      exchange_rate_id: rate_id,
      high_currency_code: high_code_resolved,
      low_currency_code: low_code_resolved.clone(),
      deal_rate: deal_rate_s,
      board_rate: board_rate_f.map(fmt_money),
      side: side.clone(),
      profit_amount: profit_s,
      profit_currency_code: low_code_resolved,
      is_profit: profit_f >= 0.0,
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExchangePnLQuery {
  pub business_date: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExchangePnLRow {
  pub currency_code: String,
  pub profit_amount: String,
  pub deal_count: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExchangePnLSummary {
  pub business_date: String,
  pub total_deals: i64,
  pub by_currency: Vec<ExchangePnLRow>,
  pub recent: Vec<ExchangeDealRecent>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExchangeDealRecent {
  pub id: String,
  pub transaction_id: String,
  pub reference: String,
  pub display_ref: String,
  pub side: String,
  pub from_amount: String,
  pub from_currency: String,
  pub to_amount: String,
  pub to_currency: String,
  pub deal_rate: String,
  pub board_rate: Option<String>,
  pub profit_amount: String,
  pub profit_currency: String,
  pub value_date: String,
  pub customer_name: Option<String>,
  pub walk_in_name: Option<String>,
  pub status: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExchangeDealDetail {
  pub id: String,
  pub transaction_id: String,
  pub reference: String,
  pub display_ref: String,
  pub status: String,
  pub side: String,
  pub customer_id: Option<String>,
  pub customer_name: Option<String>,
  pub walk_in_name: Option<String>,
  pub from_amount: String,
  pub from_currency: String,
  pub to_amount: String,
  pub to_currency: String,
  pub deal_rate: String,
  pub board_rate: Option<String>,
  pub profit_amount: String,
  pub profit_currency: String,
  pub is_profit: bool,
  pub value_date: String,
  pub posted_at: Option<String>,
  pub created_at: String,
  pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetExchangeDealInput {
  /// ExchangeDeal.id (preferred) or Transaction.id.
  pub id: String,
}

#[tauri::command]
pub fn get_exchange_pnl_summary(
  state: State<'_, AppState>,
  input: ExchangePnLQuery,
) -> Result<ExchangePnLSummary, AppError> {
  let day = input
    .business_date
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .unwrap_or(&today_local())
    .to_string();
  let conn = state.db.lock();
  let _actor = require_any_screen(&state, &conn, &["cash", "customers"])?;
  let has_deal: bool = conn.query_row(
    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='ExchangeDeal')",
    [],
    |row| row.get(0),
  )?;
  if !has_deal {
    return Ok(ExchangePnLSummary {
      business_date: day,
      total_deals: 0,
      by_currency: vec![],
      recent: vec![],
    });
  }

  let total: i64 = conn.query_row(
    r#"SELECT COUNT(*) FROM ExchangeDeal
       WHERE deletedAt IS NULL AND valueDate >= ?1 AND valueDate < date(?1, '+1 day')"#,
    [&day],
    |row| row.get(0),
  )?;

  let mut stmt = conn.prepare(
    r#"SELECT c.code, COALESCE(SUM(CAST(d.profitAmount AS REAL)),0), COUNT(*)
       FROM ExchangeDeal d
       INNER JOIN Currency c ON c.id = d.profitCurrencyId
       WHERE d.deletedAt IS NULL AND date(d.valueDate)=date(?1)
       GROUP BY c.code
       ORDER BY c.code"#,
  )?;
  let by_currency = stmt
    .query_map([&day], |row| {
      Ok(ExchangePnLRow {
        currency_code: row.get(0)?,
        profit_amount: fmt_money(row.get::<_, f64>(1)?),
        deal_count: row.get(2)?,
      })
    })?
    .collect::<Result<Vec<_>, _>>()?;

  let mut recent_stmt = conn.prepare(
    r#"SELECT d.id, d.transactionId, t.reference, IFNULL(t.displayRef,''), d.side, CAST(d.fromAmount AS TEXT), cf.code,
              CAST(d.toAmount AS TEXT), ct.code, CAST(d.dealRate AS TEXT),
              CAST(d.boardRate AS TEXT), CAST(d.profitAmount AS TEXT), cp.code, d.valueDate,
              c.fullName, t.walkInName, t.status
       FROM ExchangeDeal d
       INNER JOIN "Transaction" t ON t.id = d.transactionId
       INNER JOIN Currency cf ON cf.id = d.fromCurrencyId
       INNER JOIN Currency ct ON ct.id = d.toCurrencyId
       INNER JOIN Currency cp ON cp.id = d.profitCurrencyId
       LEFT JOIN Customer c ON c.id = t.customerId
       WHERE d.deletedAt IS NULL AND date(d.valueDate)=date(?1)
       ORDER BY t.displaySeq IS NULL, t.displaySeq DESC, t.createdAt DESC, t.rowid DESC
       LIMIT 25"#,
  )?;
  let recent = recent_stmt
    .query_map([&day], |row| {
      Ok(ExchangeDealRecent {
        id: row.get(0)?,
        transaction_id: row.get(1)?,
        reference: row.get(2)?,
        display_ref: row.get(3)?,
        side: row.get(4)?,
        from_amount: row.get(5)?,
        from_currency: row.get(6)?,
        to_amount: row.get(7)?,
        to_currency: row.get(8)?,
        deal_rate: row.get(9)?,
        board_rate: row.get(10)?,
        profit_amount: row.get(11)?,
        profit_currency: row.get(12)?,
        value_date: row.get(13)?,
        customer_name: row.get(14)?,
        walk_in_name: row.get(15)?,
        status: row.get(16)?,
      })
    })?
    .collect::<Result<Vec<_>, _>>()?;

  Ok(ExchangePnLSummary {
    business_date: day,
    total_deals: total,
    by_currency,
    recent,
  })
}

fn load_exchange_deal_detail(conn: &Connection, id: &str) -> Result<ExchangeDealDetail, AppError> {
  let row = conn.query_row(
    r#"SELECT d.id, d.transactionId, t.reference, t.status, d.side,
              t.customerId, c.fullName, t.walkInName,
              CAST(d.fromAmount AS TEXT), cf.code,
              CAST(d.toAmount AS TEXT), ct.code,
              CAST(d.dealRate AS TEXT), CAST(d.boardRate AS TEXT),
              CAST(d.profitAmount AS TEXT), cp.code,
              d.valueDate, t.postedAt, d.createdAt, t.description, IFNULL(t.displayRef,'')
       FROM ExchangeDeal d
       INNER JOIN "Transaction" t ON t.id = d.transactionId
       INNER JOIN Currency cf ON cf.id = d.fromCurrencyId
       INNER JOIN Currency ct ON ct.id = d.toCurrencyId
       INNER JOIN Currency cp ON cp.id = d.profitCurrencyId
       LEFT JOIN Customer c ON c.id = t.customerId
       WHERE d.deletedAt IS NULL AND (d.id = ?1 OR d.transactionId = ?1)
       LIMIT 1"#,
    [id],
    |row| {
      let profit_amount: String = row.get(14)?;
      let profit_f: f64 = profit_amount.parse().unwrap_or(0.0);
      Ok(ExchangeDealDetail {
        id: row.get(0)?,
        transaction_id: row.get(1)?,
        reference: row.get(2)?,
        status: row.get(3)?,
        side: row.get(4)?,
        customer_id: row.get(5)?,
        customer_name: row.get(6)?,
        walk_in_name: row.get(7)?,
        from_amount: row.get(8)?,
        from_currency: row.get(9)?,
        to_amount: row.get(10)?,
        to_currency: row.get(11)?,
        deal_rate: row.get(12)?,
        board_rate: row.get(13)?,
        profit_amount,
        profit_currency: row.get(15)?,
        is_profit: profit_f >= 0.0,
        value_date: row.get(16)?,
        posted_at: row.get(17)?,
        created_at: row.get(18)?,
        description: row.get(19)?,
        display_ref: row.get(20)?,
      })
    },
  );

  match row {
    Ok(detail) => Ok(detail),
    Err(rusqlite::Error::QueryReturnedNoRows) => {
      Err(AppError::NotFound("Exchange deal not found.".into()))
    }
    Err(e) => Err(e.into()),
  }
}

#[tauri::command]
pub fn get_exchange_deal_detail(
  state: State<'_, AppState>,
  input: GetExchangeDealInput,
) -> Result<ExchangeDealDetail, AppError> {
  let id = input.id.trim();
  if id.is_empty() {
    return Err(AppError::Validation("id is required.".into()));
  }
  let conn = state.db.lock();
  let _actor = require_any_screen(&state, &conn, &["cash", "customers"])?;
  let has_deal: bool = conn.query_row(
    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='ExchangeDeal')",
    [],
    |row| row.get(0),
  )?;
  if !has_deal {
    return Err(AppError::NotFound("Exchange deal not found.".into()));
  }
  load_exchange_deal_detail(&conn, id)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetPreviousExchangeInput {
  /// ExchangeDeal.id or Transaction.id — return the next older deal.
  pub before_id: Option<String>,
}

#[tauri::command]
pub fn get_previous_exchange_deal(
  state: State<'_, AppState>,
  input: GetPreviousExchangeInput,
) -> Result<Option<ExchangeDealDetail>, AppError> {
  let before_id = input
    .before_id
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(|s| s.to_string());

  let conn = state.db.lock();
  let _actor = require_any_screen_write(&state, &conn, &["cash", "customers"])?;
  let has_deal: bool = conn.query_row(
    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='ExchangeDeal')",
    [],
    |row| row.get(0),
  )?;
  if !has_deal {
    return Ok(None);
  }

  let previous_deal_id: Option<String> = if let Some(ref before) = before_id {
    let anchor: Option<(String, String)> = conn
      .query_row(
        r#"SELECT d.createdAt, d.id FROM ExchangeDeal d
           WHERE d.deletedAt IS NULL AND (d.id = ?1 OR d.transactionId = ?1)
           LIMIT 1"#,
        [before],
        |row| Ok((row.get(0)?, row.get(1)?)),
      )
      .optional()?;
    let Some((before_created, before_deal_id)) = anchor else {
      return Err(AppError::NotFound(
        "beforeId exchange deal was not found.".into(),
      ));
    };
    conn
      .query_row(
        r#"SELECT d.id FROM ExchangeDeal d
           WHERE d.deletedAt IS NULL
             AND (d.createdAt < ?1 OR (d.createdAt = ?1 AND d.id < ?2))
           ORDER BY d.createdAt DESC, d.id DESC
           LIMIT 1"#,
        params![before_created, before_deal_id],
        |row| row.get(0),
      )
      .optional()?
  } else {
    conn
      .query_row(
        r#"SELECT d.id FROM ExchangeDeal d
           WHERE d.deletedAt IS NULL
           ORDER BY d.createdAt DESC, d.id DESC
           LIMIT 1"#,
        [],
        |row| row.get(0),
      )
      .optional()?
  };

  match previous_deal_id {
    Some(id) => Ok(Some(load_exchange_deal_detail(&conn, &id)?)),
    None => Ok(None),
  }
}
