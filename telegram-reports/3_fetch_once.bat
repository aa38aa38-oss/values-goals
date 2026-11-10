@echo off
chcp 65001 >nul
cd /d "%~dp0"
.venv\Scripts\python tg_reports.py fetch
pause
