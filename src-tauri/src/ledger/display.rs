//! Customer-facing money display (hide accounting noise).

use rusqlite::Connection;

use crate::error::AppError;

/// Wallet names that are accounting plumbing — never show to operators as the “what happened” line.
pub fn is_noise_wallet_name(name: &str) -> bool {
  let n = name.to_ascii_uppercase();
  n.contains("OPENING EQUITY")
    || n.contains("EXCHANGE DIFFERENCE")
    || n.contains("HAWALA CLEARING")
    || n.contains("WALK-IN OUTBOUND")
    || n.contains("COMMISSION INCOME")
    || n.contains("COMMISSION")
    || n.contains("SYSTEM")
}

pub fn is_displayable_wallet(wallet_type: &str, wallet_name: &str) -> bool {
  !wallet_type.eq_ignore_ascii_case("SYSTEM") && !is_noise_wallet_name(wallet_name)
}

fn format_amount_display(amount: f64) -> String {
  if (amount - amount.round()).abs() < 1e-9 {
    format!("{}", amount.round() as i64)
  } else {
    format!("{amount:.4}")
      .trim_end_matches('0')
      .trim_end_matches('.')
      .to_string()
  }
}

struct MoneyHit {
  code: String,
  direction: String,
  amount: f64,
  wallet_type: String,
}

/// Build `+ USD 100 · − AFN 50` style summaries for many transactions.
/// Prefer CUSTOMER wallet lines; if none, use VAULT/TILL cash. Skip SYSTEM / equity / clearing noise.
pub fn fill_customer_facing_amount_summaries(
  conn: &Connection,
  tx_ids: &[String],
) -> Result<std::collections::HashMap<String, String>, AppError> {
  let mut out: std::collections::HashMap<String, String> = std::collections::HashMap::new();
  if tx_ids.is_empty() {
    return Ok(out);
  }

  let placeholders = tx_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
  let sql = format!(
    r#"SELECT le.transactionId, c.code, le.direction,
              CAST(le.amount AS REAL), w.type, w.name
       FROM LedgerEntry le
       INNER JOIN Wallet w ON w.id = le.walletId
       INNER JOIN Currency c ON c.id = le.currencyId AND c.deletedAt IS NULL
       WHERE le.transactionId IN ({placeholders})
       ORDER BY le.transactionId, c.code, le.createdAt"#
  );
  let params: Vec<&dyn rusqlite::types::ToSql> = tx_ids
    .iter()
    .map(|id| id as &dyn rusqlite::types::ToSql)
    .collect();
  let mut stmt = conn.prepare(&sql)?;

  let mut by_tx: std::collections::HashMap<String, Vec<MoneyHit>> =
    std::collections::HashMap::new();
  for row in stmt.query_map(params.as_slice(), |row| {
    Ok((
      row.get::<_, String>(0)?,
      row.get::<_, String>(1)?,
      row.get::<_, String>(2)?,
      row.get::<_, f64>(3)?,
      row.get::<_, String>(4)?,
      row.get::<_, String>(5)?,
    ))
  })? {
    let (tx_id, code, direction, amount, wallet_type, wallet_name) = row?;
    if wallet_type.eq_ignore_ascii_case("SYSTEM") || is_noise_wallet_name(&wallet_name) {
      continue;
    }
    by_tx.entry(tx_id).or_default().push(MoneyHit {
      code,
      direction,
      amount,
      wallet_type,
    });
  }

  for id in tx_ids {
    let Some(hits) = by_tx.remove(id) else {
      out.insert(id.clone(), "—".into());
      continue;
    };
    let customer: Vec<&MoneyHit> = hits
      .iter()
      .filter(|h| h.wallet_type.eq_ignore_ascii_case("CUSTOMER"))
      .collect();
    let chosen: Vec<&MoneyHit> = if !customer.is_empty() {
      customer
    } else {
      hits
        .iter()
        .filter(|h| {
          h.wallet_type.eq_ignore_ascii_case("VAULT")
            || h.wallet_type.eq_ignore_ascii_case("TILL")
        })
        .collect()
    };

    // Aggregate same currency+direction
    let mut agg: std::collections::BTreeMap<(String, String), f64> =
      std::collections::BTreeMap::new();
    for h in chosen {
      *agg
        .entry((h.code.clone(), h.direction.to_ascii_uppercase()))
        .or_default() += h.amount;
    }
    let mut parts = Vec::new();
    for ((code, direction), amount) in agg {
      let display = format_amount_display(amount);
      let signed = if direction == "DEBIT" {
        format!("+ {code} {display}")
      } else {
        format!("− {code} {display}")
      };
      parts.push(signed);
    }
    out.insert(
      id.clone(),
      if parts.is_empty() {
        "—".into()
      } else {
        parts.join(" · ")
      },
    );
  }

  Ok(out)
}

#[derive(Debug, Clone, Default)]
pub struct TransferParties {
  pub sender_name: Option<String>,
  pub receiver_name: Option<String>,
  pub amount: Option<String>,
  pub currency_code: Option<String>,
}

fn parse_transfer_names_from_description(description: Option<&str>) -> (Option<String>, Option<String>) {
  let Some(raw) = description.map(str::trim).filter(|s| !s.is_empty()) else {
    return (None, None);
  };
  // "Transfer 1100 AFN from samsoor to ali" or "... from X to Y"
  let lower = raw.to_ascii_lowercase();
  if let Some(from_idx) = lower.rfind(" from ") {
    let after_from = &raw[from_idx + " from ".len()..];
    let after_lower = after_from.to_ascii_lowercase();
    if let Some(to_idx) = after_lower.rfind(" to ") {
      let sender = after_from[..to_idx].trim();
      let receiver = after_from[to_idx + " to ".len()..].trim();
      if !sender.is_empty() && !receiver.is_empty() {
        return (Some(sender.to_string()), Some(receiver.to_string()));
      }
    }
  }
  if let Some(caps) = raw.split_once(" to ") {
    // Weak fallback: "... to Receiver" without from
    let receiver = caps.1.trim();
    if !receiver.is_empty() {
      return (None, Some(receiver.to_string()));
    }
  }
  (None, None)
}

/// Resolve transfer sender/receiver from CUSTOMER ledger lines (CREDIT=sender, DEBIT=receiver).
pub fn fill_transfer_parties(
  conn: &Connection,
  tx_ids: &[String],
  descriptions: &std::collections::HashMap<String, Option<String>>,
) -> Result<std::collections::HashMap<String, TransferParties>, AppError> {
  let mut out: std::collections::HashMap<String, TransferParties> =
    std::collections::HashMap::new();
  if tx_ids.is_empty() {
    return Ok(out);
  }

  let placeholders = tx_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
  let sql = format!(
    r#"SELECT le.transactionId, le.direction, CAST(le.amount AS REAL), c.code, cust.fullName
       FROM LedgerEntry le
       INNER JOIN Wallet w ON w.id = le.walletId
         AND w.type = 'CUSTOMER' AND w.deletedAt IS NULL
       INNER JOIN Customer cust ON cust.id = w.customerId
       INNER JOIN Currency c ON c.id = le.currencyId AND c.deletedAt IS NULL
       WHERE le.transactionId IN ({placeholders})
       ORDER BY le.transactionId, le.createdAt"#
  );
  let params: Vec<&dyn rusqlite::types::ToSql> = tx_ids
    .iter()
    .map(|id| id as &dyn rusqlite::types::ToSql)
    .collect();
  let mut stmt = conn.prepare(&sql)?;

  struct Hit {
    direction: String,
    amount: f64,
    code: String,
    name: String,
  }
  let mut by_tx: std::collections::HashMap<String, Vec<Hit>> =
    std::collections::HashMap::new();
  for row in stmt.query_map(params.as_slice(), |row| {
    Ok((
      row.get::<_, String>(0)?,
      row.get::<_, String>(1)?,
      row.get::<_, f64>(2)?,
      row.get::<_, String>(3)?,
      row.get::<_, String>(4)?,
    ))
  })? {
    let (tx_id, direction, amount, code, name) = row?;
    by_tx.entry(tx_id).or_default().push(Hit {
      direction,
      amount,
      code,
      name,
    });
  }

  for id in tx_ids {
    let (desc_sender, desc_receiver) =
      parse_transfer_names_from_description(descriptions.get(id).and_then(|d| d.as_deref()));
    let mut parties = TransferParties {
      sender_name: desc_sender,
      receiver_name: desc_receiver,
      amount: None,
      currency_code: None,
    };
    if let Some(hits) = by_tx.remove(id) {
      let mut send_amt = 0.0_f64;
      let mut recv_amt = 0.0_f64;
      let mut send_code: Option<String> = None;
      let mut recv_code: Option<String> = None;
      for h in &hits {
        if h.direction.eq_ignore_ascii_case("CREDIT") {
          if parties.sender_name.is_none() {
            parties.sender_name = Some(h.name.clone());
          }
          send_amt += h.amount;
          send_code = Some(h.code.clone());
        } else if h.direction.eq_ignore_ascii_case("DEBIT") {
          if parties.receiver_name.is_none() {
            parties.receiver_name = Some(h.name.clone());
          }
          recv_amt += h.amount;
          recv_code = Some(h.code.clone());
        }
      }
      let amt = if send_amt > 0.0 {
        send_amt
      } else {
        recv_amt
      };
      let code = send_code.or(recv_code);
      if amt > 0.0 {
        parties.amount = Some(format_amount_display(amt));
        parties.currency_code = code;
      }
    }
    out.insert(id.clone(), parties);
  }

  Ok(out)
}

/// Prefer a single transfer amount like "− AFN 1100" (sender perspective) for lists.
pub fn transfer_amount_summary(parties: &TransferParties) -> Option<String> {
  match (&parties.amount, &parties.currency_code) {
    (Some(amount), Some(code)) => Some(format!("− {code} {amount}")),
    _ => None,
  }
}
