@echo off
title Easy Studio Build + Push
color 0A

cd /d %~dp0

echo.
echo ==========================================
echo     EASY STUDIO BUILD + PUSH
echo ==========================================
echo.

echo Nhap version moi theo dang x.y.z
echo Vi du: 1.0.1
echo.

set /p VERSION=Version moi: 

echo.
echo Dang cap nhat package.json...
echo.

powershell -Command "(Get-Content package.json) -replace '\"version\": \".*?\"', '\"version\": \"%VERSION%\"' | Set-Content package.json"

if errorlevel 1 (
    echo [ERROR] Khong sua duoc package.json
    pause
    exit /b
)

echo.
echo Xoa build cu...
echo.

if exist dist rmdir /s /q dist
if exist release rmdir /s /q release

echo.
echo Cai dependency...
echo.

call npm install

if errorlevel 1 (
    echo [ERROR] npm install that bai
    pause
    exit /b
)

echo.
echo Build app...
echo.

call npm run dist

if errorlevel 1 (
    echo [ERROR] Build that bai
    pause
    exit /b
)

echo.
echo Push source code len GitHub...
echo.

git add .

git commit -m "update easy studio v%VERSION%"

git push

echo.
echo ==========================================
echo BUILD + PUSH THANH CONG
echo ==========================================
echo.

echo Tao release moi tai:
echo.
echo https://github.com/tranthanghp88/easy-studio/releases/new
echo.

start https://github.com/tranthanghp88/easy-studio/releases/new

pause