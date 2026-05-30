@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Easy Studio Dev

echo ========================================
echo        EASY STUDIO - DEV START
echo ========================================
echo.

if not exist node_modules (
  echo Chua co node_modules. Dang cai dependency...
  npm install
  if errorlevel 1 (
    echo.
    echo Loi npm install. Kiem tra Node.js / internet roi chay lai.
    pause
    exit /b 1
  )
)

echo Dang khoi dong Easy Studio...
echo.
npm run dev
pause
