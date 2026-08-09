//! Posting command — thin Tauri wrapper around ledger::post_transaction.

use tauri::State;

use crate::error::AppError;
use crate::ledger::{post_transaction as post_txn, PostTransactionInput, PostedTransaction};
use crate::state::AppState;

#[tauri::command]
pub fn post_transaction(
  state: State<'_, AppState>,
  input: PostTransactionInput,
) -> Result<PostedTransaction, AppError> {
  let conn = state.db.lock();
  post_txn(&conn, input)
}
