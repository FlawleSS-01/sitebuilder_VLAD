import os
from pathlib import Path
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
    creds = flow.run_local_server(port=0)

    token_path.write_text(creds.to_json(), encoding="utf-8")
    print("OK:", token_path)

if __name__ == "__main__":
    main()