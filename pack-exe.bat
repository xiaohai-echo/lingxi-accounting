@echo off
cd /d "%~dp0"

echo.
echo ============================================
echo   Lingxi Accounting - Windows EXE Build
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
echo [2/3] Building Electron main process...
call npm run build:electron
if %errorlevel% neq 0 (
    echo [ERROR] TypeScript build failed!
    pause
    exit /b 1
)

echo.
echo [3/3] Packing app.asar...
node scripts\pack-exe.js
if %errorlevel% neq 0 (
    echo [ERROR] ASAR pack failed!
    pause
    exit /b 1
)

echo.
echo ============================================
echo   BUILD SUCCESS
echo   Output: release\win-unpacked\
echo   Run: release\win-unpacked\Lingxi-Accounting.exe
echo ============================================
echo.
pause
