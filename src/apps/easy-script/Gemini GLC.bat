@echo off
title GC - Gemini 2.5 Flash

echo ============================
echo Starting GC with model 2.5-flash
echo ============================

REM Option 1: CLI supports --model flag
gemini --model gemini-2.5-flash

REM Option 2 (fallback if above not working)
REM gemini

pause