# Use the standard directory page without electron-builder's instFilesPre
# sanitizer: it appends the new product name to legacy/custom directories.
# .onInit already resolves an existing installation (or the per-user default).
!macro customPageAfterChangeDir
  !insertmacro MUI_PAGE_DIRECTORY
!macroend
