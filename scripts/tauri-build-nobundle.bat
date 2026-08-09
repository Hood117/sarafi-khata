@echo off
call "%~1"
cd /d C:\Users\Acc\Saraf
set CARGO_TARGET_DIR=C:\Users\Acc\Saraf\src-tauri\target
npx tauri build --verbose --no-bundle 2>&1
