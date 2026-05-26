@echo off
title Easy Studio - Git Init + Push
color 0A

echo ==========================================
echo        EASY STUDIO GITHUB PUSH
echo ==========================================
echo.

REM ==============================
REM KIEM TRA .gitignore
REM ==============================

if not exist ".gitignore" (
    echo [WARNING] Khong tim thay file .gitignore
    echo Nen tao .gitignore truoc khi push.
    echo.
    pause
)

REM ==============================
REM XOA GIT CU NEU CO
REM ==============================

if exist ".git" (
    echo Dang xoa Git cu...
    rmdir /s /q .git
)

echo.
echo ==========================================
echo Nhap link GitHub repo
echo Vi du:
echo https://github.com/USERNAME/REPO.git
echo ==========================================
echo.

set /p REPO_URL=Nhap repo URL: https://github.com/tranthanghp88/easy-studio.git

echo.
echo ==========================================
echo Khoi tao Git moi...
echo ==========================================
echo.

git init

git add .

git commit -m "Initial Easy Studio source"

git branch -M main

git remote add origin %REPO_URL%

echo.
echo ==========================================
echo Dang push len GitHub...
echo ==========================================
echo.

git push -u origin main --force

echo.
echo ==========================================
echo DONE!
echo ==========================================
echo.

pause