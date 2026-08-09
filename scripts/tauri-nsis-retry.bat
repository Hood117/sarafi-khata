@echo off
call "%~1"
cd /d C:\Users\Acc\Saraf
set CARGO_TARGET_DIR=C:\Users\Acc\Saraf\src-tauri\target
REM skip rebuild of next by temporarily no-opping beforeBuild - use already prepared resources
npx tauri build --bundles nsis --verbose --config "{\"build\":{\"beforeBuildCommand\":\"\"}}"
