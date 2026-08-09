@echo off
setlocal
set "VCVARS=%ProgramFiles(x86)%\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
if exist "%VCVARS%" call "%VCVARS%" >nul
cd /d "%~dp0.."
REM Explicit target dir — never `set VAR= &&` (that stores a space and breaks cargo).
set "CARGO_TARGET_DIR=%CD%\src-tauri\target"
taskkill /F /IM makensis.exe >nul 2>&1
call npm run tauri -- build --bundles nsis
exit /b %ERRORLEVEL%
