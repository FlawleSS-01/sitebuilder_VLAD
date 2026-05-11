import os
from pathlib import Path
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

SCOPES = ["https://www.googleapis.com/auth/webmasters"]

BASE = Path(__file__).resolve().parent
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

    site = "https://kk33e.com/"   # <-- Поменяй на домен для теста (со слэшем на конце)
    sitemap = site + "sitemap.xml"

    try:
        svc.sites().add(siteUrl=site).execute()
        print("[OK] added site:", site)
    except Exception as e:
        print("[WARN] add site:", e)

    try:
        svc.sitemaps().submit(siteUrl=site, feedpath=sitemap).execute()
        print("[OK] submitted sitemap:", sitemap)
    except Exception as e:
        print("[WARN] submit sitemap:", e)

if __name__ == "__main__":
    main()