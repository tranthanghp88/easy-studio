@echo off
title Easy Thumbnail Studio DEV

cd /d %~dp0

echo.
echo ================================
echo   Easy Thumbnail Studio DEV
echo ================================
echo.

if not exist node_modules (
    echo Installing dependencies...
    call npm install
)

echo.
echo Starting Vite + Electron...
echo.

start cmd /k "npm run dev"
timeout /t 5 >nul
start cmd /k "npm run electron"

exit