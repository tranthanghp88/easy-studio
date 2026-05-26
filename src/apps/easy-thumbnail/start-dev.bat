@echo off
title Easy Thumbnail Studio V7.1 Final Clean
cd /d %~dp0

echo.
echo ================================
echo   Easy Thumbnail Studio V7.1 Final Clean
echo ================================
echo.

if not exist node_modules (
    echo Installing dependencies...
    call npm install
)

echo.
echo Starting app...
echo.

call npm run start
pause
