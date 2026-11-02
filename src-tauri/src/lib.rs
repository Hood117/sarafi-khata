//! Saraf desktop shell.
//!
//! Default (ADR-042): Vite React SPA + rusqlite (no Node sidecar).
//! Legacy Next sidecar: set `SARAF_LEGACY=1` and use `tauri.legacy.conf.json`.

mod backup;
mod commands;
mod db;
mod error;
mod fingerprint;
mod ledger;
mod printer;
mod license_config;
mod migrate;
mod state;
mod util;

use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager, RunEvent, Url};

use crate::error::AppError;
use crate::fingerprint::FingerprintService;
use crate::state::AppState;

struct SidecarState(Mutex<Option<Child>>);

fn legacy_sidecar_mode() -> bool {
  std::env::var("SARAF_LEGACY")
    .map(|v| matches!(v.as_str(), "1" | "true" | "yes"))
    .unwrap_or(false)
}

fn find_free_port() -> Result<u16, String> {
  let listener =
    TcpListener::bind("127.0.0.1:0").map_err(|e| format!("bind free port: {e}"))?;
  let port = listener
    .local_addr()
    .map_err(|e| format!("local_addr: {e}"))?
    .port();
  Ok(port)
}

fn wait_for_http(port: u16, timeout: Duration) -> Result<(), String> {
  let deadline = Instant::now() + timeout;
  let addr = format!("127.0.0.1:{port}");

  while Instant::now() < deadline {
    if let Ok(mut stream) = std::net::TcpStream::connect(&addr) {
      let _ = stream.set_read_timeout(Some(Duration::from_millis(800)));
      let _ = stream.set_write_timeout(Some(Duration::from_millis(800)));
      let request = format!(
        "GET /login HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n"
      );
      if stream.write_all(request.as_bytes()).is_ok() {
        let mut buf = [0u8; 64];
        if let Ok(n) = stream.read(&mut buf) {
          let head = String::from_utf8_lossy(&buf[..n]);
          if head.starts_with("HTTP/") {
            return Ok(());
          }
        }
      }
    }
    thread::sleep(Duration::from_millis(250));
  }

  Err(format!(
    "Next.js sidecar did not become ready on http://127.0.0.1:{port}"
  ))
}

fn resolve_node_bin() -> PathBuf {
  if let Ok(from_env) = std::env::var("SARAF_NODE_PATH") {
    return PathBuf::from(from_env);
  }
  PathBuf::from("node")
}

fn find_archive(app: &AppHandle) -> Result<PathBuf, String> {
  let mut candidates: Vec<PathBuf> = Vec::new();

  if let Ok(resource_dir) = app.path().resource_dir() {
    candidates.push(resource_dir.join("next-server.tar.gz"));
    candidates.push(resource_dir.join("resources").join("next-server.tar.gz"));
  }

  if let Ok(exe) = std::env::current_exe() {
    if let Some(exe_dir) = exe.parent() {
      candidates.push(exe_dir.join("resources").join("next-server.tar.gz"));
      candidates.push(exe_dir.join("next-server.tar.gz"));
    }
  }

  if let Ok(cwd) = std::env::current_dir() {
    candidates.push(
      cwd
        .join("src-tauri")
        .join("resources")
        .join("next-server.tar.gz"),
    );
  }

  for candidate in candidates {
    if candidate.is_file() {
      return Ok(candidate);
    }
  }

  Err(
    "Bundled next-server.tar.gz not found. Reinstall Saraf or run build:desktop:prepare."
      .into(),
  )
}

fn ensure_extracted_server(app: &AppHandle) -> Result<PathBuf, String> {
  let data_dir = app
    .path()
    .app_data_dir()
    .map_err(|e| format!("app_data_dir: {e}"))?;
  let extract_dir = data_dir.join("next-server");
  let marker = extract_dir.join(".bundle-stamp");
  let archive = find_archive(app)?;

  let archive_meta = fs::metadata(&archive).map_err(|e| format!("archive meta: {e}"))?;
  let archive_len = archive_meta.len();
  let stamp = format!("{archive_len}");

  let needs_extract = match fs::read_to_string(&marker) {
    Ok(existing) => {
      existing.trim() != stamp
        || !extract_dir.join("server.js").is_file()
        || !extract_dir.join("saraf-template.db").is_file()
    }
    Err(_) => true,
  };

  if needs_extract {
    if extract_dir.exists() {
      fs::remove_dir_all(&extract_dir)
        .map_err(|e| format!("clear extract dir: {e}"))?;
    }
    fs::create_dir_all(&extract_dir).map_err(|e| format!("create extract dir: {e}"))?;

    let status = Command::new("tar")
      .args([
        "-xzf",
        archive
          .to_str()
          .ok_or_else(|| "archive path encoding".to_string())?,
        "-C",
        extract_dir
          .to_str()
          .ok_or_else(|| "extract path encoding".to_string())?,
      ])
      .status()
      .map_err(|e| format!("failed to run tar extract: {e}"))?;

    if !status.success() {
      return Err(format!("tar extract failed with status {status}"));
    }

    fs::write(&marker, &stamp).map_err(|e| format!("write stamp: {e}"))?;
  }

  if !extract_dir.join("server.js").is_file() {
    return Err(format!(
      "server.js missing after extract at {}",
      extract_dir.display()
    ));
  }

  Ok(extract_dir)
}

fn resolve_server_dir(app: &AppHandle) -> Result<PathBuf, String> {
  ensure_extracted_server(app)
}

fn db_path_from_url(database_url: &str) -> Result<PathBuf, String> {
  let raw = database_url
    .strip_prefix("file:")
    .ok_or_else(|| "DATABASE_URL must start with file:".to_string())?;
  Ok(PathBuf::from(raw.replace('/', "\\")))
}

fn app_data_db_path(app: &AppHandle) -> Result<PathBuf, String> {
  let data_dir = app
    .path()
    .app_data_dir()
    .map_err(|e| format!("app_data_dir: {e}"))?;
  fs::create_dir_all(&data_dir).map_err(|e| format!("create data dir: {e}"))?;
  Ok(data_dir.join("saraf.db"))
}

fn app_data_db_url(app: &AppHandle) -> Result<String, String> {
  let db_path = app_data_db_path(app)?;
  let normalized = db_path.to_string_lossy().replace('\\', "/");
  Ok(format!("file:{normalized}"))
}

fn ensure_database(app: &AppHandle, server_dir: &Path) -> Result<String, String> {
  let database_url = app_data_db_url(app)?;
  let db_path = db_path_from_url(&database_url)?;
  let template = server_dir.join("saraf-template.db");

  let needs_init = match fs::metadata(&db_path) {
    Ok(meta) => meta.len() < 50_000,
    Err(_) => true,
  };

  if needs_init {
    if !template.is_file() {
      return Err(format!(
        "Missing seeded template DB at {}. Rebuild the desktop package.",
        template.display()
      ));
    }

    if let Some(parent) = db_path.parent() {
      fs::create_dir_all(parent).map_err(|e| format!("create db dir: {e}"))?;
    }

    for suffix in ["-wal", "-shm", "-journal"] {
      let extra = PathBuf::from(format!("{}{}", db_path.to_string_lossy(), suffix));
      let _ = fs::remove_file(extra);
    }

    fs::copy(&template, &db_path).map_err(|e| format!("copy template db: {e}"))?;
  }

  Ok(database_url)
}

fn open_sidecar_log(app: &AppHandle) -> Result<File, String> {
  let data_dir = app
    .path()
    .app_data_dir()
    .map_err(|e| format!("app_data_dir: {e}"))?;
  fs::create_dir_all(&data_dir).map_err(|e| format!("create data dir: {e}"))?;
  OpenOptions::new()
    .create(true)
    .append(true)
    .open(data_dir.join("sidecar.log"))
    .map_err(|e| format!("open sidecar.log: {e}"))
}

fn spawn_sidecar(app: &AppHandle, port: u16) -> Result<Child, String> {
  let server_dir = resolve_server_dir(app)?;
  let database_url = ensure_database(app, &server_dir)?;
  let node = resolve_node_bin();
  let log_file = open_sidecar_log(app)?;
  let log_err = log_file
    .try_clone()
    .map_err(|e| format!("clone sidecar.log: {e}"))?;

  {
    let mut header = open_sidecar_log(app)?;
    let _ = writeln!(
      header,
      "\n==== sidecar start {:?} port={} dir={} ====",
      std::time::SystemTime::now(),
      port,
      server_dir.display()
    );
  }

  let mut command = Command::new(&node);
  command
    .arg("server.js")
    .current_dir(&server_dir)
    .env("NODE_ENV", "production")
    .env("HOSTNAME", "127.0.0.1")
    .env("PORT", port.to_string())
    .env("DATABASE_URL", database_url)
    .stdin(Stdio::null())
    .stdout(Stdio::from(log_file))
    .stderr(Stdio::from(log_err));

  #[cfg(windows)]
  {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    command.creation_flags(CREATE_NO_WINDOW);
  }

  command
    .spawn()
    .map_err(|e| format!("failed to start Node sidecar ({node:?}): {e}"))
}

fn stop_sidecar(state: &SidecarState) {
  if let Ok(mut guard) = state.0.lock() {
    if let Some(mut child) = guard.take() {
      let _ = child.kill();
      let _ = child.wait();
    }
  }
}

fn navigate_main_window(app: &AppHandle, port: u16) -> Result<(), String> {
  let url = format!("http://127.0.0.1:{port}/login");
  let parsed = Url::parse(&url).map_err(|e| e.to_string())?;

  if let Some(window) = app.get_webview_window("main") {
    if window.navigate(parsed.clone()).is_err() {
      let script = format!("window.location.replace({url:?})");
      window.eval(&script).map_err(|e| e.to_string())?;
    }
    let _ = window.show();
    let _ = window.set_focus();
  }

  Ok(())
}

fn migration_dir_candidates(app: &AppHandle) -> Vec<PathBuf> {
  let mut dirs = Vec::new();
  if let Ok(resource_dir) = app.path().resource_dir() {
    dirs.push(resource_dir.join("migrations"));
    dirs.push(resource_dir.join("resources").join("migrations"));
  }
  if let Ok(cwd) = std::env::current_dir() {
    dirs.push(cwd.join("src-tauri").join("migrations"));
    dirs.push(cwd.join("migrations"));
  }
  dirs
}

fn bootstrap_native_db(app: &AppHandle) -> Result<AppState, String> {
  let db_path = app_data_db_path(app)?;
  if let Some(stamp) = backup::apply_pending_restore_if_any(&db_path).map_err(|e| e.to_string())? {
    log::info!("applied pending database restore from backup {stamp}");
  }
  let conn = db::open_database(&db_path).map_err(|e| e.to_string())?;
  let migrations = migrate::migrations_dir(&migration_dir_candidates(app))
    .map_err(|e| e.to_string())?;
  migrate::apply_pending_migrations(&conn, &migrations).map_err(|e| e.to_string())?;
  migrate::ensure_schema_compat(&conn).map_err(|e| e.to_string())?;
  // Re-bind the previous login token into the restored Session table (keep user signed in).
  if let Err(e) = commands::auth::apply_restore_session_bridge(&conn, &db_path) {
    log::warn!("restore session bridge failed: {e}");
  }
  Ok(AppState::with_connection(conn, db_path))
}

/// Close the live SQLite handle, apply a staged restore, then reopen.
/// Used so Restore does not kill the window (`request_restart` exits under `tauri dev`).
pub(crate) fn reopen_native_db_after_restore(app: &AppHandle, state: &AppState) -> Result<Option<String>, AppError> {
  {
    let mut guard = state.db.lock();
    let _ = guard.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
    let dummy = rusqlite::Connection::open_in_memory()
      .map_err(|e| AppError::Db(format!("close live db: {e}")))?;
    let old = std::mem::replace(&mut *guard, dummy);
    drop(old);
  }

  let stamp = backup::apply_pending_restore_if_any(&state.db_path)?;
  if let Some(ref applied) = stamp {
    log::info!("applied in-place database restore from backup {applied}");
  }

  let conn = db::open_database(&state.db_path)?;
  let migrations = migrate::migrations_dir(&migration_dir_candidates(app))?;
  migrate::apply_pending_migrations(&conn, &migrations)?;
  migrate::ensure_schema_compat(&conn)?;
  if let Err(e) = commands::auth::apply_restore_session_bridge(&conn, &state.db_path) {
    log::warn!("restore session bridge failed: {e}");
  }
  *state.db.lock() = conn;
  Ok(stamp)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let sidecar = SidecarState(Mutex::new(None));
  let use_legacy_sidecar = legacy_sidecar_mode();

  tauri::Builder::default()
    .manage(sidecar)
    .invoke_handler(tauri::generate_handler![
      commands::ping,
      commands::get_fingerprint_device_status,
      commands::capture_fingerprint,
      commands::enroll_fingerprint,
      commands::enroll_user_fingerprint,
      commands::clear_user_fingerprint,
      commands::identify_fingerprint,
      commands::verify_hawala_collector_fingerprint,
      commands::list_printers,
      commands::print_plain_text,
      commands::get_app_info,
      commands::save_text_export,
      commands::save_bytes_export,
      commands::print_webview,
      commands::open_external_url,
      commands::get_license_status,
      commands::activate_license,
      commands::bypass_license_dev,
      commands::clear_license_dev,
      commands::login,
      commands::login_with_fingerprint,
      commands::logout,
      commands::current_user,
      commands::authorize::bind_session,
      commands::list_customers_page,
      commands::get_customer,
      commands::get_previous_customer,
      commands::get_customer_balances,
      commands::get_customers_balances_batch,
      commands::create_customer,
      commands::update_customer,
      commands::archive_customer,
      commands::restore_customer,
      commands::list_currencies_page,
      commands::create_currency,
      commands::update_currency,
      commands::list_desk_screens,
      commands::list_users,
      commands::create_user,
      commands::update_user,
      commands::delete_user,
      commands::reset_user_password,
      commands::get_admin_auth_pin_status,
      commands::verify_admin_password,
      commands::verify_authorization_pin,
      commands::set_admin_auth_pin,
      commands::reset_auth_pin_with_admin_password,
      commands::list_wallets_page,
      commands::list_transactions_page,
      commands::preview_display_ref,
      commands::list_customer_ledger,
      commands::get_transaction_detail,
      commands::post_transaction,
      commands::deposit_funds,
      commands::withdraw_funds,
      commands::customer_add_money,
      commands::customer_take_money,
      commands::transfer_funds,
      commands::soft_delete_movement,
      commands::get_previous_movement,
      commands::get_movement_for_edit,
      commands::get_cash_balances,
      commands::list_debtors_creditors,
      commands::get_dashboard_snapshot,
      commands::trading::ops::trade_buy,
      commands::trading::ops::trade_sell,
      commands::trading::ops::get_trade,
      commands::trading::ops::update_trade,
      commands::trading::ops::archive_trade,
      commands::trading::queries::list_trading_inventory,
      commands::trading::queries::list_trading_trades,
      commands::trading::queries::get_trading_dashboard,
      commands::list_latest_exchange_rates,
      commands::get_market_rates_config,
      commands::get_cached_market_rates,
      commands::save_market_rates_cache,
      commands::list_hawala_page,
      commands::list_hawala_desk,
      commands::get_hawala_commission_tracking,
      commands::get_hawala,
      commands::set_hawala_status,
      commands::archive_hawala,
      commands::restore_hawala,
      commands::update_hawala_meta,
      commands::get_hawala_customer_context,
      commands::get_partner_hawala_stats,
      commands::next_hawala_reference,
      commands::exchange_funds,
      commands::get_exchange_pnl_summary,
      commands::get_exchange_deal_detail,
      commands::get_previous_exchange_deal,
      commands::list_partners,
      commands::list_partners_page,
      commands::get_partner,
      commands::get_partner_commission_summary,
      commands::settle_partner_commission,
      commands::list_partner_settlements,
      commands::delete_partner_settlement,
      commands::create_partner,
      commands::create_partner_from_customer,
      commands::update_partner,
      commands::archive_partner,
      commands::send_hawala,
      commands::receive_hawala,
      commands::complete_receive_hawala,
      commands::create_db_backup,
      commands::list_db_backups,
      commands::restore_db_backup,
      commands::pick_backup_file,
      commands::validate_backup_file,
      commands::restore_db_backup_from_file,
      commands::reset_business_data,
      commands::get_app_locale,
      commands::set_app_locale,
      commands::get_business_name,
      commands::set_business_name,
      commands::get_ui_text_prefs,
      commands::set_ui_text_prefs,
      commands::get_owner_capital_snapshot,
      commands::post_owner_capital_move,
      commands::list_owner_capital_events,
      commands::list_expense_categories,
      commands::post_expense,
      commands::list_expenses,
      commands::get_expense_summary,
      commands::list_account_orders,
      commands::get_account_order,
      commands::create_account_order,
      commands::update_account_order,
      commands::archive_account_order,
      commands::upsert_account_order_recipient,
      commands::set_account_order_recipient_status,
      commands::complete_account_order_recipient,
      commands::delete_account_order_recipient,
      commands::list_employees,
      commands::upsert_employee,
      commands::archive_employee,
      commands::pay_employee_salary,
      commands::list_employee_salary_payments,
      commands::delete_employee_salary_payment,
      commands::get_business_position_report,
      commands::get_currency_ownership_report,
      commands::get_period_summary_report,
      commands::get_profit_loss_report,
      commands::get_cash_by_currency_report,
      commands::get_customer_balance_report,
      commands::get_hawala_status_report,
      commands::get_trading_performance_report,
      commands::get_partner_balance_report,
      commands::get_partner_sarafi_report,
      commands::get_reports_overview,
      commands::get_cash_flow_report,
      commands::get_movement_sum_report,
      commands::get_exchange_period_report,
      commands::get_customer_statement_report,
      commands::get_transactions_report,
      commands::get_daily_report,
      commands::get_monthly_report,
      commands::transfer_cash_between_vaults,
      commands::get_daybook_snapshot,
      commands::list_daybook_journal,
      commands::open_business_day,
      commands::close_business_day,
      commands::list_business_days,
      commands::get_daybook_dashboard_widget,
      commands::get_vault_dashboard,
      commands::upsert_vault,
      commands::archive_vault,
      commands::get_vault_detail,
      commands::transfer_between_vaults,
      commands::post_main_vault_cash_move,
      commands::list_vault_movements,
      commands::reconcile_vault,
      commands::list_currency_denominations,
      commands::list_users_lite,
      commands::list_vault_audit,
      commands::update_vault_movement,
      commands::delete_vault_movement,
    ])
    .setup(move |app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      let state = bootstrap_native_db(app.handle()).map_err(|e| {
        format!("native SQLite bootstrap failed: {e}")
      })?;
      app.manage(state);
      app.manage(FingerprintService::new());

      // Opt-in legacy path only: Node Next sidecar (~250MB installer).
      if use_legacy_sidecar {
        let handle = app.handle().clone();
        let port = find_free_port().map_err(|e| e.to_string())?;
        let child = spawn_sidecar(&handle, port).map_err(|e| e.to_string())?;
        {
          let state = app.state::<SidecarState>();
          *state.0.lock().map_err(|e| e.to_string())? = Some(child);
        }
        wait_for_http(port, Duration::from_secs(90)).map_err(|e| {
          format!(
            "{e}. See sidecar.log in the app data folder for Node errors."
          )
        })?;
        navigate_main_window(&handle, port)?;
      }

      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app_handle, event| {
      if let RunEvent::Exit = event {
        let state = app_handle.state::<SidecarState>();
        stop_sidecar(&*state);
      }
    });
}

#[allow(dead_code)]
fn _path_marker(_: &Path) {}
