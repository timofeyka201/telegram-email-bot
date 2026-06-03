import os
import re
import time
import requests

# === Конфигурация ===
SPREADSHEET_ID = "1g5Jib2xa4HqRUiq5XjNqLbczaIu3mls0q0op4eQI6A0"  # файл "Тестовое задание"
WORKSHEET_NAME = "Задача 2"
SERVICE_ACCOUNT_FILE = os.environ.get("GOOGLE_SERVICE_ACCOUNT_FILE", "service_account.json")

# Регулярка для проверки email
EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")


def is_valid_email(text: str) -> bool:
    return bool(EMAIL_RE.match(text.strip()))


def get_worksheet():
    # Ленивый импорт, чтобы файл можно было импортировать без google-библиотек
    import gspread
    from google.oauth2.service_account import Credentials

    scopes = ["https://www.googleapis.com/auth/spreadsheets"]
    creds = Credentials.from_service_account_file(SERVICE_ACCOUNT_FILE, scopes=scopes)
    gc = gspread.authorize(creds)
    sh = gc.open_by_key(SPREADSHEET_ID)
    try:
        ws = sh.worksheet(WORKSHEET_NAME)
    except gspread.WorksheetNotFound:
        ws = sh.add_worksheet(title=WORKSHEET_NAME, rows=1000, cols=2)
        ws.append_row(["Email", "Дата добавления"])
    return ws


def email_exists(ws, email: str) -> bool:
    existing = [e.strip().lower() for e in ws.col_values(1)]
    return email.strip().lower() in existing


def save_email(ws, email: str):
    ws.append_row([email.strip(), time.strftime("%Y-%m-%d %H:%M:%S")])


def send_message(api: str, chat_id: int, text: str):
    requests.post(f"{api}/sendMessage", json={"chat_id": chat_id, "text": text})


def handle_update(update: dict, ws, api: str):
    msg = update.get("message")
    if not msg or "text" not in msg:
        return
    chat_id = msg["chat"]["id"]
    text = msg["text"].strip()

    if text.startswith("/start"):
        send_message(api, chat_id, "Привет! Пришли мне email — я сохраню его в базу.")
        return

    if not is_valid_email(text):
        send_message(api, chat_id, "Вы прислали некорректный email")
        return

    if email_exists(ws, text):
        send_message(api, chat_id, "Данный email уже зарегистрирован")
        return

    save_email(ws, text)
    send_message(api, chat_id, f"Email {text} сохранён ✅")


def main():
    token = os.environ.get("TELEGRAM_TOKEN")
    if not token:
        raise SystemExit("Установите переменную окружения TELEGRAM_TOKEN")

    api = f"https://api.telegram.org/bot{token}"
    ws = get_worksheet()
    offset = None
    print("Бот запущен. Ожидаю сообщения...")

    while True:
        try:
            resp = requests.get(f"{api}/getUpdates",
                                params={"timeout": 30, "offset": offset}, timeout=40)
            for update in resp.json().get("result", []):
                offset = update["update_id"] + 1
                handle_update(update, ws, api)
        except Exception as e:
            print("Ошибка:", e)
            time.sleep(3)


if __name__ == "__main__":
    main()
