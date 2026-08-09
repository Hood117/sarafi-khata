@echo off
call "%~1"
cd /d C:\Users\Acc\Saraf\src-tauri
set CARGO_TARGET_DIR=C:\Users\Acc\Saraf\src-tauri\target
set RUST_BACKTRACE=1
cargo build --release -p saraf -vv
