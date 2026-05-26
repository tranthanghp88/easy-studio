@echo off
cd /d %~dp0
echo ======================================
echo EASY VOICE STUDIO - DEV MODE
echo ======================================
echo.
echo Installing dependencies if needed...
call npm install
echo.
echo Starting app...
call npm run dev
pause
