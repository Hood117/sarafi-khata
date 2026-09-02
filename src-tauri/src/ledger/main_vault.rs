//! Single shop-cash wallet: Main Vault (VAULT).
//!
//! Physical cash lives only here. SYSTEM wallets (Exchange Difference, Hawala Clearing,
//! Opening Equity, …) remain for double-entry — they are not cash drawers.

use rusqlite::{params, Connection, OptionalExtension};

use crate::error::AppError;
use crate::ledger::money::{money_from_major_units, money_to_major_unit_string};
use crate::ledger::post::{post_transaction, PostTransactionInput, PostingLineDto};
use crate::util::now_sqlite;

pub const MAIN_VAULT_WALLET_NAME: &str = "Main Vault";
#[allow(dead_code)] // kept for ops scripts / legacy name matching
pub const CASH_TILL_WALLET_NAME: &str = "Cash Till";

/// Ensure the Main Vault VAULT wallet exists and is active. Returns its id.
pub fn ensure_main_vault(conn: &Connection) -> Result<String, AppError> {
  let existing: Option<(String, i64)> = conn
    .query_row(
      "SELECT id, isActive FROM Wallet
       WHERE name = ?1 AND type = 'VAULT' AND deletedAt IS NULL
       LIMIT 1",
      [MAIN_VAULT_WALLET_NAME],
      |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .optional()?;

  if let Some((id, active)) = existing {
    if active == 0 {
      let now = now_sqlite();
      conn.execute(
        "UPDATE Wallet SET isActive = 1, updatedAt = ?2 WHERE id = ?1",
        params![id, now],
      )?;
    }
    let code: Option<String> = conn
      .query_row(
        "SELECT code FROM Wallet WHERE id = ?1 LIMIT 1",
        [&id],
        |row| row.get(0),
      )
      .optional()?
      .flatten();
    if code.as_deref().map(str::trim) != Some("1") {
      let now = now_sqlite();
      conn.execute(
        "UPDATE Wallet SET code = '1', updatedAt = ?2 WHERE id = ?1",
        params![id, now],
      )?;
    }
    return Ok(id);
  }

  let id = uuid::Uuid::new_v4().to_string();
  let now = now_sqlite();
  match conn.execute(
    "INSERT INTO Wallet (id, name, type, customerId, userId, isActive, deletedAt, createdAt, updatedAt, code)
     VALUES (?1, ?2, 'VAULT', NULL, NULL, 1, NULL, ?3, ?3, '1')",
    params![id, MAIN_VAULT_WALLET_NAME, now],
  ) {
    Ok(_) => Ok(id),
    Err(e) => {
      let msg = e.to_string();
      if msg.to_lowercase().contains("unique") {
        // Race / prior row: resolve existing Main Vault instead of failing bootstrap.
        let existing: Option<String> = conn
          .query_row(
            "SELECT id FROM Wallet
             WHERE name = ?1 AND type = 'VAULT' AND deletedAt IS NULL
             LIMIT 1",
            [MAIN_VAULT_WALLET_NAME],
            |row| row.get(0),
          )
          .optional()?;
        if let Some(existing_id) = existing {
          conn.execute(
            "UPDATE Wallet SET code = '1', isActive = 1, updatedAt = ?2 WHERE id = ?1",
            params![existing_id, now],
          )?;
          return Ok(existing_id);
        }
      }
      Err(e.into())
    }
  }
}

/// Resolve the only shop-cash wallet id (Main Vault). Creates it if missing.
pub fn resolve_main_vault_id(conn: &Connection) -> Result<String, AppError> {
  ensure_main_vault(conn)
}

/// Prefer Main Vault for any cash-side id. Empty / till / other cash → Main Vault.
pub fn resolve_shop_cash_wallet_id(
  conn: &Connection,
  preferred: Option<&str>,
) -> Result<String, AppError> {
  let main_id = ensure_main_vault(conn)?;
  let Some(raw) = preferred.map(str::trim).filter(|s| !s.is_empty()) else {
    return Ok(main_id);
  };
  if raw == main_id {
    return Ok(main_id);
  }

  let row: Option<(String, String, i64)> = conn
    .query_row(
      "SELECT id, type, isActive FROM Wallet WHERE id = ?1 AND deletedAt IS NULL LIMIT 1",
      [raw],
      |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )
    .optional()?;

  match row {
    Some((id, wtype, active))
      if active == 1 && id == main_id && wtype.eq_ignore_ascii_case("VAULT") =>
    {
      Ok(id)
    }
    // Legacy clients may still send Cash Till or another vault/till — redirect to Main Vault.
    Some((_, wtype, _))
      if wtype.eq_ignore_ascii_case("VAULT") || wtype.eq_ignore_ascii_case("TILL") =>
    {
      Ok(main_id)
    }
    Some(_) => Err(AppError::Validation(
      "Shop cash must use the Main Vault.".into(),
    )),
    None => Err(AppError::NotFound("Cash wallet was not found.".into())),
  }
}

/// Move balances from every other VAULT/TILL into Main Vault, then deactivate them.
/// Preserves all historical LedgerEntry rows (posts TRANSFER for residual balances).
pub fn consolidate_shop_cash_into_main_vault(conn: &Connection) -> Result<(), AppError> {
  if !table_exists(conn, "Wallet")? || !table_exists(conn, "LedgerEntry")? {
    return Ok(());
  }

  let main_id = ensure_main_vault(conn)?;

  let mut others = conn
    .prepare(
      "SELECT id, name, type FROM Wallet
       WHERE deletedAt IS NULL
         AND type IN ('VAULT','TILL')
         AND id != ?1
       ORDER BY type, name",
    )
    .map_err(|e| AppError::Db(format!("list cash wallets: {e}")))?;

  let rows: Vec<(String, String, String)> = others
    .query_map(params![main_id], |row| {
      Ok((row.get(0)?, row.get(1)?, row.get(2)?))
    })
    .map_err(|e| AppError::Db(format!("query cash wallets: {e}")))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| AppError::Db(format!("map cash wallets: {e}")))?;

  drop(others);

  for (other_id, other_name, _other_type) in rows {
    transfer_wallet_balances_to_main(conn, &other_id, &other_name, &main_id)?;
    let now = now_sqlite();
    conn.execute(
      "UPDATE Wallet SET isActive = 0, updatedAt = ?2 WHERE id = ?1",
      params![other_id, now],
    )?;
    log::info!("Main Vault consolidation: deactivated cash wallet '{other_name}' ({other_id})");
  }

  Ok(())
}

fn transfer_wallet_balances_to_main(
  conn: &Connection,
  from_wallet_id: &str,
  from_name: &str,
  main_id: &str,
) -> Result<(), AppError> {
  let mut stmt = conn
    .prepare(
      r#"SELECT c.id, c.code, c.decimalPlaces,
                CAST(COALESCE(SUM(
                  CASE WHEN le.direction = 'DEBIT' THEN le.amount ELSE -le.amount END
                ), 0) AS TEXT)
         FROM LedgerEntry le
         INNER JOIN "Transaction" tx
           ON tx.id = le.transactionId AND tx.deletedAt IS NULL
         INNER JOIN Currency c ON c.id = le.currencyId
         WHERE le.walletId = ?1
         GROUP BY c.id, c.code, c.decimalPlaces"#,
    )
    .map_err(|e| AppError::Db(format!("balance scan: {e}")))?;

  let balances: Vec<(String, String, i64, String)> = stmt
    .query_map([from_wallet_id], |row| {
      Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
    })
    .map_err(|e| AppError::Db(format!("balance query: {e}")))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| AppError::Db(format!("balance map: {e}")))?;

  drop(stmt);

  for (_currency_id, code, places, net_major) in balances {
    let trimmed = net_major.trim();
    if trimmed.is_empty() || trimmed == "0" {
      continue;
    }
    let negative = trimmed.starts_with('-');
    let unsigned = if negative { &trimmed[1..] } else { trimmed };
    if unsigned.chars().all(|c| c == '0' || c == '.') {
      continue;
    }
    let minor = match money_from_major_units(unsigned, places) {
      Ok(v) if v > 0 => v,
      _ => continue,
    };

    // Positive net on from-wallet → move to Main Vault (CREDIT from, DEBIT main).
    // Negative net → reverse (DEBIT from, CREDIT main) so Main absorbs the position.
    let (from_dir, main_dir) = if negative {
      ("DEBIT", "CREDIT")
    } else {
      ("CREDIT", "DEBIT")
    };
    let amount_s = money_to_major_unit_string(minor, places)?;
    let ref_code = format!(
      "MV-CONSOLIDATE-{}-{}",
      code,
      &uuid::Uuid::new_v4().to_string()[..8]
    );

    post_transaction(
      conn,
      PostTransactionInput {
        reference: ref_code,
        r#type: "TRANSFER".into(),
        value_date: now_sqlite(),
        entries: vec![
          PostingLineDto {
            wallet_id: from_wallet_id.to_string(),
            currency: code.clone(),
            direction: from_dir.into(),
            amount_minor: minor.to_string(),
            exchange_rate_id: None,
            memo: Some(format!("Consolidate {from_name} → Main Vault ({amount_s} {code})")),
          },
          PostingLineDto {
            wallet_id: main_id.to_string(),
            currency: code.clone(),
            direction: main_dir.into(),
            amount_minor: minor.to_string(),
            exchange_rate_id: None,
            memo: Some(format!("Consolidate from {from_name} ({amount_s} {code})")),
          },
        ],
        customer_id: None,
        walk_in_name: None,
        walk_in_phone: None,
        description: Some(format!(
          "One-time Main Vault consolidation from {from_name}"
        )),
        created_by_id: None,
      },
    )?;
  }

  Ok(())
}

fn table_exists(conn: &Connection, name: &str) -> Result<bool, AppError> {
  let exists: bool = conn.query_row(
    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1)",
    [name],
    |row| row.get(0),
  )?;
  Ok(exists)
}
