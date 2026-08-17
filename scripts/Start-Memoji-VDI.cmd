@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "REPORT=%~dp0Memoji-launch-diagnostics.txt"
set "WEBVIEW_CLIENT={F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
set "WEBVIEW_INSTALLER=%~dp0webview2\MicrosoftEdgeWebView2RuntimeInstallerX64.exe"

>"%REPORT%" echo Memoji Windows VDI launch diagnostics
>>"%REPORT%" echo Started: %DATE% %TIME%
>>"%REPORT%" echo Folder: %CD%
>>"%REPORT%" ver
>>"%REPORT%" whoami

if not exist "%~dp0Memoji.exe" goto :missing_app
if not exist "%~dp0ai\runtime\lib\litert-lm.dll" goto :missing_runtime
if not exist "%~dp0ai\models\gemma4-e2b\gemma-4-E2B-it.litertlm" goto :missing_model

set "WEBVIEW_FOUND="
reg query "HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\%WEBVIEW_CLIENT%" /v pv >>"%REPORT%" 2>&1 && set "WEBVIEW_FOUND=1"
reg query "HKCU\Software\Microsoft\EdgeUpdate\Clients\%WEBVIEW_CLIENT%" /v pv >>"%REPORT%" 2>&1 && set "WEBVIEW_FOUND=1"

if defined WEBVIEW_FOUND goto :launch
>>"%REPORT%" echo WebView2 Runtime not found. Installing the bundled offline runtime.
if not exist "%WEBVIEW_INSTALLER%" goto :missing_webview_installer
start "" /wait "%WEBVIEW_INSTALLER%" /silent /install
set "INSTALL_EXIT=%ERRORLEVEL%"
>>"%REPORT%" echo WebView2 installer exit code: %INSTALL_EXIT%
if not "%INSTALL_EXIT%"=="0" if not "%INSTALL_EXIT%"=="3010" goto :webview_install_failed

:launch
>>"%REPORT%" echo Launching Memoji.exe
set "RUST_BACKTRACE=1"
start "" /wait "%~dp0Memoji.exe"
set "APP_EXIT=%ERRORLEVEL%"
>>"%REPORT%" echo Memoji exit code: %APP_EXIT%
if "%APP_EXIT%"=="0" exit /b 0
goto :show_failure

:missing_app
>>"%REPORT%" echo ERROR: Memoji.exe is missing.
goto :show_failure

:missing_runtime
>>"%REPORT%" echo ERROR: ai\runtime\lib\litert-lm.dll is missing.
goto :show_failure

:missing_model
>>"%REPORT%" echo ERROR: Gemma E2B model is missing.
goto :show_failure

:missing_webview_installer
>>"%REPORT%" echo ERROR: The bundled WebView2 offline installer is missing.
goto :show_failure

:webview_install_failed
>>"%REPORT%" echo ERROR: WebView2 installation failed. Check VDI EDR and application-control policy.

:show_failure
start "" notepad.exe "%REPORT%"
exit /b 1
