//! Vault Management — physical cash locations (VAULT/TILL wallets) + ledger truth.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::AppError;
use crate::ledger::{
  find_currency_by_code, money_from_major_units, money_to_major_unit_string, post_transaction,
  PostTransactionInput, PostedTransaction, PostingLineDto,
};
use crate::state::AppState;
use crate::util::{now_sqlite, today_local, format_f64};

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

  let currency_count: i64 = conn.query_row(
    r#"SELECT COUNT(DISTINCT le.currencyId)
       FROM LedgerEntry le
       INNER JOIN "Transaction" t ON t.id = le.transactionId AND t.deletedAt IS NULL
       WHERE le.walletId = ?1"#,
    [id],
    |row| row.get(0),
  )?;

  let total = wallet_balance(conn, id, None)?;
  let last_activity: Option<String> = conn
    .query_row(
      r#"SELECT MAX(t.valueDate)
         FROM LedgerEntry le
         INNER JOIN "Transaction" t ON t.id = le.transactionId AND t.deletedAt IS NULL
         WHERE le.walletId = ?1"#,
      [id],
      |row| row.get(0),
    )
    .optional()?
    .flatten();

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
         SELECT le.walletId,
                COUNT(DISTINCT le.currencyId) AS currency_count,
                SUM(CASE WHEN le.direction='DEBIT' THEN CAST(le.amount AS REAL)
                         ELSE -CAST(le.amount AS REAL) END) AS total_bal,
                MAX(t.valueDate) AS last_activity
         FROM LedgerEntry le
         INNER JOIN "Transaction" t ON t.id = le.transactionId AND t.deletedAt IS NULL
         GROUP BY le.walletId
       ) agg ON agg.walletId = w.id
       WHERE w.deletedAt IS NULL AND w.type IN ('VAULT','TILL')
       ORDER BY CASE w.type WHEN 'VAULT' THEN 0 ELSE 1 END, w.name"#,
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

  let total_currencies: i64 = conn.query_row(
    r#"SELECT COUNT(DISTINCT le.currencyId)
       FROM LedgerEntry le
       INNER JOIN "Transaction" t ON t.id = le.transactionId AND t.deletedAt IS NULL
       INNER JOIN Wallet w ON w.id = le.walletId AND w.deletedAt IS NULL
         AND w.type IN ('VAULT','TILL')"#,
    [],
    |row| row.get(0),
  )?;

  let transfers_today: i64 = conn.query_row(
    r#"SELECT COUNT(DISTINCT t.id) FROM "Transaction" t
       INNER JOIN LedgerEntry le ON le.transactionId = t.id
       INNER JOIN Wallet w ON w.id = le.walletId AND w.type IN ('VAULT','TILL')
       WHERE t.deletedAt IS NULL AND t.type='TRANSFER'
         AND t.valueDate >= ?1 AND t.valueDate < date(?1, '+1 day')"#,
    [&today],
    |row| row.get(0),
  )?;

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
  let actor = trim_opt(input.created_by_id);
  let now = now_sqlite();
  let conn = state.db.lock();

  let id = if let Some(existing) = input.id.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
    assert_vault_wallet(&conn, existing)?;
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
      actor.as_deref(),
      "UPDATE_VAULT",
      existing,
      Some(&before),
      Some(&serde_json::json!({ "name": name, "isActive": is_active }).to_string()),
    )?;
    existing.to_string()
  } else {
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
      r#"INSERT INTO Wallet (
           id, name, type, customerId, userId, isActive, deletedAt, createdAt, updatedAt,
           code, location, description, notes
         ) VALUES (?1,?2,?3,NULL,?4,?5,NULL,?6,?6,?7,?8,?9,?10)"#,
      params![
        id,
        name,
        vault_type,
        user_id,
        if is_active { 1 } else { 0 },
        now,
        code,
        location,
        description,
        notes,
      ],
    )?;
    write_audit(
      &conn,
      actor.as_deref(),
      "CREATE_VAULT",
      &id,
      None,
      Some(&serde_json::json!({ "name": name, "type": vault_type }).to_string()),
    )?;
    id
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
  assert_vault_wallet(&conn, &id)?;
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
    created_by_id.as_deref().map(str::trim).filter(|s| !s.is_empty()),
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
  assert_vault_wallet(&conn, &id)?;
  let vault = load_vault_row(&conn, &id)?;

  let mut stmt = conn.prepare(
    r#"SELECT c.id, c.code, c.symbol,
              COALESCE(SUM(CASE WHEN le.direction='DEBIT' THEN CAST(le.amount AS REAL)
                                ELSE -CAST(le.amount AS REAL) END), 0) AS bal
       FROM Currency c
       LEFT JOIN LedgerEntry le ON le.currencyId = c.id AND le.walletId = ?1
       LEFT JOIN "Transaction" t ON t.id = le.transactionId AND t.deletedAt IS NULL
       WHERE c.deletedAt IS NULL AND c.isActive = 1
       GROUP BY c.id, c.code, c.symbol
       HAVING ABS(COALESCE(SUM(CASE WHEN t.id IS NOT NULL AND le.direction='DEBIT' THEN CAST(le.amount AS REAL)
                                    WHEN t.id IS NOT NULL THEN -CAST(le.amount AS REAL)
                                    ELSE 0 END), 0)) > 1e-9
       ORDER BY c.code"#,
  )?;

  let mut balances = Vec::new();
  let rows = stmt
    .query_map([&id], |row| {
      Ok((
        row.get::<_, String>(0)?,
        row.get::<_, String>(1)?,
        row.get::<_, Option<String>>(2)?,
        row.get::<_, f64>(3)?,
      ))
    })?
    .collect::<Result<Vec<_>, _>>()?;

  for (cid, code, symbol, current) in rows {
    let opening: f64 = conn.query_row(
      r#"SELECT COALESCE(SUM(CASE WHEN le.direction='DEBIT' THEN CAST(le.amount AS REAL)
                                  ELSE -CAST(le.amount AS REAL) END), 0)
         FROM LedgerEntry le
         INNER JOIN "Transaction" t ON t.id = le.transactionId AND t.deletedAt IS NULL
         WHERE le.walletId=?1 AND le.currencyId=?2 AND t.valueDate < ?3"#,
      params![id, cid, day],
      |row| row.get(0),
    )?;
    let cash_in: f64 = conn.query_row(
      r#"SELECT COALESCE(SUM(CAST(le.amount AS REAL)),0)
         FROM LedgerEntry le
         INNER JOIN "Transaction" t ON t.id = le.transactionId AND t.deletedAt IS NULL
         WHERE le.walletId=?1 AND le.currencyId=?2 AND le.direction='DEBIT'
           AND t.valueDate >= ?3 AND t.valueDate < date(?3, '+1 day')"#,
      params![id, cid, day],
      |row| row.get(0),
    )?;
    let cash_out: f64 = conn.query_row(
      r#"SELECT COALESCE(SUM(CAST(le.amount AS REAL)),0)
         FROM LedgerEntry le
         INNER JOIN "Transaction" t ON t.id = le.transactionId AND t.deletedAt IS NULL
         WHERE le.walletId=?1 AND le.currencyId=?2 AND le.direction='CREDIT'
           AND t.valueDate >= ?3 AND t.valueDate < date(?3, '+1 day')"#,
      params![id, cid, day],
      |row| row.get(0),
    )?;
    let last_mov: Option<String> = conn
      .query_row(
        r#"SELECT MAX(t.valueDate)
           FROM LedgerEntry le
           INNER JOIN "Transaction" t ON t.id = le.transactionId AND t.deletedAt IS NULL
           WHERE le.walletId=?1 AND le.currencyId=?2"#,
        params![id, cid],
        |row| row.get(0),
      )
      .optional()?
      .flatten();

    balances.push(VaultCurrencyBalance {
      currency_id: cid,
      currency_code: code,
      currency_symbol: symbol,
      current_balance: format_f64(current),
      opening_balance: format_f64(opening),
      cash_in_today: format_f64(cash_in),
      cash_out_today: format_f64(cash_out),
      expected_closing: format_f64(opening + cash_in - cash_out),
      last_movement_at: last_mov,
    });
  }

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
  input: VaultTransferInput,
) -> Result<PostedTransaction, AppError> {
  let from = input.from_vault_id.trim().to_string();
  let to = input.to_vault_id.trim().to_string();
  let created_by = input.created_by_id.trim().to_string();
  if from.is_empty() || to.is_empty() || from == to {
    return Err(AppError::Validation(
      "Choose two different vaults to move cash.".into(),
    ));
  }
  if created_by.is_empty() {
    return Err(AppError::Validation("User is required.".into()));
  }

  let conn = state.db.lock();

  let (_, from_type, from_active) = assert_vault_wallet(&conn, &from)?;
  let (_, to_type, to_active) = assert_vault_wallet(&conn, &to)?;
  if from_active == 0 || to_active == 0 {
    return Err(AppError::Validation(
      "Both vaults must be active.".into(),
    ));
  }
  let (_cid, code, places) = find_currency_by_code(&conn, &input.currency_code)?;
  let minor = money_from_major_units(input.amount.trim(), places)?;
  if minor <= 0 {
    return Err(AppError::Validation("Amount must be positive.".into()));
  }
  let value_date = input
    .value_date
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(|s| s.to_string())
    .unwrap_or_else(now_sqlite);
  let reason = trim_opt(input.reason);
  let notes = trim_opt(input.notes);
  let description = reason
    .clone()
    .or(notes.clone())
    .unwrap_or_else(|| format!("Move cash {from_type} → {to_type}"));

  let ref_no = format!("VT-{}", chrono::Utc::now().timestamp_millis());
  let amount_disp = money_to_major_unit_string(minor, places)?;
  let posted = post_transaction(
    &conn,
    PostTransactionInput {
      reference: ref_no.clone(),
      r#type: "TRANSFER".into(),
      value_date,
      customer_id: None,
      walk_in_name: None,
      walk_in_phone: None,
      description: Some(description),
      created_by_id: Some(created_by.clone()),
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
    &conn,
    Some(&created_by),
    "VAULT_TRANSFER",
    &posted.id,
    None,
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
      " AND (t.reference LIKE ? OR IFNULL(t.description,'') LIKE ? OR w.name LIKE ?)",
    );
    params_v.push(Box::new(like.clone()));
    params_v.push(Box::new(like.clone()));
    params_v.push(Box::new(like));
  }

  let count_sql = format!(
    r#"SELECT COUNT(*) FROM LedgerEntry le
       INNER JOIN "Transaction" t ON t.id = le.transactionId
       INNER JOIN Wallet w ON w.id = le.walletId
       INNER JOIN Currency c ON c.id = le.currencyId
       {where_sql}"#
  );
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

  let list_sql = format!(
    r#"SELECT t.id, t.reference, t.type, t.valueDate, c.code, CAST(le.amount AS TEXT),
              le.direction, w.name, u.fullName, t.description, t.status,
              (SELECT w2.name FROM LedgerEntry le2
               INNER JOIN Wallet w2 ON w2.id = le2.walletId
               WHERE le2.transactionId = t.id AND le2.walletId <> le.walletId
               LIMIT 1)
       FROM LedgerEntry le
       INNER JOIN "Transaction" t ON t.id = le.transactionId
       INNER JOIN Wallet w ON w.id = le.walletId
       INNER JOIN Currency c ON c.id = le.currencyId
       LEFT JOIN User u ON u.id = t.createdById
       {where_sql}
       ORDER BY t.valueDate DESC, t.createdAt DESC
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
        transaction_type: row.get(2)?,
        value_date: row.get(3)?,
        currency_code: row.get(4)?,
        amount: row.get(5)?,
        direction: row.get(6)?,
        wallet_name: row.get(7)?,
        user_name: row.get(8)?,
        description: row.get(9)?,
        status: row.get(10)?,
        counterparty_wallet: row.get(11)?,
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
  let created_by = input.created_by_id.trim().to_string();
  if created_by.is_empty() {
    return Err(AppError::Validation("User is required.".into()));
  }
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

#[tauri::command]
pub fn update_vault_movement(
  state: State<'_, AppState>,
  input: UpdateVaultMovementInput,
) -> Result<PostedTransaction, AppError> {
  let tid = input.transaction_id.trim().to_string();
  let actor = input.created_by_id.trim().to_string();
  if tid.is_empty() || actor.is_empty() {
    return Err(AppError::Validation(
      "Transaction and user are required.".into(),
    ));
  }
  let conn = state.db.lock();
  assert_business_day_open(&conn)?;

  let (reference, old_desc, from, to, code, places) = assert_vault_transfer(&conn, &tid)?;
  let reason = trim_opt(input.reason).unwrap_or(old_desc);
  let new_amount = trim_opt(input.amount);

  if let Some(amount) = new_amount {
    let minor = money_from_major_units(amount.trim(), places)?;
    if minor <= 0 {
      return Err(AppError::Validation("Amount must be positive.".into()));
    }
    let now = now_sqlite();
    conn.execute(
      r#"UPDATE "Transaction" SET deletedAt=?1, updatedAt=?1 WHERE id=?2 AND deletedAt IS NULL"#,
      params![now, tid],
    )?;
    let ref_no = format!("VT-{}", chrono::Utc::now().timestamp_millis());
    let amount_disp = money_to_major_unit_string(minor, places)?;
    let posted = post_transaction(
      &conn,
      PostTransactionInput {
        reference: ref_no.clone(),
        r#type: "TRANSFER".into(),
        value_date: now_sqlite(),
        customer_id: None,
        walk_in_name: None,
        walk_in_phone: None,
        description: Some(reason.clone()),
        created_by_id: Some(actor.clone()),
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
      &conn,
      Some(&actor),
      "EDIT_VAULT_TRANSFER",
      &posted.id,
      Some(&serde_json::json!({ "replaced": tid, "oldReference": reference }).to_string()),
      Some(
        &serde_json::json!({
          "reference": ref_no,
          "amount": amount_disp,
          "reason": reason,
        })
        .to_string(),
      ),
    )?;
    return Ok(posted);
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

  let (id, reference, r#type, value_date, status): (String, String, String, String, String) =
    conn.query_row(
      r#"SELECT id, reference, type, valueDate, status FROM "Transaction" WHERE id=?1"#,
      [&tid],
      |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
    )?;
  Ok(PostedTransaction {
    id,
    reference,
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
  let actor = input.created_by_id.trim().to_string();
  if tid.is_empty() || actor.is_empty() {
    return Err(AppError::Validation(
      "Transaction and user are required.".into(),
    ));
  }
  let conn = state.db.lock();
  assert_business_day_open(&conn)?;

  let (reference, _desc, _from, _to, _code, _places) = assert_vault_transfer(&conn, &tid)?;
  let now = now_sqlite();
  conn.execute(
    r#"UPDATE "Transaction" SET deletedAt=?1, updatedAt=?1 WHERE id=?2 AND deletedAt IS NULL"#,
    params![now, tid],
  )?;
  write_audit(
    &conn,
    Some(&actor),
    "DELETE_VAULT_TRANSFER",
    &tid,
    Some(
      &serde_json::json!({
        "reference": reference,
        "reason": trim_opt(input.reason),
      })
      .to_string(),
    ),
    None,
  )?;
  Ok(())
}
