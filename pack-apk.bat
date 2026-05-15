@echo off
cd /d "%~dp0"

echo.
echo ============================================
echo   Lingxi Accounting - Android APK Build
echo ============================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found in PATH!
    echo Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

echo [1/3] Building web frontend...
call npm run build:vite
if %errorlevel% neq 0 (
    echo [ERROR] Vite build failed!
    pause
    exit /b 1
)

echo.
echo [2/3] Syncing to Android platform...
call npx cap sync android
if %errorlevel% neq 0 (
    echo [ERROR] Capacitor sync failed!
    pause
    exit /b 1
)

echo.
echo [3/3] Building APK via Gradle...
node scripts\pack-apk.js
if %errorlevel% neq 0 (
    echo [ERROR] APK build failed! Check Android SDK installation.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   BUILD SUCCESS
echo   Output: release\Lingxi-Accounting-v1.0.0-android-debug.apk
echo ============================================
echo.
pause
