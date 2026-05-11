from pathlib import Path
from urllib.parse import urlparse, parse_qs

from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = ["https://www.googleapis.com/auth/webmasters"]

BASE = Path(__file__).resolve().parent
CREDS = BASE / "credentials.json"
ACCOUNTS = BASE / "accounts"

def main():
    acc = input("Account name (например acc02): ").strip()
    if not acc:
        raise SystemExit("Нет имени аккаунта")

    if not CREDS.exists():
        raise SystemExit(f"Нет credentials.json: {CREDS}")

    out_dir = ACCOUNTS / acc
    out_dir.mkdir(parents=True, exist_ok=True)
    token_path = out_dir / "token.json"

    flow = InstalledAppFlow.from_client_secrets_file(str(CREDS), SCOPES)
    flow.redirect_uri = "http://localhost"

    auth_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )

    url_file = out_dir / "auth_url.txt"
    url_file.write_text(auth_url, encoding="utf-8")

    print("\n1) Открой файл:", url_file)
    print("2) Скопируй ссылку (целиком одной строкой) и открой в нужном браузере/профиле/прокси.")
    print("3) После логина тебя редиректнет на localhost и будет ERR_CONNECTION_REFUSED — это НОРМ.")
    print("4) СКОПИРУЙ ПОЛНЫЙ URL из адресной строки (localhost/?state=...&code=...&scope=...)")
    print("5) Вставь его сюда:\n")

    full_url = input("PASTE FULL REDIRECT URL HERE: ").strip()
    if not full_url:
        raise SystemExit("URL не вставлен")

    # иногда браузер показывает без схемы: localhost/?...
    if full_url.startswith("localhost/"):
        full_url = "http://" + full_url
    if full_url.startswith("localhost?"):
        full_url = "http://" + full_url

    q = parse_qs(urlparse(full_url).query)
    code = (q.get("code") or [""])[0].strip()

    if not code:
        raise SystemExit("Не нашёл параметр code= в URL. Вставь URL целиком из адресной строки.")

    flow.fetch_token(code=code)

    creds = flow.credentials
    token_path.write_text(creds.to_json(), encoding="utf-8")
    print("OK token saved:", token_path)

if __name__ == "__main__":
    main()