@echo off
setlocal EnableExtensions

REM Loads MSVC tools (rc.exe / link.exe) then runs: npx --no-install tauri %*
REM Called by scripts\tauri-cli.mjs on Windows.

set "VCVARS=%ProgramFiles(x86)%\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
if not exist "%VCVARS%" set "VCVARS=%ProgramFiles(x86)%\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat"
if not exist "%VCVARS%" set "VCVARS=%ProgramFiles(x86)%\Microsoft Visual Studio\2022\Professional\VC\Auxiliary\Build\vcvars64.bat"
if not exist "%VCVARS%" set "VCVARS=%ProgramFiles(x86)%\Microsoft Visual Studio\2022\Enterprise\VC\Auxiliary\Build\vcvars64.bat"
if not exist "%VCVARS%" set "VCVARS=%ProgramFiles%\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"

if exist "%VCVARS%" (
  call "%VCVARS%"
) else (
  echo Warning: MSVC vcvars64.bat not found. Install Visual Studio Build Tools ^(Desktop C++^).
  echo Without it, Tauri often fails embedding icons with exit code 259.
)

cd /d "%~dp0.."
set "CARGO_TARGET_DIR=%CD%\src-tauri\target"

call npx --no-install tauri %*
exit /b %ERRORLEVEL%
