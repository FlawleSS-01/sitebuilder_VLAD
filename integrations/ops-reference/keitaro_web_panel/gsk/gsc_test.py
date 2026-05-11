import os
from pathlib import Path
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

# НУЖНЫ ПОЛНЫЕ ПРАВА (не readonly), чтобы потом add/submit работали
SCOPES = ["https://www.googleapis.com/auth/webmasters"]

BASE = Path(__file__).resolve().parent  # ...\keitaro_web_panel\gsk
CREDS_FILE = BASE / "credentials.json"
TOKEN_FILE = BASE / "token.json"

def get_creds():
    if TOKEN_FILE.exists():
        return Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)

    flow = InstalledAppFlow.from_client_secrets_file(str(CREDS_FILE), SCOPES)
    creds = flow.run_local_server(port=0)
    TOKEN_FILE.write_text(creds.to_json(), encoding="utf-8")
    return creds

def main():
    if not CREDS_FILE.exists():
        raise FileNotFoundError(f"Нет {CREDS_FILE}. Положи credentials.json сюда: {BASE}")

    creds = get_creds()
    svc = build("searchconsole", "v1", credentials=creds)

    sites = svc.sites().list().execute()
    print("SITES:")
    for s in sites.get("siteEntry", []):
        print("-", s.get("siteUrl"), "perm:", s.get("permissionLevel"))

if __name__ == "__main__":
    main()