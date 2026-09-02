@echo off
setlocal EnableExtensions
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" || exit /b 1
set "CARGO_TARGET_DIR=E:\Saraf\Saraf\src-tauri\target"
cd /d "E:\Saraf\Saraf\src-tauri" || exit /b 1
echo CARGO_TARGET_DIR=[%CARGO_TARGET_DIR%]
cargo build --release --features custom-protocol
exit /b %ERRORLEVEL%