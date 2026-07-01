@echo off
setlocal

rem ============================================================
rem  Native Messaging host installer (Node.js host).
rem  Generates the host manifest JSON and registers it for Chrome.
rem  Run install_host.bat and paste the Chrome extension ID when asked.
rem ============================================================

rem --- Edit these two values for your project -----------------
set HOST_NAME=com.example.host
set HOST_DESCRIPTION=Example Native Messaging Host
rem ------------------------------------------------------------

set HOST_DIR=%~dp0host
set MANIFEST_PATH=%HOST_DIR%\%HOST_NAME%.json

echo ============================================
echo  %HOST_DESCRIPTION% - Installer
echo ============================================
echo.

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo Error: Node.js was not found in PATH. Install Node.js first.
    pause
    exit /b 1
)

rem Auto-detect the ID from extension_id.txt (written by gen_extension_key.js).
rem Fall back to manual input when the file is absent.
set ID_FILE=%HOST_DIR%\extension_id.txt
if exist "%ID_FILE%" (
    for /f "usebackq delims=" %%i in ("%ID_FILE%") do set EXTENSION_ID=%%i
    goto have_id
)

set /p EXTENSION_ID=Enter Chrome extension ID:

:have_id
if "%EXTENSION_ID%"=="" (
    echo Error: Extension ID is required.
    pause
    exit /b 1
)

echo Using extension ID: %EXTENSION_ID%

echo.
echo Creating host manifest...

(
echo {
echo   "name": "%HOST_NAME%",
echo   "description": "%HOST_DESCRIPTION%",
echo   "path": "%HOST_DIR:\=\\%\\host.bat",
echo   "type": "stdio",
echo   "allowed_origins": [
echo     "chrome-extension://%EXTENSION_ID%/"
echo   ]
echo }
) > "%MANIFEST_PATH%"

echo Manifest created: %MANIFEST_PATH%

echo.
echo Registering in registry...

reg add "HKCU\Software\Google\Chrome\NativeMessagingHosts\%HOST_NAME%" /ve /t REG_SZ /d "%MANIFEST_PATH%" /f

if %ERRORLEVEL% equ 0 (
    echo.
    echo Installation complete.
) else (
    echo.
    echo Error: Registry registration failed.
)

echo.
pause
