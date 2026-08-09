@echo off
setlocal
REM Desktop dev with a clean MSVC + Cargo environment.
REM Prefer: npm run tauri -- dev   (wrapper loads vcvars automatically)
REM This bat remains as an explicit Windows entrypoint.

set "VCVARS=%ProgramFiles(x86)%\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
if not exist "%VCVARS%" set "VCVARS=%ProgramFiles(x86)%\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat"
if exist "%VCVARS%" (
  call "%VCVARS%" >nul
) else (
  echo Warning: MSVC vcvars64.bat not found. Install VS Build Tools C++ workload.
)

cd /d "%~dp0.."

REM Never leave a blank/space CARGO_TARGET_DIR — it breaks tauri build scripts (exit 259).
set "CARGO_TARGET_DIR=%CD%\src-tauri\target"

call npm run tauri -- dev %*
exit /b %ERRORLEVEL%
