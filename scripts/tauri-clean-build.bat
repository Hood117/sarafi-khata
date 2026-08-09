@echo off
call "%~1"
cd /d C:\Users\Acc\Saraf\src-tauri
set CARGO_TARGET_DIR=C:\Users\Acc\Saraf\src-tauri\target
cargo clean -p saraf
cd /d C:\Users\Acc\Saraf
npx tauri build --no-bundle --config "{\"build\":{\"beforeBuildCommand\":\"\"}}"
