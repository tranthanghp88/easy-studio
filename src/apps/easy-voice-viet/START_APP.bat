@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Dang cai dependencies lan dau...
  npm install
)
if not exist node_modules\ffmpeg-static (
  echo Dang cai ffmpeg-static cho BGM...
  npm install ffmpeg-static --save
)
npm run dev
pause
