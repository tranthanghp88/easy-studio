@echo off

cd /d %~dp0

echo Cleaning node_modules...
rmdir /s /q node_modules

echo Cleaning package-lock...
del package-lock.json

echo Reinstalling...
call npm install

pause