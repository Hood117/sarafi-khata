# Vendored SQLite (Windows MSVC)

Static `sqlite3.lib` + headers used by `rusqlite` (see `src-tauri/.cargo/config.toml`).

**Why:** Compiling `sqlite3.c` inside Cargo’s `libsqlite3-sys` build script fails on some Windows setups with exit code 259. Linking a prebuilt static lib avoids that.

**Rebuild:** run `build.bat` from this folder (requires VS 2022 Build Tools + `cargo fetch` so the amalgamation exists in the cargo registry).

Do not commit `*.obj` intermediates.
