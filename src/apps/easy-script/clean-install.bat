@echo off
title Easy Script Studio - Clean Install
cd /d %~dp0
echo Removing node_modules...
rmdir /s /q node_modules 2>nul
echo Removing package-lock.json...
del package-lock.json 2>nul
echo Installing dependencies...
call npm install
pause
