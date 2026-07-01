@echo off
setlocal

rem ============================================================
rem  Native Messaging host uninstaller.
rem  Removes the registry entry and the generated manifest JSON.
rem  HOST_NAME must match install_host.bat.
rem ============================================================

set HOST_NAME=com.example.host
set MANIFEST_PATH=%~dp0host\%HOST_NAME%.json

echo ============================================
echo  Native Messaging host - Uninstaller
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
