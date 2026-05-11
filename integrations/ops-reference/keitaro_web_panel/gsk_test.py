import os
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

SCOPES = ["https://www.googleapis.com/auth/webmasters"]
CREDS_FILE = "credentials.json"   # переименуй свой json в credentials.json
TOKEN_FILE = "token.json"

def get_creds():
    if os.path.exists(TOKEN_FILE):
        return Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)

    flow = InstalledAppFlow.from_client_secrets_file(CREDS_FILE, SCOPES)
    creds = flow.run_local_server(port=0)
    with open(TOKEN_FILE, "w", encoding="utf-8") as f:
        f.write(creds.to_json())
    return creds

def main():
    creds = get_creds()
    svc = build("searchconsole", "v1", credentials=creds)

    sites = svc.sites().list().execute()
    print("SITES:")
    for s in sites.get("siteEntry", []):
        print("-", s.get("siteUrl"), "perm:", s.get("permissionLevel"))

if __name__ == "__main__":
    main()