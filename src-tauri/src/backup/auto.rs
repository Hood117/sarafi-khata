//! Debounced auto-backup after financial posts.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use rusqlite::Connection;

use crate::backup::create_backup;

static PENDING: AtomicBool = AtomicBool::new(false);
static LAST_REASON: Mutex<String> = Mutex::new(String::new());

/// Queue a backup ~2.5s after the last request (matches Next.js debounce).
pub fn queue_auto_backup(db_path: PathBuf, reason: &str) {
  if let Ok(mut guard) = LAST_REASON.lock() {
    *guard = reason.to_string();
  }
  if PENDING.swap(true, Ordering::SeqCst) {
    return;
  }

  thread::spawn(move || {
    thread::sleep(Duration::from_millis(2500));
    PENDING.store(false, Ordering::SeqCst);
    let reason = LAST_REASON
      .lock()
      .map(|g| g.clone())
      .unwrap_or_else(|_| "auto".into());
    match Connection::open(&db_path) {
      Ok(conn) => {
        let _ = conn.execute_batch(
          "PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;",
        );
        match create_backup(&conn, &db_path, &reason) {
          Ok(result) => log::info!(
            "auto-backup {} -> {} location(s)",
            result.stamp,
            result.locations.len()
          ),
          Err(e) => log::warn!("auto-backup failed: {e}"),
        }
      }
      Err(e) => log::warn!("auto-backup open failed: {e}"),
    }
    let _ = Instant::now();
  });
}
