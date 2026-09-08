//! Vault Management — physical cash locations (VAULT/TILL wallets) + ledger truth.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::AppError;
use crate::ledger::{
  find_currency_by_code, money_from_major_units, money_to_major_unit_string,
  post_transaction_in_tx, resolve_shop_cash_wallet_id, wallet_currency_balance_minor,
  PostTransactionInput, PostedTransaction, PostingLineDto,
};
use crate::state::AppState;
use crate::util::{now_sqlite, today_local, format_f64};
use crate::commands::authorize::{require_any_screen, require_auth, require_screen};
use crate::commands::trading::util::soft_delete_transaction;

fn trim_opt(v: Option<String>) -> Option<String> {
  v.map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

fn write_audit(
  conn: &Connection,
  user_id: Option<&str>,
  action: &str,
  entity_id: &str,
  before: Option<&str>,
  after: Option<&str>,
) -> Result<(), AppError> {
  let exists: bool = conn.query_row(
    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='AuditLog')",
    [],
    |row| row.get(0),
  )?;
  if !exists {
    return Ok(());
  }
  conn.execute(
    r#"INSERT INTO AuditLog (id, userId, action, module, entityType, entityId, beforeValues, afterValues, createdAt)
       VALUES (?1,?2,?3,'VAULT','Wallet',?4,?5,?6,?7)"#,
    params![
      uuid::Uuid::new_v4().to_string(),
      user_id,
      action,
      entity_id,
      before,
      after,
      now_sqlite(),
    ],
  )?;
  Ok(())
}

fn wallet_balance(
  conn: &Connection,
  wallet_id: &str,
  currency_id: Option<&str>,
) -> Result<f64, AppError> {
  if let Some(cid) = currency_id {
    Ok(conn.query_row(
      r#"SELECT COALESCE(SUM(CASE WHEN le.direction='DEBIT' THEN CAST(le.amount AS REAL)
                                  ELSE -CAST(le.amount AS REAL) END), 0)
         FROM LedgerEntry le
         INNER JOIN "Transaction" t ON t.id = le.transactionId AND t.deletedAt IS NULL
         WHERE le.walletId = ?1 AND le.currencyId = ?2"#,
      params![wallet_id, cid],
      |row| row.get(0),
    )?)
  } else {
    Ok(conn.query_row(
      r#"SELECT COALESCE(SUM(CASE WHEN le.direction='DEBIT' THEN CAST(le.amount AS REAL)
                                  ELSE -CAST(le.amount AS REAL) END), 0)
         FROM LedgerEntry le
         INNER JOIN "Transaction" t ON t.id = le.transactionId AND t.deletedAt IS NULL
         WHERE le.walletId = ?1"#,
      [wallet_id],
      |row| row.get(0),
    )?)
  }
}

fn assert_vault_wallet(conn: &Connection, id: &str) -> Result<(String, String, i64), AppError> {
  let row: Option<(String, String, i64)> = conn
    .query_row(
      "SELECT id, type, isActive FROM Wallet WHERE id=?1 AND deletedAt IS NULL",
      [id],
      |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )
    .optional()?;
  let (wid, wtype, active) =
    row.ok_or_else(|| AppError::NotFound("Vault not found.".into()))?;
  if wtype != "VAULT" && wtype != "TILL" {
    return Err(AppError::Validation(
      "Only vault or cashier (till) wallets can be used here.".into(),
    ));
  }
  Ok((wid, wtype, active))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultListItem {
  pub id: String,
  pub name: String,
  pub code: Option<String>,
  pub location: Option<String>,
  pub description: Option<String>,
  pub notes: Option<String>,
  pub vault_type: String,
  pub is_active: bool,
  pub responsible_user_id: Option<String>,
  pub responsible_user_name: Option<String>,
  pub currency_count: i64,
  pub total_balance_display: String,
  pub last_activity_at: Option<String>,
  pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultDashboard {
  pub total_vaults: i64,
  pub active_vaults: i64,
  pub total_cash_held: String,
  pub total_currencies: i64,
  pub transfers_today: i64,
  pub pending_reconciliations: i64,
  pub vault_differences: i64,
  pub vaults: Vec<VaultListItem>,
}

fn load_vault_row(conn: &Connection, id: &str) -> Result<VaultListItem, AppError> {
  let (
    name,
    code,
    location,
    description,
    notes,
    vault_type,
    is_active,
    user_id,
    user_name,
    created_at,
  ): (
    String,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    String,
    i64,
    Option<String>,
    Option<String>,
    String,
  ) = conn.query_row(
    r#"SELECT w.name, w.code, w.location, w.description, w.notes, w.type, w.isActive,
              w.userId, u.fullName, w.createdAt
       FROM Wallet w
       LEFT JOIN User u ON u.id = w.userId
       WHERE w.id = ?1 AND w.deletedAt IS NULL"#,
    [id],
    |row| {
      Ok((
        row.get(0)?,
        row.get(1)?,
        row.get(2)?,
        row.get(3)?,
        row.get(4)?,
        row.get(5)?,
        row.get(6)?,
        row.get(7)?,
        row.get(8)?,
        row.get(9)?,
      ))
    },
  )?;

  // One pass over this wallet's cached balances (not a full ledger scan).
  let (currency_count, total, last_activity) = crate::ledger::cached_wallet_totals(conn, id)?;

  Ok(VaultListItem {
    id: id.to_string(),
    name,
    code,
    location,
    description,
    notes,
    vault_type,
    is_active: is_active != 0,
    responsible_user_id: user_id,
    responsible_user_name: user_name,
    currency_count,
    total_balance_display: format_f64(total),
    last_activity_at: last_activity,
    created_at,
  })
}

#[tauri::command]
pub fn get_vault_dashboard(state: State<'_, AppState>) -> Result<VaultDashboard, AppError> {
  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "vaults")?;
  // consolidate_shop_cash runs at migrate/startup — do not re-scan on every dashboard read.
  let today = today_local();

  let mut stmt = conn.prepare(
    r#"SELECT w.id, w.name, w.code, w.location, w.description, w.notes, w.type, w.isActive,
              w.userId, u.fullName, w.createdAt,
              COALESCE(agg.currency_count, 0),
              COALESCE(agg.total_bal, 0),
              agg.last_activity
       FROM Wallet w
       LEFT JOIN User u ON u.id = w.userId
       LEFT JOIN (
         SELECT walletId,
                COUNT(*) AS currency_count,
                SUM(balance) AS total_bal,
                MAX(lastValueDate) AS last_activity
         FROM WalletCurrencyBalance
         WHERE ABS(balance) > 1e-12
         GROUP BY walletId
       ) agg ON agg.walletId = w.id
       WHERE w.deletedAt IS NULL
         AND w.type = 'VAULT'
         AND w.name = 'Main Vault'
       ORDER BY w.name
       LIMIT 1"#,
  )?;

  let mut vaults = Vec::new();
  let mut active = 0i64;
  let mut total_cash = 0.0;
  for row in stmt.query_map([], |row| {
    Ok((
      row.get::<_, String>(0)?,
      row.get::<_, String>(1)?,
      row.get::<_, Option<String>>(2)?,
      row.get::<_, Option<String>>(3)?,
      row.get::<_, Option<String>>(4)?,
      row.get::<_, Option<String>>(5)?,
      row.get::<_, String>(6)?,
      row.get::<_, i64>(7)?,
      row.get::<_, Option<String>>(8)?,
      row.get::<_, Option<String>>(9)?,
      row.get::<_, String>(10)?,
      row.get::<_, i64>(11)?,
      row.get::<_, f64>(12)?,
      row.get::<_, Option<String>>(13)?,
    ))
  })? {
    let (
      id,
      name,
      code,
      location,
      description,
      notes,
      vault_type,
      is_active,
      user_id,
      user_name,
      created_at,
      currency_count,
      total_bal,
      last_activity,
    ) = row?;
    if is_active != 0 {
      active += 1;
    }
    total_cash += total_bal;
    vaults.push(VaultListItem {
      id,
      name,
      code,
      location,
      description,
      notes,
      vault_type,
      is_active: is_active != 0,
      responsible_user_id: user_id,
      responsible_user_name: user_name,
      currency_count,
      total_balance_display: format_f64(total_bal),
      last_activity_at: last_activity,
      created_at,
    });
  }

  let total_currencies = vaults.first().map(|v| v.currency_count).unwrap_or(0);

  let transfers_today: i64 = if let Some(main) = vaults.first() {
    conn.query_row(
      r#"SELECT COUNT(DISTINCT t.id) FROM "Transaction" t
         INNER JOIN LedgerEntry le ON le.transactionId = t.id AND le.walletId = ?2
         WHERE t.deletedAt IS NULL AND t.type='TRANSFER'
           AND t.valueDate >= ?1 AND t.valueDate < date(?1, '+1 day')"#,
      params![&today, &main.id],
      |row| row.get(0),
    )?
  } else {
    0
  };

  let pending_reconciliations: i64 = {
    let exists: bool = conn.query_row(
      "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='VaultReconciliation')",
      [],
      |row| row.get(0),
    )?;
    if exists {
      conn.query_row(
        "SELECT COUNT(*) FROM VaultReconciliation WHERE status='DRAFT'",
        [],
        |row| row.get(0),
      )?
    } else {
      0
    }
  };

  let vault_differences: i64 = {
    let exists: bool = conn.query_row(
      "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='VaultReconciliationLine')",
      [],
      |row| row.get(0),
    )?;
    if exists {
      conn.query_row(
        r#"SELECT COUNT(*) FROM VaultReconciliationLine l
           INNER JOIN VaultReconciliation r ON r.id = l.reconciliationId
           WHERE r.status='CONFIRMED'
             AND r.businessDate >= ?1 AND r.businessDate < date(?1, '+1 day')
             AND ABS(CAST(l.difference AS REAL)) > 0.0001"#,
        [&today],
        |row| row.get(0),
      )?
    } else {
      0
    }
  };

  Ok(VaultDashboard {
    total_vaults: vaults.len() as i64,
    active_vaults: active,
    total_cash_held: format_f64(total_cash),
    total_currencies,
    transfers_today,
    pending_reconciliations,
    vault_differences,
    vaults,
  })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertVaultInput {
  pub id: Option<String>,
  pub name: String,
  pub code: Option<String>,
  pub location: Option<String>,
  pub description: Option<String>,
  pub notes: Option<String>,
  pub vault_type: Option<String>, // VAULT | TILL
  pub responsible_user_id: Option<String>,
  pub is_active: Option<bool>,
  pub created_by_id: Option<String>,
}

#[tauri::command]
pub fn upsert_vault(
  state: State<'_, AppState>,
  input: UpsertVaultInput,
) -> Result<VaultListItem, AppError> {
  let name = input.name.trim().to_string();
  if name.is_empty() {
    return Err(AppError::Validation("Vault name is required.".into()));
  }
  let vault_type = input
    .vault_type
    .as_deref()
    .unwrap_or("VAULT")
    .trim()
    .to_ascii_uppercase();
  if vault_type != "VAULT" && vault_type != "TILL" {
    return Err(AppError::Validation(
      "vaultType must be VAULT or TILL (cashier vault).".into(),
    ));
  }
  let code = trim_opt(input.code);
  let location = trim_opt(input.location);
  let description = trim_opt(input.description);
  let notes = trim_opt(input.notes);
  let user_id = trim_opt(input.responsible_user_id);
  let is_active = input.is_active.unwrap_or(true);
  let _ = trim_opt(input.created_by_id);
  let now = now_sqlite();
  let conn = state.db.lock();
  let actor = require_screen(&state, &conn, "vaults")?;
  let actor_id = actor.id.clone();

  let id = if let Some(existing) = input.id.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
    assert_vault_wallet(&conn, existing)?;
    let existing_name: String = conn.query_row(
      "SELECT name FROM Wallet WHERE id = ?1 LIMIT 1",
      [existing],
      |row| row.get(0),
    )?;
    let is_main = existing_name == crate::ledger::MAIN_VAULT_WALLET_NAME
      || name == crate::ledger::MAIN_VAULT_WALLET_NAME;
    // Main Vault account number is always #1 and not editable (ADR-045).
    let code = if is_main {
      Some("1".to_string())
    } else {
      code.clone()
    };
    if is_main && name != crate::ledger::MAIN_VAULT_WALLET_NAME {
      return Err(AppError::Validation(
        "Main Vault name cannot be changed.".into(),
      ));
    }
    let before = serde_json::json!({ "name": existing }).to_string();
    conn.execute(
      r#"UPDATE Wallet SET
           name=?1, code=?2, location=?3, description=?4, notes=?5,
           userId=?6, isActive=?7, type=?8, updatedAt=?9
         WHERE id=?10"#,
      params![
        name,
        code,
        location,
        description,
        notes,
        user_id,
        if is_active { 1 } else { 0 },
        vault_type,
        now,
        existing,
      ],
    )?;
    write_audit(
      &conn,
      Some(actor_id.as_str()),
      "UPDATE_VAULT",
      existing,
      Some(&before),
      Some(&serde_json::json!({ "name": name, "isActive": is_active }).to_string()),
    )?;
    existing.to_string()
  } else {
    return Err(AppError::Validation(
      "This shop uses only Main Vault. Extra vaults or tills cannot be created.".into(),
    ));
  };

  load_vault_row(&conn, &id)
}

#[tauri::command]
pub fn archive_vault(
  state: State<'_, AppState>,
  id: String,
  created_by_id: Option<String>,
) -> Result<VaultListItem, AppError> {
  let id = id.trim().to_string();
  let conn = state.db.lock();
  let actor = require_screen(&state, &conn, "vaults")?;
  let _ = created_by_id;
  assert_vault_wallet(&conn, &id)?;
  let name: String = conn.query_row(
    "SELECT name FROM Wallet WHERE id = ?1 LIMIT 1",
    [&id],
    |row| row.get(0),
  )?;
  if name == crate::ledger::MAIN_VAULT_WALLET_NAME {
    return Err(AppError::Validation(
      "Main Vault cannot be deactivated.".into(),
    ));
  }
  let bal = wallet_balance(&conn, &id, None)?;
  if bal.abs() > 0.0001 {
    return Err(AppError::Validation(
      "Move or clear all cash before deactivating this vault.".into(),
    ));
  }
  let now = now_sqlite();
  conn.execute(
    "UPDATE Wallet SET isActive=0, updatedAt=?1 WHERE id=?2",
    params![now, id],
  )?;
  write_audit(
    &conn,
    Some(actor.id.as_str()),
    "DEACTIVATE_VAULT",
    &id,
    None,
    Some(r#"{"isActive":false}"#),
  )?;
  load_vault_row(&conn, &id)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultCurrencyBalance {
  pub currency_id: String,
  pub currency_code: String,
  pub currency_symbol: Option<String>,
  pub current_balance: String,
  pub opening_balance: String,
  pub cash_in_today: String,
  pub cash_out_today: String,
  pub expected_closing: String,
  pub last_movement_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultDetail {
  pub vault: VaultListItem,
  pub balances: Vec<VaultCurrencyBalance>,
}

#[tauri::command]
pub fn get_vault_detail(
  state: State<'_, AppState>,
  id: String,
  business_date: Option<String>,
) -> Result<VaultDetail, AppError> {
  let id = id.trim().to_string();
  let day = business_date
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .unwrap_or(&today_local())
    .to_string();
  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "vaults")?;
  assert_vault_wallet(&conn, &id)?;
  let vault = load_vault_row(&conn, &id)?;

  // Current balances from cache; today in/out from day-scoped ledger only.
  let mut current_stmt = conn.prepare(
    r#"SELECT c.id, c.code, c.symbol, b.balance, b.lastValueDate
       FROM WalletCurrencyBalance b
       INNER JOIN Currency c ON c.id = b.currencyId
         AND c.deletedAt IS NULL AND c.isActive = 1
       WHERE b.walletId = ?1 AND ABS(b.balance) > 1e-12
       ORDER BY c.code"#,
  )?;
  let currents: Vec<(String, String, Option<String>, f64, Option<String>)> = current_stmt
    .query_map([&id], |row| {
      Ok((
        row.get(0)?,
        row.get(1)?,
        row.get(2)?,
        row.get(3)?,
        row.get(4)?,
      ))
    })?
    .collect::<Result<Vec<_>, _>>()?;

  let mut flow_stmt = conn.prepare(
    r#"SELECT le.currencyId,
              COALESCE(SUM(CASE WHEN le.direction='DEBIT' THEN CAST(le.amount AS REAL) ELSE 0 END), 0),
              COALESCE(SUM(CASE WHEN le.direction='CREDIT' THEN CAST(le.amount AS REAL) ELSE 0 END), 0)
       FROM LedgerEntry le
       INNER JOIN "Transaction" t ON t.id = le.transactionId AND t.deletedAt IS NULL
       WHERE le.walletId = ?1
         AND t.valueDate >= ?2 AND t.valueDate < date(?2, '+1 day')
       GROUP BY le.currencyId"#,
  )?;
  let mut flows: std::collections::HashMap<String, (f64, f64)> = std::collections::HashMap::new();
  for row in flow_stmt.query_map(params![&id, &day], |row| {
    Ok((
      row.get::<_, String>(0)?,
      row.get::<_, f64>(1)?,
      row.get::<_, f64>(2)?,
    ))
  })? {
    let (cid, inn, out) = row?;
    flows.insert(cid, (inn, out));
  }

  let balances = currents
    .into_iter()
    .map(|(currency_id, currency_code, currency_symbol, current, last_mov)| {
      let (cash_in, cash_out) = flows.get(&currency_id).copied().unwrap_or((0.0, 0.0));
      let opening = current - cash_in + cash_out;
      VaultCurrencyBalance {
        currency_id,
        currency_code,
        currency_symbol,
        current_balance: format_f64(current),
        opening_balance: format_f64(opening),
        cash_in_today: format_f64(cash_in),
        cash_out_today: format_f64(cash_out),
        expected_closing: format_f64(opening + cash_in - cash_out),
        last_movement_at: last_mov,
      }
    })
    .collect();

  Ok(VaultDetail { vault, balances })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultTransferInput {
  pub from_vault_id: String,
  pub to_vault_id: String,
  pub currency_code: String,
  pub amount: String,
  pub reason: Option<String>,
  pub notes: Option<String>,
  pub value_date: Option<String>,
  pub created_by_id: String,
}

#[tauri::command]
pub fn transfer_between_vaults(
  state: State<'_, AppState>,
  _input: VaultTransferInput,
) -> Result<PostedTransaction, AppError> {
  {
    let conn = state.db.lock();
    let _actor = require_screen(&state, &conn, "vaults")?;
  }
  Err(AppError::Validation(
    "This shop uses only Main Vault. Cash cannot be moved between vaults.".into(),
  ))
}

const OPENING_EQUITY: &str = "Opening Equity";

/// True when this posted transaction is Main Vault Cash In / Cash Out
/// (current types or legacy ADJUSTMENT rows with CASH-IN / CASH-OUT references).
pub fn is_main_vault_cash_transaction(tx_type: &str, reference: &str) -> bool {
  let t = tx_type.trim().to_ascii_uppercase();
  if t == "VAULT_CASH_IN" || t == "VAULT_CASH_OUT" {
    return true;
  }
  if t != "ADJUSTMENT" {
    return false;
  }
  let r = reference.trim().to_ascii_uppercase();
  r.starts_with("CASH-IN") || r.starts_with("CASH-OUT")
}

fn assert_replaceable_vault_cash(
  conn: &Connection,
  replace_id: &str,
) -> Result<(), AppError> {
  let (tx_type, reference, status): (String, String, String) = conn
    .query_row(
      r#"SELECT type, reference, status FROM "Transaction"
         WHERE id = ?1 AND deletedAt IS NULL
         LIMIT 1"#,
      [replace_id],
      |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )
    .map_err(|e| match e {
      rusqlite::Error::QueryReturnedNoRows => {
        AppError::NotFound("Cash movement to replace was not found.".into())
      }
      other => other.into(),
    })?;
  if !status.eq_ignore_ascii_case("POSTED") {
    return Err(AppError::Validation(
      "Only posted Cash In / Cash Out can be replaced.".into(),
    ));
  }
  if !is_main_vault_cash_transaction(&tx_type, &reference) {
    return Err(AppError::Validation(
      "Replacement target must be a Main Vault Cash In or Cash Out.".into(),
    ));
  }
  Ok(())
}

fn ensure_opening_equity_wallet(conn: &Connection) -> Result<String, AppError> {
  let existing: Option<String> = conn
    .query_row(
      "SELECT id FROM Wallet
       WHERE name = ?1 AND type = 'SYSTEM' AND deletedAt IS NULL AND isActive = 1
       LIMIT 1",
      [OPENING_EQUITY],
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
    params![id, OPENING_EQUITY, now],
  )?;
  Ok(id)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MainVaultCashMoveInput {
  /// CASH_IN | CASH_OUT
  pub direction: String,
  pub currency_code: String,
  pub amount: String,
  /// Optional: AFN (or cost currency) per 1 unit of cash currency.
  /// When set on foreign Cash In, also seeds TradingInventory.
  /// Not required for ordinary Cash In — physical vault cash only.
  pub cost_rate: Option<String>,
  /// Cost currency for `cost_rate` (default AFN).
  pub cost_currency_code: Option<String>,
  /// When true with CASH_IN: do not move cash — only register trading stock
  /// for money already in Main Vault (qty + cost rate). Requires `cost_rate`.
  pub inventory_only: Option<bool>,
  pub reference: Option<String>,
  pub notes: Option<String>,
  pub value_date: Option<String>,
  pub created_by_id: String,
  /// System Administrator authorization PIN (required before Cash In / Cash Out).
  pub authorization_pin: Option<String>,
  /// Soft-delete this prior Cash In / Cash Out only after PIN succeeds, inside the same DB tx as the replacement post.
  pub replace_transaction_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MainVaultCashMoveResult {
  pub transaction_id: String,
  pub reference: String,
  pub display_ref: String,
  pub direction: String,
  pub amount: String,
  pub currency_code: String,
}

/// Add or remove physical cash in Main Vault (contra: Opening Equity). Not a customer tx.
#[tauri::command]
pub fn post_main_vault_cash_move(
  state: State<'_, AppState>,
  input: MainVaultCashMoveInput,
) -> Result<MainVaultCashMoveResult, AppError> {
  let direction = input.direction.trim().to_ascii_uppercase();
  let cash_in = direction == "CASH_IN" || direction == "IN";
  let cash_out = direction == "CASH_OUT" || direction == "OUT";
  if !cash_in && !cash_out {
    return Err(AppError::Validation(
      "direction must be CASH_IN or CASH_OUT.".into(),
    ));
  }
  let inventory_only = input.inventory_only.unwrap_or(false);
  if inventory_only && !cash_in {
    return Err(AppError::Validation(
      "inventoryOnly is only valid with CASH_IN.".into(),
    ));
  }
  let _ = input.created_by_id.trim();

  let conn = state.db.lock();
  let actor = require_any_screen(&state, &conn, &["vaults", "daybook"])?;
  let created_by = actor.id.clone();
  let cash_id = resolve_shop_cash_wallet_id(&conn, None)?;
  let equity_id = ensure_opening_equity_wallet(&conn)?;
  let (currency_id, code, places) = find_currency_by_code(&conn, &input.currency_code)?;
  let minor = money_from_major_units(input.amount.trim(), places)?;
  if minor <= 0 {
    return Err(AppError::Validation("Amount must be positive.".into()));
  }
  let amount_major = money_to_major_unit_string(minor, places)?;

  let replace_id = input
    .replace_transaction_id
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(|s| s.to_string());
  if let Some(ref rid) = replace_id {
    assert_replaceable_vault_cash(&conn, rid)?;
  }

  let auth_action = if inventory_only {
    "INVENTORY_SEED"
  } else if cash_in {
    "CASH_IN"
  } else {
    "CASH_OUT"
  };
  let auth_detail = format!("{amount_major} {code}");
  // PIN before any soft-delete or financial write.
  crate::commands::auth_pin::require_authorization_pin(
    &conn,
    input.authorization_pin.as_deref(),
    Some(created_by.as_str()),
    auth_action,
    &auth_detail,
  )?;

  let value_date = input
    .value_date
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(|s| s.to_string())
    .unwrap_or_else(now_sqlite);
  let notes = trim_opt(input.notes);
  let reference = trim_opt(input.reference).unwrap_or_else(|| {
    format!(
      "{}-{}",
      if inventory_only {
        "FX-STOCK"
      } else if cash_in {
        "CASH-IN"
      } else {
        "CASH-OUT"
      },
      chrono::Utc::now().timestamp_millis()
    )
  });

  let cost_rate = trim_opt(input.cost_rate);
  let cost_currency = trim_opt(input.cost_currency_code)
    .unwrap_or_else(|| "AFN".into())
    .to_ascii_uppercase();
  // Cost rate is optional for normal Cash In (physical currency only).
  // It remains required for inventory-only FX stock seeding.
  if inventory_only {
    if code.eq_ignore_ascii_case("AFN") {
      return Err(AppError::Validation(
        "Inventory-only stock seeding is for foreign currencies.".into(),
      ));
    }
    let Some(ref rate) = cost_rate else {
      return Err(AppError::Validation(
        "Cost rate is required to register trading stock.".into(),
      ));
    };
    if rate.parse::<f64>().ok().filter(|n| *n > 0.0).is_none() {
      return Err(AppError::Validation(
        "Cost rate must be a positive number.".into(),
      ));
    }
    if cost_currency.eq_ignore_ascii_case(&code) {
      return Err(AppError::Validation(
        "Cost currency must differ from the cash currency.".into(),
      ));
    }
  } else if cash_in {
    // Optional legacy/API cost rate: validate only when provided.
    if let Some(ref rate) = cost_rate {
      if rate.parse::<f64>().ok().filter(|n| *n > 0.0).is_none() {
        return Err(AppError::Validation(
          "Cost rate must be a positive number.".into(),
        ));
      }
      if cost_currency.eq_ignore_ascii_case(&code) {
        return Err(AppError::Validation(
          "Cost currency must differ from the cash currency.".into(),
        ));
      }
    }
  }

  if inventory_only {
    let rate = cost_rate.as_deref().ok_or_else(|| {
      AppError::Validation("Cost rate is required to register trading stock.".into())
    })?;
    conn.execute_batch("BEGIN IMMEDIATE;")?;
    let result = (|| -> Result<MainVaultCashMoveResult, AppError> {
      if let Some(ref rid) = replace_id {
        crate::commands::trading::util::soft_delete_desk_transaction(&conn, rid)?;
      }
      let cash_bal = wallet_currency_balance_minor(&conn, &cash_id, &currency_id, places)?;
      if cash_bal < minor {
        return Err(AppError::Validation(format!(
          "Insufficient {code} cash available in Main Vault."
        )));
      }
      crate::commands::trading::util::apply_cash_in_to_trading_inventory(
        &conn,
        &code,
        &amount_major,
        rate,
        &cost_currency,
        None,
        &reference,
        &value_date,
        &created_by,
        &cash_id,
        notes.as_deref().or(Some("Existing vault stock")),
      )?;
      write_audit(
        &conn,
        Some(&created_by),
        "VAULT_FX_STOCK_SEED",
        &cash_id,
        None,
        Some(
          &serde_json::json!({
            "reference": reference,
            "amount": amount_major,
            "currency": code,
            "costRate": rate,
            "costCurrency": cost_currency,
            "inventoryOnly": true,
            "notes": notes,
          })
          .to_string(),
        ),
      )?;
      Ok(MainVaultCashMoveResult {
        transaction_id: String::new(),
        reference: reference.clone(),
        display_ref: String::new(),
        direction: "INVENTORY_SEED".into(),
        amount: amount_major.clone(),
        currency_code: code.clone(),
      })
    })();
    return match result {
      Ok(out) => {
        conn.execute_batch("COMMIT;")?;
        Ok(out)
      }
      Err(e) => {
        let _ = conn.execute_batch("ROLLBACK;");
        Err(e)
      }
    };
  }

  // Non-replace cash-out: balances still include prior state — check before write.
  if cash_out && replace_id.is_none() {
    let cash_bal = wallet_currency_balance_minor(&conn, &cash_id, &currency_id, places)?;
    if cash_bal < minor {
      return Err(AppError::Validation(format!(
        "Insufficient {code} cash available in Main Vault."
      )));
    }
  }

  let (cash_dir, equity_dir, memo) = if cash_in {
    ("DEBIT", "CREDIT", "Cash in — Main Vault")
  } else {
    ("CREDIT", "DEBIT", "Cash out — Main Vault")
  };
  let amount_disp = crate::util::format_amount_commas(&amount_major);
  let description = match notes.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
    Some(n) if cash_in => {
      format!("Cash in {amount_disp} {code} to Main Vault — {n}")
    }
    Some(n) => {
      format!("Cash out {amount_disp} {code} from Main Vault — {n}")
    }
    None if cash_in => format!("Cash in {amount_disp} {code} to Main Vault"),
    None => format!("Cash out {amount_disp} {code} from Main Vault"),
  };

  let tx_type = if cash_in {
    "VAULT_CASH_IN"
  } else {
    "VAULT_CASH_OUT"
  };

  conn.execute_batch("BEGIN IMMEDIATE;")?;
  let result = (|| -> Result<MainVaultCashMoveResult, AppError> {
    if let Some(ref rid) = replace_id {
      crate::commands::trading::util::soft_delete_desk_transaction(&conn, rid)?;
      // After reverse, re-check cash-out against restored balances.
      if cash_out {
        let cash_bal = wallet_currency_balance_minor(&conn, &cash_id, &currency_id, places)?;
        if cash_bal < minor {
          return Err(AppError::Validation(format!(
            "Insufficient {code} cash available in Main Vault."
          )));
        }
      }
    }

    let posted = post_transaction_in_tx(
      &conn,
      PostTransactionInput {
        reference: reference.clone(),
        r#type: tx_type.into(),
        value_date: value_date.clone(),
        customer_id: None,
        walk_in_name: None,
        walk_in_phone: None,
        description: Some(description),
        created_by_id: Some(created_by.clone()),
        entries: vec![
          PostingLineDto {
            wallet_id: cash_id.clone(),
            currency: code.clone(),
            direction: cash_dir.into(),
            amount_minor: minor.to_string(),
            exchange_rate_id: None,
            memo: Some(memo.into()),
          },
          PostingLineDto {
            wallet_id: equity_id.clone(),
            currency: code.clone(),
            direction: equity_dir.into(),
            amount_minor: minor.to_string(),
            exchange_rate_id: None,
            memo: Some(memo.into()),
          },
        ],
      },
    )?;

    write_audit(
      &conn,
      Some(&created_by),
      if cash_in {
        "VAULT_CASH_IN"
      } else {
        "VAULT_CASH_OUT"
      },
      &posted.id,
      replace_id
        .as_ref()
        .map(|rid| serde_json::json!({ "replaced": rid }).to_string())
        .as_deref(),
      Some(
        &serde_json::json!({
          "reference": reference,
          "amount": amount_major,
          "currency": code,
          "costRate": cost_rate,
          "costCurrency": if cash_in && !code.eq_ignore_ascii_case("AFN") {
            Some(&cost_currency)
          } else {
            None
          },
          "notes": notes,
        })
        .to_string(),
      ),
    )?;

    if cash_in {
      if let Some(ref rate) = cost_rate {
        if !code.eq_ignore_ascii_case("AFN") {
          crate::commands::trading::util::apply_cash_in_to_trading_inventory(
            &conn,
            &code,
            &amount_major,
            rate,
            &cost_currency,
            Some(posted.id.as_str()),
            &reference,
            &value_date,
            &created_by,
            &cash_id,
            notes.as_deref(),
          )?;
        }
      }
    }

    Ok(MainVaultCashMoveResult {
      transaction_id: posted.id,
      reference: reference.clone(),
      display_ref: posted.display_ref,
      direction: if cash_in {
        "CASH_IN".into()
      } else {
        "CASH_OUT".into()
      },
      amount: amount_major.clone(),
      currency_code: code.clone(),
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
pub struct VaultMovementsInput {
  pub vault_id: Option<String>,
  pub date_from: Option<String>,
  pub date_to: Option<String>,
  pub currency_code: Option<String>,
  pub search: Option<String>,
  pub page: Option<i64>,
  pub page_size: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultMovementRow {
  pub transaction_id: String,
  pub reference: String,
  pub display_ref: String,
  pub transaction_type: String,
  pub value_date: String,
  pub currency_code: String,
  pub amount: String,
  pub direction: String,
  pub wallet_name: String,
  pub counterparty_wallet: Option<String>,
  pub user_name: Option<String>,
  pub description: Option<String>,
  pub status: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultMovementPage {
  pub items: Vec<VaultMovementRow>,
  pub total: i64,
  pub page: i64,
  pub page_size: i64,
}

#[tauri::command]
pub fn list_vault_movements(
  state: State<'_, AppState>,
  input: VaultMovementsInput,
) -> Result<VaultMovementPage, AppError> {
  let page_size = input.page_size.unwrap_or(50).clamp(1, 200);
  let mut page = input.page.unwrap_or(1).max(1);
  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "vaults")?;

  let mut where_sql = String::from(
    r#"WHERE t.deletedAt IS NULL AND w.type IN ('VAULT','TILL')"#,
  );
  let mut params_v: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

  if let Some(vid) = input.vault_id.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
    where_sql.push_str(" AND w.id = ?");
    params_v.push(Box::new(vid.to_string()));
  }
  if let Some(from) = input.date_from.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
    where_sql.push_str(" AND t.valueDate >= ?");
    params_v.push(Box::new(from.to_string()));
  }
  if let Some(to) = input.date_to.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
    where_sql.push_str(" AND t.valueDate < date(?, '+1 day')");
    params_v.push(Box::new(to.to_string()));
  }
  if let Some(ccy) = input
    .currency_code
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
  {
    where_sql.push_str(" AND c.code = ?");
    params_v.push(Box::new(ccy.to_ascii_uppercase()));
  }
  if let Some(q) = input.search.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
    let like = format!("%{q}%");
    where_sql.push_str(
      " AND (t.reference LIKE ? OR IFNULL(t.displayRef,'') LIKE ? OR IFNULL(t.description,'') LIKE ? OR w.name LIKE ?)",
    );
    params_v.push(Box::new(like.clone()));
    params_v.push(Box::new(like.clone()));
    params_v.push(Box::new(like.clone()));
    params_v.push(Box::new(like));
  }

  let needs_currency_join = input
    .currency_code
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .is_some();
  let needs_wallet_name = input
    .search
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .is_some();
  let vault_only = input
    .vault_id
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .is_some()
    && !needs_currency_join
    && !needs_wallet_name;

  let count_sql = if vault_only {
    // Same filters as where_sql but without Wallet/Currency joins.
    let mut sql = String::from(
      r#"SELECT COUNT(*) FROM LedgerEntry le
         INNER JOIN "Transaction" t ON t.id = le.transactionId
         WHERE t.deletedAt IS NULL AND le.walletId = ?"#,
    );
    // params_v already starts with vault id; append only date filters in same order.
    if input.date_from.as_deref().map(str::trim).filter(|s| !s.is_empty()).is_some() {
      sql.push_str(" AND t.valueDate >= ?");
    }
    if input.date_to.as_deref().map(str::trim).filter(|s| !s.is_empty()).is_some() {
      sql.push_str(" AND t.valueDate < date(?, '+1 day')");
    }
    sql
  } else {
    format!(
      r#"SELECT COUNT(*) FROM LedgerEntry le
         INNER JOIN "Transaction" t ON t.id = le.transactionId
         INNER JOIN Wallet w ON w.id = le.walletId
         INNER JOIN Currency c ON c.id = le.currencyId
         {where_sql}"#
    )
  };
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

  // Skip correlated counterparty subquery (O(page × ledger)); fill null — UI still works.
  let chrono = crate::ledger::TX_CHRONO_DESC;
  let list_sql = format!(
    r#"SELECT t.id, t.reference, IFNULL(t.displayRef,''), t.type, t.valueDate, c.code, CAST(le.amount AS TEXT),
              le.direction, w.name, u.fullName, t.description, t.status
       FROM LedgerEntry le
       INNER JOIN "Transaction" t ON t.id = le.transactionId
       INNER JOIN Wallet w ON w.id = le.walletId
       INNER JOIN Currency c ON c.id = le.currencyId
       LEFT JOIN User u ON u.id = t.createdById
       {where_sql}
       ORDER BY {chrono}
       LIMIT ? OFFSET ?"#,
  );
  let mut list_params = params_v;
  list_params.push(Box::new(page_size));
  list_params.push(Box::new(offset));
  let list_refs: Vec<&dyn rusqlite::types::ToSql> =
    list_params.iter().map(|p| p.as_ref()).collect();
  let mut stmt = conn.prepare(&list_sql)?;
  let items = stmt
    .query_map(list_refs.as_slice(), |row| {
      Ok(VaultMovementRow {
        transaction_id: row.get(0)?,
        reference: row.get(1)?,
        display_ref: row.get(2)?,
        transaction_type: row.get(3)?,
        value_date: row.get(4)?,
        currency_code: row.get(5)?,
        amount: row.get(6)?,
        direction: row.get(7)?,
        wallet_name: row.get(8)?,
        user_name: row.get(9)?,
        description: row.get(10)?,
        status: row.get(11)?,
        counterparty_wallet: None,
      })
    })?
    .collect::<Result<Vec<_>, _>>()?;

  Ok(VaultMovementPage {
    items,
    total,
    page,
    page_size,
  })
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DenomCountInput {
  pub denomination_id: Option<String>,
  pub label: String,
  pub value: String,
  pub quantity: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReconcileVaultLineInput {
  pub currency_code: String,
  pub physical_amount: String,
  pub reason: Option<String>,
  pub denominations: Option<Vec<DenomCountInput>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReconcileVaultInput {
  pub vault_id: String,
  pub business_date: Option<String>,
  pub difference_reason: Option<String>,
  pub notes: Option<String>,
  pub confirm: bool,
  pub created_by_id: String,
  pub lines: Vec<ReconcileVaultLineInput>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultReconciliationResult {
  pub id: String,
  pub status: String,
  pub has_difference: bool,
}

#[tauri::command]
pub fn reconcile_vault(
  state: State<'_, AppState>,
  input: ReconcileVaultInput,
) -> Result<VaultReconciliationResult, AppError> {
  let vault_id = input.vault_id.trim().to_string();
  let _ = input.created_by_id.trim();
  if input.lines.is_empty() {
    return Err(AppError::Validation(
      "Enter physical counts for at least one currency.".into(),
    ));
  }
  let day = input
    .business_date
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .unwrap_or(&today_local())
    .to_string();

  let conn = state.db.lock();
  let actor = require_screen(&state, &conn, "vaults")?;
  let created_by = actor.id.clone();
  assert_vault_wallet(&conn, &vault_id)?;

  let table_ok: bool = conn.query_row(
    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='VaultReconciliation')",
    [],
    |row| row.get(0),
  )?;
  if !table_ok {
    return Err(AppError::Internal(
      "Vault reconciliation tables missing — restart the app.".into(),
    ));
  }

  let mut has_diff = false;
  let mut line_rows = Vec::new();
  for line in &input.lines {
    let (cid, code, places) = find_currency_by_code(&conn, &line.currency_code)?;
    let expected = wallet_balance(&conn, &vault_id, Some(&cid))?;
    let physical = {
      if let Some(denoms) = &line.denominations {
        if !denoms.is_empty() {
          let mut sum = 0.0;
          for d in denoms {
            let v: f64 = d.value.replace(',', "").parse().unwrap_or(0.0);
            sum += v * (d.quantity.max(0) as f64);
          }
          sum
        } else {
          line.physical_amount.replace(',', "").parse().unwrap_or(0.0)
        }
      } else {
        line.physical_amount.replace(',', "").parse().unwrap_or(0.0)
      }
    };
    let _ = places;
    let difference = physical - expected;
    if difference.abs() > 0.0001 {
      has_diff = true;
      if trim_opt(line.reason.clone()).is_none() && input.confirm {
        // per-line reason optional if global reason provided
      }
    }
    let denom_json = line
      .denominations
      .as_ref()
      .map(|d| serde_json::to_string(d).unwrap_or_else(|_| "[]".into()));
    line_rows.push((
      cid,
      code,
      expected,
      physical,
      difference,
      trim_opt(line.reason.clone()),
      denom_json,
    ));
  }

  if has_diff && input.confirm {
    let global = trim_opt(input.difference_reason.clone());
    let any_line_reason = line_rows.iter().any(|r| r.5.is_some());
    if global.is_none() && !any_line_reason {
      return Err(AppError::Validation(
        "A reason is required when physical cash does not match expected.".into(),
      ));
    }
  }

  let recon_id = uuid::Uuid::new_v4().to_string();
  let now = now_sqlite();
  let status = if input.confirm { "CONFIRMED" } else { "DRAFT" };
  let business_day_id: Option<String> = conn
    .query_row(
      "SELECT id FROM BusinessDay WHERE businessDate=?1",
      [&day],
      |row| row.get(0),
    )
    .optional()?;

  conn.execute(
    r#"INSERT INTO VaultReconciliation (
         id, walletId, businessDayId, businessDate, status, differenceReason, notes,
         createdById, confirmedAt, createdAt, updatedAt
       ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?10)"#,
    params![
      recon_id,
      vault_id,
      business_day_id,
      day,
      status,
      trim_opt(input.difference_reason.clone()),
      trim_opt(input.notes.clone()),
      created_by,
      if input.confirm {
        Some(now.clone())
      } else {
        None
      },
      now,
    ],
  )?;

  for (cid, _code, expected, physical, difference, reason, denom_json) in &line_rows {
    conn.execute(
      r#"INSERT INTO VaultReconciliationLine (
           id, reconciliationId, currencyId, expectedAmount, physicalAmount, difference,
           denominationJson, reason, createdAt, updatedAt
         ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?9)"#,
      params![
        uuid::Uuid::new_v4().to_string(),
        recon_id,
        cid,
        format_f64(*expected),
        format_f64(*physical),
        format_f64(*difference),
        denom_json,
        reason,
        now,
      ],
    )?;
  }

  write_audit(
    &conn,
    Some(&created_by),
    if input.confirm {
      "CONFIRM_VAULT_RECONCILE"
    } else {
      "DRAFT_VAULT_RECONCILE"
    },
    &recon_id,
    None,
    Some(
      &serde_json::json!({
        "vaultId": vault_id,
        "hasDifference": has_diff,
        "status": status,
      })
      .to_string(),
    ),
  )?;

  Ok(VaultReconciliationResult {
    id: recon_id,
    status: status.into(),
    has_difference: has_diff,
  })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CurrencyDenominationRow {
  pub id: String,
  pub currency_code: String,
  pub label: String,
  pub value: String,
  pub sort_order: i64,
  pub is_active: bool,
}

#[tauri::command]
pub fn list_currency_denominations(
  state: State<'_, AppState>,
  currency_code: Option<String>,
) -> Result<Vec<CurrencyDenominationRow>, AppError> {
  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "vaults")?;
  let exists: bool = conn.query_row(
    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='CurrencyDenomination')",
    [],
    |row| row.get(0),
  )?;
  if !exists {
    return Ok(vec![]);
  }

  // Seed defaults if empty for USD/AFN
  let count: i64 = conn.query_row("SELECT COUNT(*) FROM CurrencyDenomination", [], |row| {
    row.get(0)
  })?;
  if count == 0 {
    seed_default_denominations(&conn)?;
  }

  let mut sql = String::from(
    r#"SELECT d.id, c.code, d.label, CAST(d.value AS TEXT), d.sortOrder, d.isActive
       FROM CurrencyDenomination d
       INNER JOIN Currency c ON c.id = d.currencyId
       WHERE d.isActive = 1"#,
  );
  let mut params_v: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
  if let Some(code) = currency_code
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
  {
    sql.push_str(" AND c.code = ?");
    params_v.push(Box::new(code.to_ascii_uppercase()));
  }
  sql.push_str(" ORDER BY c.code, d.sortOrder, CAST(d.value AS REAL) DESC");
  let refs: Vec<&dyn rusqlite::types::ToSql> = params_v.iter().map(|p| p.as_ref()).collect();
  let mut stmt = conn.prepare(&sql)?;
  let rows = stmt
    .query_map(refs.as_slice(), |row| {
      Ok(CurrencyDenominationRow {
        id: row.get(0)?,
        currency_code: row.get(1)?,
        label: row.get(2)?,
        value: row.get(3)?,
        sort_order: row.get(4)?,
        is_active: row.get::<_, i64>(5)? != 0,
      })
    })?
    .collect::<Result<Vec<_>, _>>()?;
  Ok(rows)
}

fn seed_default_denominations(conn: &Connection) -> Result<(), AppError> {
  let now = now_sqlite();
  let seeds: &[(&str, &[(&str, &str)])] = &[
    (
      "USD",
      &[
        ("$100", "100"),
        ("$50", "50"),
        ("$20", "20"),
        ("$10", "10"),
        ("$5", "5"),
        ("$1", "1"),
      ],
    ),
    (
      "AFN",
      &[
        ("؋1000", "1000"),
        ("؋500", "500"),
        ("؋100", "100"),
        ("؋50", "50"),
        ("؋20", "20"),
        ("؋10", "10"),
      ],
    ),
  ];
  for (code, denoms) in seeds {
    let cid: Option<String> = conn
      .query_row(
        "SELECT id FROM Currency WHERE code=?1 AND deletedAt IS NULL LIMIT 1",
        [code],
        |row| row.get(0),
      )
      .optional()?;
    let Some(cid) = cid else { continue };
    for (i, (label, value)) in denoms.iter().enumerate() {
      conn.execute(
        r#"INSERT INTO CurrencyDenomination (id, currencyId, label, value, sortOrder, isActive, createdAt, updatedAt)
           VALUES (?1,?2,?3,?4,?5,1,?6,?6)"#,
        params![
          uuid::Uuid::new_v4().to_string(),
          cid,
          label,
          value,
          i as i64,
          now
        ],
      )?;
    }
  }
  Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListUsersLiteInput {
  pub active_only: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserLite {
  pub id: String,
  pub full_name: String,
  pub username: String,
}

#[tauri::command]
pub fn list_users_lite(
  state: State<'_, AppState>,
  input: ListUsersLiteInput,
) -> Result<Vec<UserLite>, AppError> {
  let conn = state.db.lock();
  let _actor = require_auth(&state, &conn)?;
  let active_only = input.active_only.unwrap_or(true);
  // User has no deletedAt column — filter by isActive only.
  let sql = if active_only {
    r#"SELECT id, fullName, username FROM User
       WHERE isActive = 1
       ORDER BY fullName"#
  } else {
    r#"SELECT id, fullName, username FROM User
       ORDER BY fullName"#
  };
  let mut stmt = conn.prepare(sql)?;
  let rows = stmt
    .query_map([], |row| {
      Ok(UserLite {
        id: row.get(0)?,
        full_name: row.get(1)?,
        username: row.get(2)?,
      })
    })?
    .collect::<Result<Vec<_>, _>>()?;
  Ok(rows)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultAuditRow {
  pub id: String,
  pub action: String,
  pub entity_id: String,
  pub user_name: Option<String>,
  pub before_values: Option<String>,
  pub after_values: Option<String>,
  pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultAuditPage {
  pub items: Vec<VaultAuditRow>,
  pub total: i64,
  pub page: i64,
  pub page_size: i64,
}

#[tauri::command]
pub fn list_vault_audit(
  state: State<'_, AppState>,
  vault_id: Option<String>,
  page: Option<i64>,
  page_size: Option<i64>,
) -> Result<VaultAuditPage, AppError> {
  let conn = state.db.lock();
  let _actor = require_screen(&state, &conn, "vaults")?;
  let exists: bool = conn.query_row(
    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='AuditLog')",
    [],
    |row| row.get(0),
  )?;
  let page_size = page_size.unwrap_or(50).clamp(1, 200);
  let mut page = page.unwrap_or(1).max(1);
  if !exists {
    return Ok(VaultAuditPage {
      items: vec![],
      total: 0,
      page: 1,
      page_size,
    });
  }
  let vault = vault_id
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(|s| s.to_string());

  let mut where_sql = String::from("WHERE a.module = 'VAULT'");
  let mut params_v: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
  if let Some(vid) = &vault {
    where_sql.push_str(
      " AND (a.entityId = ? OR IFNULL(a.afterValues,'') LIKE ? OR IFNULL(a.beforeValues,'') LIKE ?)",
    );
    params_v.push(Box::new(vid.clone()));
    let like = format!("%{vid}%");
    params_v.push(Box::new(like.clone()));
    params_v.push(Box::new(like));
  }

  let count_sql = format!("SELECT COUNT(*) FROM AuditLog a {where_sql}");
  let count_refs: Vec<&dyn rusqlite::types::ToSql> =
    params_v.iter().map(|p| p.as_ref()).collect();
  let total: i64 = conn.query_row(&count_sql, count_refs.as_slice(), |row| row.get(0))?;
  let total_pages = if total == 0 {
    1
  } else {
    (total + page_size - 1) / page_size
  };
  if page > total_pages {
    page = total_pages;
  }
  let offset = (page - 1) * page_size;

  let sql = format!(
    r#"SELECT a.id, a.action, a.entityId, u.fullName, a.beforeValues, a.afterValues, a.createdAt
       FROM AuditLog a
       LEFT JOIN User u ON u.id = a.userId
       {where_sql}
       ORDER BY a.createdAt DESC LIMIT ? OFFSET ?"#
  );
  params_v.push(Box::new(page_size));
  params_v.push(Box::new(offset));
  let refs: Vec<&dyn rusqlite::types::ToSql> = params_v.iter().map(|p| p.as_ref()).collect();
  let mut stmt = conn.prepare(&sql)?;
  let items = stmt
    .query_map(refs.as_slice(), |row| {
      Ok(VaultAuditRow {
        id: row.get(0)?,
        action: row.get(1)?,
        entity_id: row.get(2)?,
        user_name: row.get(3)?,
        before_values: row.get(4)?,
        after_values: row.get(5)?,
        created_at: row.get(6)?,
      })
    })?
    .collect::<Result<Vec<_>, _>>()?;
  Ok(VaultAuditPage {
    items,
    total,
    page,
    page_size,
  })
}

fn assert_vault_transfer(
  conn: &Connection,
  transaction_id: &str,
) -> Result<(String, String, String, String, String, i64), AppError> {
  let (reference, description, tx_type, status): (String, Option<String>, String, String) = conn
    .query_row(
      r#"SELECT reference, description, type, status FROM "Transaction"
         WHERE id=?1 AND deletedAt IS NULL"#,
      [transaction_id],
      |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    )
    .optional()?
    .ok_or_else(|| AppError::NotFound("Movement not found.".into()))?;
  if tx_type != "TRANSFER" {
    return Err(AppError::Validation(
      "Only vault cash moves can be edited here.".into(),
    ));
  }
  if status.eq_ignore_ascii_case("VOID") {
    return Err(AppError::Validation("This movement is already void.".into()));
  }

  let mut stmt = conn.prepare(
    r#"SELECT le.walletId, le.direction, c.code, c.decimalPlaces, CAST(le.amount AS TEXT)
       FROM LedgerEntry le
       INNER JOIN Currency c ON c.id = le.currencyId
       INNER JOIN Wallet w ON w.id = le.walletId AND w.type IN ('VAULT','TILL')
       WHERE le.transactionId = ?1"#,
  )?;
  let legs: Vec<(String, String, String, i64, String)> = stmt
    .query_map([transaction_id], |row| {
      Ok((
        row.get(0)?,
        row.get(1)?,
        row.get(2)?,
        row.get(3)?,
        row.get(4)?,
      ))
    })?
    .collect::<Result<Vec<_>, _>>()?;
  if legs.len() < 2 {
    return Err(AppError::Validation(
      "This transfer does not touch two vaults.".into(),
    ));
  }
  let from = legs
    .iter()
    .find(|l| l.1 == "CREDIT")
    .ok_or_else(|| AppError::Validation("Missing money-out side.".into()))?;
  let to = legs
    .iter()
    .find(|l| l.1 == "DEBIT")
    .ok_or_else(|| AppError::Validation("Missing money-in side.".into()))?;
  Ok((
    reference,
    description.unwrap_or_default(),
    from.0.clone(),
    to.0.clone(),
    from.2.clone(),
    from.3,
  ))
}

fn assert_business_day_open(_conn: &Connection) -> Result<(), AppError> {
  // Business-day open/close is disabled for now — never block vault ops.
  Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateVaultMovementInput {
  pub transaction_id: String,
  pub reason: Option<String>,
  pub amount: Option<String>,
  pub created_by_id: String,
}

/// Soft-delete a vault TRANSFER with balance-cache reverse (idempotent if already deleted).
pub(crate) fn delete_vault_transfer_core(
  conn: &Connection,
  transaction_id: &str,
  actor_id: &str,
  reason: Option<String>,
) -> Result<(), AppError> {
  let row: Option<(String, String, Option<String>)> = conn
    .query_row(
      r#"SELECT reference, type, deletedAt FROM "Transaction" WHERE id = ?1"#,
      [transaction_id],
      |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )
    .optional()?;
  let Some((reference, tx_type, deleted_at)) = row else {
    return Err(AppError::NotFound("Movement not found.".into()));
  };
  if deleted_at.is_some() {
    // Already voided — do not reverse balances again.
    return Ok(());
  }
  if tx_type != "TRANSFER" {
    return Err(AppError::Validation(
      "Only vault cash moves can be deleted here.".into(),
    ));
  }
  // Confirm it is a two-vault transfer before voiding.
  let _ = assert_vault_transfer(conn, transaction_id)?;

  conn.execute_batch("BEGIN IMMEDIATE;")?;
  let result = (|| -> Result<(), AppError> {
    soft_delete_transaction(conn, transaction_id)?;
    write_audit(
      conn,
      Some(actor_id),
      "DELETE_VAULT_TRANSFER",
      transaction_id,
      Some(
        &serde_json::json!({
          "reference": reference,
          "reason": trim_opt(reason),
        })
        .to_string(),
      ),
      None,
    )?;
    Ok(())
  })();
  match result {
    Ok(()) => {
      conn.execute_batch("COMMIT;")?;
      Ok(())
    }
    Err(e) => {
      let _ = conn.execute_batch("ROLLBACK;");
      Err(e)
    }
  }
}

/// Replace vault transfer amount: validate → reverse old (soft-delete) → post new, atomically.
pub(crate) fn replace_vault_transfer_amount_core(
  conn: &Connection,
  transaction_id: &str,
  actor_id: &str,
  reason: String,
  amount_major: &str,
) -> Result<PostedTransaction, AppError> {
  let (reference, _old_desc, from, to, code, places) =
    assert_vault_transfer(conn, transaction_id)?;
  let minor = money_from_major_units(amount_major.trim(), places)?;
  if minor <= 0 {
    return Err(AppError::Validation("Amount must be positive.".into()));
  }
  let amount_disp = money_to_major_unit_string(minor, places)?;
  let ref_no = format!("VT-{}", chrono::Utc::now().timestamp_millis());

  conn.execute_batch("BEGIN IMMEDIATE;")?;
  let result = (|| -> Result<PostedTransaction, AppError> {
    soft_delete_transaction(conn, transaction_id)?;
    let posted = post_transaction_in_tx(
      conn,
      PostTransactionInput {
        reference: ref_no.clone(),
        r#type: "TRANSFER".into(),
        value_date: now_sqlite(),
        customer_id: None,
        walk_in_name: None,
        walk_in_phone: None,
        description: Some(reason.clone()),
        created_by_id: Some(actor_id.to_string()),
        entries: vec![
          PostingLineDto {
            wallet_id: from,
            currency: code.clone(),
            direction: "CREDIT".into(),
            amount_minor: minor.to_string(),
            exchange_rate_id: None,
            memo: Some("Money moved out".into()),
          },
          PostingLineDto {
            wallet_id: to,
            currency: code,
            direction: "DEBIT".into(),
            amount_minor: minor.to_string(),
            exchange_rate_id: None,
            memo: Some("Money moved in".into()),
          },
        ],
      },
    )?;
    write_audit(
      conn,
      Some(actor_id),
      "EDIT_VAULT_TRANSFER",
      &posted.id,
      Some(&serde_json::json!({ "replaced": transaction_id, "oldReference": reference }).to_string()),
      Some(
        &serde_json::json!({
          "reference": ref_no,
          "amount": amount_disp,
          "reason": reason,
        })
        .to_string(),
      ),
    )?;
    Ok(posted)
  })();
  match result {
    Ok(posted) => {
      conn.execute_batch("COMMIT;")?;
      Ok(posted)
    }
    Err(e) => {
      let _ = conn.execute_batch("ROLLBACK;");
      Err(e)
    }
  }
}

#[tauri::command]
pub fn update_vault_movement(
  state: State<'_, AppState>,
  input: UpdateVaultMovementInput,
) -> Result<PostedTransaction, AppError> {
  let tid = input.transaction_id.trim().to_string();
  if tid.is_empty() {
    return Err(AppError::Validation(
      "Transaction and user are required.".into(),
    ));
  }
  let _ = input.created_by_id.trim();
  let conn = state.db.lock();
  let actor = require_screen(&state, &conn, "vaults")?;
  let actor = actor.id.clone();
  assert_business_day_open(&conn)?;

  let (reference, old_desc, _from, _to, _code, _places) = assert_vault_transfer(&conn, &tid)?;
  let reason = trim_opt(input.reason).unwrap_or(old_desc);
  let new_amount = trim_opt(input.amount);

  if let Some(amount) = new_amount {
    return replace_vault_transfer_amount_core(&conn, &tid, &actor, reason, &amount);
  }

  let now = now_sqlite();
  conn.execute(
    r#"UPDATE "Transaction" SET description=?1, updatedAt=?2 WHERE id=?3 AND deletedAt IS NULL"#,
    params![reason, now, tid],
  )?;
  write_audit(
    &conn,
    Some(&actor),
    "EDIT_VAULT_TRANSFER_META",
    &tid,
    Some(&serde_json::json!({ "reference": reference }).to_string()),
    Some(&serde_json::json!({ "reason": reason }).to_string()),
  )?;

  let (id, reference, display_ref, r#type, value_date, status): (
    String,
    String,
    String,
    String,
    String,
    String,
  ) = conn.query_row(
      r#"SELECT id, reference, IFNULL(displayRef,''), type, valueDate, status FROM "Transaction" WHERE id=?1"#,
      [&tid],
      |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?)),
    )?;
  Ok(PostedTransaction {
    id,
    reference,
    display_ref,
    r#type,
    value_date,
    status,
    ledger_entries: vec![],
  })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteVaultMovementInput {
  pub transaction_id: String,
  pub reason: Option<String>,
  pub created_by_id: String,
}

#[tauri::command]
pub fn delete_vault_movement(
  state: State<'_, AppState>,
  input: DeleteVaultMovementInput,
) -> Result<(), AppError> {
  let tid = input.transaction_id.trim().to_string();
  if tid.is_empty() {
    return Err(AppError::Validation(
      "Transaction and user are required.".into(),
    ));
  }
  let _ = input.created_by_id.trim();
  let conn = state.db.lock();
  let actor = require_screen(&state, &conn, "vaults")?;
  let actor = actor.id.clone();
  assert_business_day_open(&conn)?;

  delete_vault_transfer_core(&conn, &tid, &actor, input.reason)
}

#[cfg(test)]
mod vault_transfer_integrity_tests {
  use super::*;
  use crate::ledger::{ensure_wallet_balance_cache, post_transaction, PostTransactionInput, PostingLineDto};

  fn setup() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    conn
      .execute_batch(
        r#"
        CREATE TABLE "User" (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          fullName TEXT NOT NULL DEFAULT '',
          passwordHash TEXT NOT NULL DEFAULT 'x',
          role TEXT NOT NULL DEFAULT 'ADMIN',
          isActive INTEGER NOT NULL DEFAULT 1
        );
        CREATE TABLE Currency (
          id TEXT PRIMARY KEY,
          code TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          symbol TEXT,
          decimalPlaces INTEGER NOT NULL DEFAULT 2,
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
          isActive INTEGER NOT NULL DEFAULT 1,
          deletedAt TEXT,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL
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
    let now = now_sqlite();
    conn.execute(
      r#"INSERT INTO "User" (id, username, fullName, role, isActive) VALUES ('u1','admin','Admin','ADMIN',1)"#,
      [],
    )
    .unwrap();
    conn.execute(
      "INSERT INTO Currency (id, code, name, decimalPlaces, isActive) VALUES ('c1','AFN','Afghani',0,1)",
      [],
    )
    .unwrap();
    for (id, name) in [("v1", "Vault A"), ("v2", "Vault B")] {
      conn
        .execute(
          "INSERT INTO Wallet (id, name, type, isActive, deletedAt, createdAt, updatedAt)
           VALUES (?1, ?2, 'VAULT', 1, NULL, ?3, ?3)",
          params![id, name, now],
        )
        .unwrap();
    }
    // Seed Vault A with 1000 AFN via opening ADJUSTMENT against equity-like vault B credit...
    // Simpler: post TRANSFER isn't seeded — seed via apply by posting DEBIT to v1 from a SYSTEM equity wallet.
    conn
      .execute(
        "INSERT INTO Wallet (id, name, type, isActive, deletedAt, createdAt, updatedAt)
         VALUES ('eq', 'Opening Equity', 'SYSTEM', 1, NULL, ?1, ?1)",
        [&now],
      )
      .unwrap();
    post_transaction(
      &conn,
      PostTransactionInput {
        reference: "SEED-V1".into(),
        r#type: "ADJUSTMENT".into(),
        value_date: now.clone(),
        customer_id: None,
        walk_in_name: None,
        walk_in_phone: None,
        description: Some("seed".into()),
        created_by_id: Some("u1".into()),
        entries: vec![
          PostingLineDto {
            wallet_id: "eq".into(),
            currency: "AFN".into(),
            direction: "CREDIT".into(),
            amount_minor: "1000".into(),
            exchange_rate_id: None,
            memo: None,
          },
          PostingLineDto {
            wallet_id: "v1".into(),
            currency: "AFN".into(),
            direction: "DEBIT".into(),
            amount_minor: "1000".into(),
            exchange_rate_id: None,
            memo: None,
          },
        ],
      },
    )
    .unwrap();
    conn
  }

  fn cache_balance(conn: &Connection, wallet_id: &str) -> f64 {
    conn.query_row(
      "SELECT COALESCE(balance, 0) FROM WalletCurrencyBalance
       WHERE walletId = ?1 AND currencyId = 'c1'",
      [wallet_id],
      |row| row.get(0),
    )
    .unwrap_or(0.0)
  }

  fn ledger_balance(conn: &Connection, wallet_id: &str) -> f64 {
    wallet_balance(conn, wallet_id, Some("c1")).unwrap()
  }

  fn post_transfer(conn: &Connection, amount_minor: &str, reference: &str) -> String {
    let posted = post_transaction(
      conn,
      PostTransactionInput {
        reference: reference.into(),
        r#type: "TRANSFER".into(),
        value_date: now_sqlite(),
        customer_id: None,
        walk_in_name: None,
        walk_in_phone: None,
        description: Some("move".into()),
        created_by_id: Some("u1".into()),
        entries: vec![
          PostingLineDto {
            wallet_id: "v1".into(),
            currency: "AFN".into(),
            direction: "CREDIT".into(),
            amount_minor: amount_minor.into(),
            exchange_rate_id: None,
            memo: Some("Money moved out".into()),
          },
          PostingLineDto {
            wallet_id: "v2".into(),
            currency: "AFN".into(),
            direction: "DEBIT".into(),
            amount_minor: amount_minor.into(),
            exchange_rate_id: None,
            memo: Some("Money moved in".into()),
          },
        ],
      },
    )
    .unwrap();
    posted.id
  }

  #[test]
  fn create_transfer_updates_both_vault_balances() {
    let conn = setup();
    assert!((cache_balance(&conn, "v1") - 1000.0).abs() < 1e-9);
    assert!((cache_balance(&conn, "v2") - 0.0).abs() < 1e-9);

    let _id = post_transfer(&conn, "250", "VT-TEST-1");
    assert!((cache_balance(&conn, "v1") - 750.0).abs() < 1e-9);
    assert!((cache_balance(&conn, "v2") - 250.0).abs() < 1e-9);
    assert!((ledger_balance(&conn, "v1") - cache_balance(&conn, "v1")).abs() < 1e-9);
    assert!((ledger_balance(&conn, "v2") - cache_balance(&conn, "v2")).abs() < 1e-9);
  }

  #[test]
  fn delete_transfer_restores_both_balances() {
    let conn = setup();
    let tid = post_transfer(&conn, "250", "VT-DEL-1");
    delete_vault_transfer_core(&conn, &tid, "u1", Some("void".into())).unwrap();

    assert!((cache_balance(&conn, "v1") - 1000.0).abs() < 1e-9);
    assert!((cache_balance(&conn, "v2") - 0.0).abs() < 1e-9);
    assert!((ledger_balance(&conn, "v1") - 1000.0).abs() < 1e-9);
    assert!((ledger_balance(&conn, "v2") - 0.0).abs() < 1e-9);

    let deleted: Option<String> = conn
      .query_row(
        r#"SELECT deletedAt FROM "Transaction" WHERE id = ?1"#,
        [&tid],
        |row| row.get(0),
      )
      .unwrap();
    assert!(deleted.is_some());
  }

  #[test]
  fn edit_transfer_reflects_new_amount_on_both_vaults() {
    let conn = setup();
    let tid = post_transfer(&conn, "250", "VT-EDIT-1");
    let posted =
      replace_vault_transfer_amount_core(&conn, &tid, "u1", "updated".into(), "400").unwrap();
    assert_ne!(posted.id, tid);

    assert!((cache_balance(&conn, "v1") - 600.0).abs() < 1e-9);
    assert!((cache_balance(&conn, "v2") - 400.0).abs() < 1e-9);
    assert!((ledger_balance(&conn, "v1") - cache_balance(&conn, "v1")).abs() < 1e-9);
    assert!((ledger_balance(&conn, "v2") - cache_balance(&conn, "v2")).abs() < 1e-9);

    let old_deleted: Option<String> = conn
      .query_row(
        r#"SELECT deletedAt FROM "Transaction" WHERE id = ?1"#,
        [&tid],
        |row| row.get(0),
      )
      .unwrap();
    assert!(old_deleted.is_some());
  }

  #[test]
  fn edit_failure_rolls_back_balances_and_original_tx() {
    let conn = setup();
    let tid = post_transfer(&conn, "250", "VT-FAIL-1");
    let from_before = cache_balance(&conn, "v1");
    let to_before = cache_balance(&conn, "v2");

    // Force post failure after soft-delete by deactivating destination vault.
    conn
      .execute("UPDATE Wallet SET isActive = 0 WHERE id = 'v2'", [])
      .unwrap();
    let err = replace_vault_transfer_amount_core(&conn, &tid, "u1", "x".into(), "300")
      .unwrap_err();
    assert!(
      err.to_string().contains("inactive") || err.to_string().contains("Validation"),
      "{err}"
    );

    assert!((cache_balance(&conn, "v1") - from_before).abs() < 1e-9);
    assert!((cache_balance(&conn, "v2") - to_before).abs() < 1e-9);
    let deleted: Option<String> = conn
      .query_row(
        r#"SELECT deletedAt FROM "Transaction" WHERE id = ?1"#,
        [&tid],
        |row| row.get(0),
      )
      .unwrap();
    assert!(deleted.is_none(), "original must remain intact after rollback");
  }

  #[test]
  fn delete_twice_does_not_reverse_twice() {
    let conn = setup();
    let tid = post_transfer(&conn, "250", "VT-IDEMP-1");
    delete_vault_transfer_core(&conn, &tid, "u1", None).unwrap();
    assert!((cache_balance(&conn, "v1") - 1000.0).abs() < 1e-9);
    assert!((cache_balance(&conn, "v2") - 0.0).abs() < 1e-9);

    // Second delete is idempotent — balances stay restored (not reversed again).
    delete_vault_transfer_core(&conn, &tid, "u1", None).unwrap();
    assert!((cache_balance(&conn, "v1") - 1000.0).abs() < 1e-9);
    assert!((cache_balance(&conn, "v2") - 0.0).abs() < 1e-9);
  }
}

#[cfg(test)]
mod main_vault_cash_replace_tests {
  use super::*;
  use crate::commands::auth_pin::require_authorization_pin;
  use crate::commands::trading::util::soft_delete_desk_transaction;
  use crate::ledger::{
    ensure_wallet_balance_cache, post_transaction, post_transaction_in_tx, PostTransactionInput,
    PostingLineDto,
  };

  fn setup() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    let pin_hash = bcrypt::hash("654321", 4).unwrap();
    conn
      .execute_batch(
        r#"
        CREATE TABLE "User" (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          fullName TEXT NOT NULL DEFAULT '',
          passwordHash TEXT NOT NULL DEFAULT 'x',
          role TEXT NOT NULL DEFAULT 'ADMIN',
          isActive INTEGER NOT NULL DEFAULT 1,
          authPinHash TEXT,
          authPinFailCount INTEGER NOT NULL DEFAULT 0,
          authPinLockedUntil TEXT
        );
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
          isActive INTEGER NOT NULL DEFAULT 1,
          deletedAt TEXT,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL
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
    let now = now_sqlite();
    conn
      .execute(
        r#"INSERT INTO "User" (id, username, fullName, role, isActive, authPinHash)
           VALUES ('admin','admin','Admin','ADMIN',1,?1)"#,
        [&pin_hash],
      )
      .unwrap();
    conn
      .execute(
        "INSERT INTO Currency (id, code, name, decimalPlaces, isActive) VALUES ('c1','AFN','Afghani',0,1)",
        [],
      )
      .unwrap();
    for (id, name, wtype) in [
      ("cash", "Main Vault", "VAULT"),
      ("eq", "Opening Equity", "SYSTEM"),
    ] {
      conn
        .execute(
          "INSERT INTO Wallet (id, name, type, isActive, deletedAt, createdAt, updatedAt)
           VALUES (?1, ?2, ?3, 1, NULL, ?4, ?4)",
          params![id, name, wtype, now],
        )
        .unwrap();
    }
    conn
  }

  fn post_cash_in(conn: &Connection, amount: &str, reference: &str) -> String {
    post_transaction(
      conn,
      PostTransactionInput {
        reference: reference.into(),
        r#type: "VAULT_CASH_IN".into(),
        value_date: now_sqlite(),
        customer_id: None,
        walk_in_name: None,
        walk_in_phone: None,
        description: Some("cash in".into()),
        created_by_id: Some("admin".into()),
        entries: vec![
          PostingLineDto {
            wallet_id: "cash".into(),
            currency: "AFN".into(),
            direction: "DEBIT".into(),
            amount_minor: amount.into(),
            exchange_rate_id: None,
            memo: None,
          },
          PostingLineDto {
            wallet_id: "eq".into(),
            currency: "AFN".into(),
            direction: "CREDIT".into(),
            amount_minor: amount.into(),
            exchange_rate_id: None,
            memo: None,
          },
        ],
      },
    )
    .unwrap()
    .id
  }

  fn deleted_at(conn: &Connection, tid: &str) -> Option<String> {
    conn.query_row(
      r#"SELECT deletedAt FROM "Transaction" WHERE id = ?1"#,
      [tid],
      |row| row.get(0),
    )
    .unwrap()
  }

  fn cache_cash(conn: &Connection) -> f64 {
    conn.query_row(
      "SELECT COALESCE(balance, 0) FROM WalletCurrencyBalance
       WHERE walletId = 'cash' AND currencyId = 'c1'",
      [],
      |row| row.get(0),
    )
    .unwrap_or(0.0)
  }

  /// Production order: validate replace target → PIN → only then soft-delete.
  #[test]
  fn failed_pin_leaves_original_cash_in_intact() {
    let conn = setup();
    let tid = post_cash_in(&conn, "500", "CASH-IN-OLD");
    assert_replaceable_vault_cash(&conn, &tid).unwrap();

    let err = require_authorization_pin(
      &conn,
      Some("111111"),
      Some("admin"),
      "CASH_IN",
      "600 AFN",
    )
    .unwrap_err();
    assert!(err.to_string().contains("AUTH_PIN_INVALID"), "{err}");

    // Must NOT soft-delete before/without successful PIN.
    assert!(deleted_at(&conn, &tid).is_none());
    assert!((cache_cash(&conn) - 500.0).abs() < 1e-9);
  }

  #[test]
  fn replace_after_pin_updates_balances_atomically() {
    let conn = setup();
    let tid = post_cash_in(&conn, "500", "CASH-IN-REP");
    assert_replaceable_vault_cash(&conn, &tid).unwrap();
    require_authorization_pin(&conn, Some("654321"), Some("admin"), "CASH_IN", "700 AFN")
      .unwrap();

    conn.execute_batch("BEGIN IMMEDIATE;").unwrap();
    let posted = (|| -> Result<String, AppError> {
      soft_delete_desk_transaction(&conn, &tid)?;
      let p = post_transaction_in_tx(
        &conn,
        PostTransactionInput {
          reference: "CASH-IN-NEW".into(),
          r#type: "VAULT_CASH_IN".into(),
          value_date: now_sqlite(),
          customer_id: None,
          walk_in_name: None,
          walk_in_phone: None,
          description: Some("replaced".into()),
          created_by_id: Some("admin".into()),
          entries: vec![
            PostingLineDto {
              wallet_id: "cash".into(),
              currency: "AFN".into(),
              direction: "DEBIT".into(),
              amount_minor: "700".into(),
              exchange_rate_id: None,
              memo: None,
            },
            PostingLineDto {
              wallet_id: "eq".into(),
              currency: "AFN".into(),
              direction: "CREDIT".into(),
              amount_minor: "700".into(),
              exchange_rate_id: None,
              memo: None,
            },
          ],
        },
      )?;
      Ok(p.id)
    })();
    match posted {
      Ok(_) => conn.execute_batch("COMMIT;").unwrap(),
      Err(e) => {
        let _ = conn.execute_batch("ROLLBACK;");
        panic!("{e}");
      }
    }

    assert!(deleted_at(&conn, &tid).is_some());
    assert!((cache_cash(&conn) - 700.0).abs() < 1e-9);
  }

  #[test]
  fn replace_rolls_back_when_post_fails_after_pin() {
    let conn = setup();
    let tid = post_cash_in(&conn, "500", "CASH-IN-FAIL");
    assert_replaceable_vault_cash(&conn, &tid).unwrap();
    require_authorization_pin(&conn, Some("654321"), Some("admin"), "CASH_IN", "600 AFN")
      .unwrap();

    conn.execute_batch("BEGIN IMMEDIATE;").unwrap();
    let err = (|| -> Result<(), AppError> {
      soft_delete_desk_transaction(&conn, &tid)?;
      // Force post failure: inactive cash wallet.
      conn.execute("UPDATE Wallet SET isActive = 0 WHERE id = 'cash'", [])?;
      let _ = post_transaction_in_tx(
        &conn,
        PostTransactionInput {
          reference: "CASH-IN-FAIL-NEW".into(),
          r#type: "VAULT_CASH_IN".into(),
          value_date: now_sqlite(),
          customer_id: None,
          walk_in_name: None,
          walk_in_phone: None,
          description: Some("x".into()),
          created_by_id: Some("admin".into()),
          entries: vec![
            PostingLineDto {
              wallet_id: "cash".into(),
              currency: "AFN".into(),
              direction: "DEBIT".into(),
              amount_minor: "600".into(),
              exchange_rate_id: None,
              memo: None,
            },
            PostingLineDto {
              wallet_id: "eq".into(),
              currency: "AFN".into(),
              direction: "CREDIT".into(),
              amount_minor: "600".into(),
              exchange_rate_id: None,
              memo: None,
            },
          ],
        },
      )?;
      Ok(())
    })();
    assert!(err.is_err());
    conn.execute_batch("ROLLBACK;").unwrap();

    // Reactivate for balance read of original state.
    conn
      .execute("UPDATE Wallet SET isActive = 1 WHERE id = 'cash'", [])
      .unwrap();
    assert!(
      deleted_at(&conn, &tid).is_none(),
      "original must remain after rollback"
    );
    assert!((cache_cash(&conn) - 500.0).abs() < 1e-9);
  }
}
