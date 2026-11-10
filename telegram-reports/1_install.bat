@echo off
cd /d "%~dp0"
echo === Install (first time only) ===
where py >nul 2>nul && (set PY=py) || (set PY=python)
%PY% -m venv .venv
if errorlevel 1 (echo Python not found. Install from https://www.python.org/downloads/ and tick "Add python.exe to PATH". & pause & exit /b 1)
.venv\Scripts\python -m pip install --upgrade pip
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python -m pip install cryptg 2>nul
if not exist config.ini copy config.example.ini config.ini >nul
echo.
echo Done. Now open config.ini with Notepad and fill in api_id / api_hash.
pause
