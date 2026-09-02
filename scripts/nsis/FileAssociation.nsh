; Vendored from tauri-bundler (file association helper macros).
!macro APP_ASSOCIATE EXT FILECLASS DESCRIPTION ICON COMMANDTEXT COMMAND
 ReadRegStr $R0 SHELL_CONTEXT "Software\Classes\.${EXT}" ""
 WriteRegStr SHELL_CONTEXT "Software\Classes\.${EXT}" "${FILECLASS}_backup" "$R0"
 WriteRegStr SHELL_CONTEXT "Software\Classes\.${EXT}" "" "${FILECLASS}"
 WriteRegStr SHELL_CONTEXT "Software\Classes\${FILECLASS}" "" `${DESCRIPTION}`
 WriteRegStr SHELL_CONTEXT "Software\Classes\${FILECLASS}\DefaultIcon" "" `${ICON}`
 WriteRegStr SHELL_CONTEXT "Software\Classes\${FILECLASS}\shell" "" "open"
 WriteRegStr SHELL_CONTEXT "Software\Classes\${FILECLASS}\shell\open" "" `${COMMANDTEXT}`
 WriteRegStr SHELL_CONTEXT "Software\Classes\${FILECLASS}\shell\open\command" "" `${COMMAND}`
!macroend

!macro UPDATEFILEASSOC
 System::Call "shell32::SHChangeNotify(i,i,i,i) (0x08000000, 0x1000, 0, 0)"
!macroend
