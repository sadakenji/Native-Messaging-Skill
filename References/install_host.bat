@echo off
setlocal

set HOST_NAME=com.tverdownloader.host
set HOST_DIR=%~dp0host
set MANIFEST_PATH=%HOST_DIR%\%HOST_NAME%.json

echo ============================================
echo  TVer Downloader - Native Host Installer
echo ============================================
echo.

set /p EXTENSION_ID=Enter Chrome extension ID:

if "%EXTENSION_ID%"=="" (
    echo Error: Extension ID is required.
    pause
    exit /b 1
)

echo.
echo Creating host manifest...

(
echo {
echo   "name": "%HOST_NAME%",
echo   "description": "TVer Downloader Native Messaging Host",
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
