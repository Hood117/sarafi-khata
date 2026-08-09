@echo off
REM Rebuild static sqlite3.lib for MSVC (used when cargo's bundled build fails).
setlocal
set VSDEV="C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
if not exist %VSDEV% (
  echo vcvars64.bat not found. Install VS 2022 Build Tools with C++ workload.
  exit /b 1
)

set VENDOR=%~dp0
set SRC=%USERPROFILE%\.cargo\registry\src\index.crates.io-1949cf8c6b5b557f\libsqlite3-sys-0.30.1\sqlite3
if not exist "%SRC%\sqlite3.c" (
  echo sqlite3.c not found under cargo registry. Run: cargo fetch
  echo Expected: %SRC%
  exit /b 1
)

call %VSDEV%
copy /Y "%SRC%\sqlite3.h" "%VENDOR%sqlite3.h" >nul
if exist "%SRC%\sqlite3ext.h" copy /Y "%SRC%\sqlite3ext.h" "%VENDOR%sqlite3ext.h" >nul

cl /nologo /c /O2 /MD /W0 ^
  /DSQLITE_CORE /DSQLITE_DEFAULT_FOREIGN_KEYS=1 /DSQLITE_ENABLE_API_ARMOR ^
  /DSQLITE_ENABLE_COLUMN_METADATA /DSQLITE_ENABLE_DBSTAT_VTAB /DSQLITE_ENABLE_FTS3 ^
  /DSQLITE_ENABLE_FTS3_PARENTHESIS /DSQLITE_ENABLE_FTS5 /DSQLITE_ENABLE_JSON1 ^
  /DSQLITE_ENABLE_LOAD_EXTENSION=1 /DSQLITE_ENABLE_MEMORY_MANAGEMENT /DSQLITE_ENABLE_RTREE ^
  /DSQLITE_ENABLE_STAT4 /DSQLITE_SOUNDEX /DSQLITE_THREADSAFE=1 /DSQLITE_USE_URI ^
  /DHAVE_USLEEP=1 /DHAVE_ISNAN ^
  /Fo"%VENDOR%sqlite3.obj" "%SRC%\sqlite3.c"
if errorlevel 1 exit /b 1

lib /nologo /OUT:"%VENDOR%sqlite3.lib" "%VENDOR%sqlite3.obj"
if errorlevel 1 exit /b 1
del /Q "%VENDOR%sqlite3.obj" 2>nul
echo Built %VENDOR%sqlite3.lib
endlocal
