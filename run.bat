@echo off
cd /d "%~dp0"

set TELEGRAM_TOKEN=8635628171:AAHQhQRVxmYK05VYRmTbEGpS-A_zjpFvviI
set GOOGLE_SERVICE_ACCOUNT_FILE=service_account.json

echo Installing dependencies...
.venv\Scripts\pip.exe install requests gspread google-auth

echo Starting bot...
.venv\Scripts\python.exe bot.py

pause
