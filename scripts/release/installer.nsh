# Use the standard directory page without electron-builder's instFilesPre
# sanitizer: it appends the new product name to legacy/custom directories.
# .onInit already resolves an existing installation (or the per-user default).
!macro customPageAfterChangeDir
  !insertmacro MUI_PAGE_DIRECTORY
!macroend

# Override builder26.18.0's running-app check, including --updated installs.
# Environment transport avoids interpreting quotes in custom installation paths.
# Missing process paths, blocked CIM/PowerShell, and timeout all abort closed.
!macro customCheckAppRunning
  System::Call 'kernel32::SetEnvironmentVariableW(w "PLANRAIL_INSTALL_TARGET", w "$INSTDIR") i.r0'
  ${If} $0 == 0
    SetErrorLevel 2
    Quit
  ${EndIf}
  nsExec::ExecToStack /TIMEOUT=35000 `"$PowerShellPath" -NoLogo -NoProfile -NonInteractive -Command "$$ErrorActionPreference='Stop'; try { $$target=[IO.Path]::Combine($$env:PLANRAIL_INSTALL_TARGET,'${APP_EXECUTABLE_FILENAME}'); $$deadline=[DateTime]::UtcNow.AddSeconds(30); do { $$running=$$false; $$items=@(Get-CimInstance Win32_Process -Filter \"Name = '${APP_EXECUTABLE_FILENAME}'\"); foreach($$p in $$items) { if(-not $$p.ExecutablePath) { exit 2 }; if([String]::Equals($$p.ExecutablePath,$$target,[StringComparison]::OrdinalIgnoreCase)) { $$running=$$true } }; if(-not $$running) { exit 0 }; Start-Sleep -Milliseconds 250 } while([DateTime]::UtcNow -lt $$deadline); exit 2 } catch { exit 2 }"`
  Pop $0
  Pop $1
  System::Call 'kernel32::SetEnvironmentVariableW(w "PLANRAIL_INSTALL_TARGET", p 0)'
  ${If} $0 != 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "Planrail could not confirm a safe shutdown. Close Planrail and run this installer again." /SD IDOK
    SetErrorLevel 2
    Quit
  ${EndIf}
!macroend
