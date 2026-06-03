import os
import re
import json
import time
import tempfile
import requests
from http.server import BaseHTTPRequestHandler


# === Config ===
SPREADSHEET_ID = "1g5Jib2xa4HqRUiq5XjNqLbczaIu3mls0q0op4eQI6A0"
WORKSHEET_NAME = "Zadacha 2"
EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")


def is_valid_email(text: str) -> bool:
    return bool(EMAIL_RE.match(text.strip()))


def get_worksheet():
    import gspread
    from google.oauth2.service_account import Credentials

    scopes = ["https://www.googleapis.com/auth/spreadsheets"]

    # Read credentials from env variable (JSON string) or file
    sa_json = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON")
    if sa_json:
        info = json.loads(sa_json)
        creds = Credentials.from_service_account_info(info, scopes=scopes)
    else:
        creds = Credentials.from_service_account_file("service_account.json", scopes=scopes)

    gc = gspread.authorize(creds)
    sh = gc.open_by_key(SPREADSHEET_ID)
    try:
        ws = sh.worksheet(WORKSHEET_NAME)
    except gspread.WorksheetNotFound:
        ws = sh.add_worksheet(title=WORKSHEET_NAME, rows=1000, cols=2)
        ws.append_row(["Email", "Date added"])
    return ws


def email_exists(ws, email: str) -> bool:
    existing = [e.strip().lower() for e in ws.col_values(1)]
    return email.strip().lower() in existing


def save_email(ws, email: str):
    ws.append_row([email.strip(), time.strftime("%Y-%m-%d %H:%M:%S")])


def send_message(token: str, chat_id: int, text: str):
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    requests.post(url, json={"chat_id": chat_id, "text": text})


def handle_update(update: dict, token: str):
    msg = update.get("message")
    if not msg or "text" not in msg:
        return

    chat_id = msg["chat"]["id"]
    text = msg["text"].strip()

    if text.startswith("/start"):
        send_message(token, chat_id, "Hi! Send me an email and I will save it to the database.")
        return

    if not is_valid_email(text):
        send_message(token, chat_id, "You sent an invalid email.")
        return

    ws = get_worksheet()

    if email_exists(ws, text):
        send_message(token, chat_id, "This email is already registered.")
        return

    save_email(ws, text)
    send_message(token, chat_id, f"Email {text} saved successfully!")


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        token = os.environ.get("TELEGRAM_TOKEN", "")
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)

        try:
            update = json.loads(body)
            handle_update(update, token)
        except Exception as e:
            print("Error:", e)

        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"OK")

    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"Bot is running!")

    def log_message(self, format, *args):
        pass
