!include nsDialogs.nsh

# Inline commands work with the Windows default script-file policy without
# changing policy, requesting elevation, or bypassing language/application controls.
# Environment variables carry paths without interpreting them as PowerShell code.
!macro PlanrailStartup ACTION
  InitPluginsDir
  File /oname=$PLUGINSDIR\planrail-login-startup.ps1 "${PROJECT_DIR}\resources\windows\login-startup.ps1"
  System::Call 'kernel32::SetEnvironmentVariableW(w "PLANRAIL_STARTUP_TARGET", w "$INSTDIR\${APP_EXECUTABLE_FILENAME}") i.r0'
  ${If} $0 == 0
    SetErrorLevel 2
    Quit
  ${EndIf}
  System::Call 'kernel32::SetEnvironmentVariableW(w "PLANRAIL_STARTUP_ACTION", w "${ACTION}") i.r0'
  ${If} $0 == 0
    SetErrorLevel 2
    Quit
  ${EndIf}
  System::Call 'kernel32::SetEnvironmentVariableW(w "PLANRAIL_STARTUP_SCRIPT", w "$PLUGINSDIR\planrail-login-startup.ps1")'
  nsExec::ExecToStack /TIMEOUT=15000 `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -Command "& ([ScriptBlock]::Create([IO.File]::ReadAllText($$env:PLANRAIL_STARTUP_SCRIPT))) -InstallerState"`
  Pop $0
  Pop $1
  System::Call 'kernel32::SetEnvironmentVariableW(w "PLANRAIL_STARTUP_TARGET", p 0)'
  System::Call 'kernel32::SetEnvironmentVariableW(w "PLANRAIL_STARTUP_ACTION", p 0)'
  ${If} $0 != 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "Windows 시작 설정을 적용하지 못했습니다. 권한과 Windows 정책을 확인해 주세요." /SD IDOK
    SetErrorLevel 2
    Quit
  ${EndIf}
!macroend

# The shared custom include can precede plugin directories and common.nsh.
# Emit functions only after builder has initialized both through customHeader.
!macro customHeader
!ifndef BUILD_UNINSTALLER
Var PlanrailStartupCheckbox
Var PlanrailStartupInitial
Var PlanrailStartupChecked
Var PlanrailStartupChoice

Function PlanrailStartupPage
  ${If} ${isUpdated}
    Abort
  ${EndIf}
  !insertmacro PlanrailStartup Read
  StrCpy $PlanrailStartupInitial $1
  ${If} $1 != "on"
  ${AndIf} $1 != "off"
  ${AndIf} $1 != "unset"
  ${AndIf} $1 != "disabled"
    SetErrorLevel 2
    Quit
  ${EndIf}
  !insertmacro MUI_HEADER_TEXT "Windows 시작 설정" "로그인 시 실행과 설치 후 즉시 실행은 별도 선택입니다."
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateCheckbox} 0 12u 100% 24u "Windows 로그인 시 Planrail 자동 실행"
  Pop $PlanrailStartupCheckbox
  StrCpy $PlanrailStartupChecked ${BST_UNCHECKED}
  ${If} $PlanrailStartupInitial == "on"
  ${OrIf} $PlanrailStartupInitial == "unset"
    StrCpy $PlanrailStartupChecked ${BST_CHECKED}
  ${EndIf}
  ${NSD_SetState} $PlanrailStartupCheckbox $PlanrailStartupChecked
  ${If} $PlanrailStartupInitial == "disabled"
    EnableWindow $PlanrailStartupCheckbox 0
    ${NSD_CreateLabel} 0 44u 100% 30u "Windows에서 사용 중지했습니다. 설치 후 트레이에서 자동 실행을 켤 수 있습니다."
    Pop $0
  ${EndIf}
  nsDialogs::Show
FunctionEnd

Function PlanrailStartupLeave
  ${NSD_GetState} $PlanrailStartupCheckbox $0
  StrCpy $PlanrailStartupChoice "Preserve"
  ${If} $PlanrailStartupInitial == "disabled"
    StrCpy $PlanrailStartupChoice "Preserve"
  ${ElseIf} $0 == ${BST_CHECKED}
    ${If} $PlanrailStartupInitial != "on"
      StrCpy $PlanrailStartupChoice "On"
    ${EndIf}
  ${ElseIf} $PlanrailStartupInitial != "disabled"
    StrCpy $PlanrailStartupChoice "Off"
  ${EndIf}
FunctionEnd
!endif
!macroend

# Keep the standard directory page: builder's sanitizer changes custom paths.
!macro customPageAfterChangeDir
  !insertmacro MUI_PAGE_DIRECTORY
  Page custom PlanrailStartupPage PlanrailStartupLeave
!macroend

!macro customInstall
  # Silent/updated preserve state, including an unset 0.8.0 installation.
  ${If} ${Silent}
    !insertmacro PlanrailStartup Preserve
  ${ElseIf} ${isUpdated}
    !insertmacro PlanrailStartup Preserve
  ${ElseIf} $PlanrailStartupChoice == "On"
    !insertmacro PlanrailStartup On
  ${ElseIf} $PlanrailStartupChoice == "Off"
    !insertmacro PlanrailStartup Off
  ${Else}
    !insertmacro PlanrailStartup Preserve
  ${EndIf}
!macroend

!macro customUnInstall
  ${IfNot} ${isUpdated}
    !insertmacro PlanrailStartup Remove
  ${EndIf}
!macroend

!macro customCheckAppRunning
  # A pwsh parent exports incompatible modules to Windows PowerShell. Clear only
  # module discovery for this installer and its legacy-uninstaller children.
  ReadEnvStr $0 "PSModulePath"
  ClearErrors
  ${If} $0 != ""
    System::Call 'kernel32::SetEnvironmentVariableW(w "PSModulePath", p 0) i.r0'
    ${If} $0 == 0
      SetErrorLevel 2
      Quit
    ${EndIf}
  ${EndIf}
  InitPluginsDir
  File /oname=$PLUGINSDIR\planrail-install-gate.ps1 "${PROJECT_DIR}\resources\windows\install-gate.ps1"
  System::Call 'kernel32::SetEnvironmentVariableW(w "PLANRAIL_INSTALL_TARGET", w "$INSTDIR\${APP_EXECUTABLE_FILENAME}") i.r0'
  ${If} $0 == 0
    SetErrorLevel 2
    Quit
  ${EndIf}
  # Standalone uninstall and update uninstalls only wait. They never request exit.
  System::Call 'kernel32::SetEnvironmentVariableW(w "PLANRAIL_INSTALL_MANUAL", w "0") i.r0'
  !ifndef BUILD_UNINSTALLER
    ${IfNot} ${Silent}
    ${AndIfNot} ${isUpdated}
      System::Call 'kernel32::SetEnvironmentVariableW(w "PLANRAIL_INSTALL_MANUAL", w "1") i.r0'
    ${EndIf}
  !endif
  ${If} $0 == 0
    SetErrorLevel 2
    Quit
  ${EndIf}
  System::Call 'kernel32::SetEnvironmentVariableW(w "PLANRAIL_INSTALL_SCRIPT", w "$PLUGINSDIR\planrail-install-gate.ps1")'
  nsExec::ExecToStack /TIMEOUT=55000 `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -Command "& ([ScriptBlock]::Create([IO.File]::ReadAllText($$env:PLANRAIL_INSTALL_SCRIPT)))"`
  Pop $0
  Pop $1
  System::Call 'kernel32::SetEnvironmentVariableW(w "PLANRAIL_INSTALL_TARGET", p 0)'
  System::Call 'kernel32::SetEnvironmentVariableW(w "PLANRAIL_INSTALL_MANUAL", p 0)'
  ${If} $0 != 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "Planrail 종료를 안전하게 확인하지 못했습니다. 앱을 종료한 뒤 설치 프로그램을 다시 실행해 주세요." /SD IDOK
    SetErrorLevel 2
    Quit
  ${EndIf}
!macroend
