@echo off
setlocal

set HOST_NAME=com.tverdownloader.host
set MANIFEST_PATH=%~dp0host\%HOST_NAME%.json

echo ============================================
echo  TVer Downloader - Native Host Uninstaller
echo ============================================
echo.

echo Removing registry entry...
reg delete "HKCU\Software\Google\Chrome\NativeMessagingHosts\%HOST_NAME%" /f 2>nul

if exist "%MANIFEST_PATH%" (
    echo Removing host manifest...
    del "%MANIFEST_PATH%"
)

echo.
echo Uninstallation complete.
echo.
pause
