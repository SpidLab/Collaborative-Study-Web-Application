@echo off
REM Double-click this file (Windows) to set up / start the Site Agent - no typing needed.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0collab-agent.ps1"
echo.
echo ------------------------------------------------------------
echo Done. The agent runs in the background - you can close this window.
pause
