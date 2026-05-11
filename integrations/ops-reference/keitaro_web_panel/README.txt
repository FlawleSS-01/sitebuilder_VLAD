KEITARO WEB PANEL (Generator + Parser + GSC Conveyor)

1) Install deps (inside project folder):
   python -m venv .venv
   .\.venv\Scripts\python.exe -m pip install -r requirements.txt

2) Configure Keitaro:
   - Edit config.json:
       keitaro_admin_url = https://YOUR-KEITARO-DOMAIN.COM   (без /admin_api/v1)
       api_key = YOUR_KEITARO_API_KEY
       templates = GEO -> template_campaign_id (число)

3) Configure GSC:
   - Put OAuth client secrets here: gsk/credentials.json
   - Create accounts folders:
       gsk/accounts/acc00/
       gsk/accounts/acc01/
       ...
   - Generate token per account:
       .\.venv\Scripts\python.exe gsk/make_token.py acc01
     (or use make_token_manual.py if needed)

4) Map accounts to emails and AdsPower profiles:
   - Edit gsk/accounts_map.json
   - adspower_user_id can be either REAL user_id or serial_number (digits you see in AdsPower UI).
   - To see mapping serial_number -> user_id:
       set ADSPOWER_BASE in env (see .env.example)
       .\.venv\Scripts\python.exe gsk/adspower_dump.py

5) Optional Google Sheets logging:
   - Put service account json: gsk/sheets_sa.json
   - Share your spreadsheet to service account email as Editor
   - Set env:
       SHEETS_SPREADSHEET_ID=... 
       SHEETS_TAB=ALL BRAND

6) Run:
   .\.venv\Scripts\python.exe app.py
   open: http://127.0.0.1:5000

Notes:
- GSC sitemap submit may return 403 if property is not verified (siteUnverifiedUser). Verify in GSC UI first.
- AdsPower API has no /api/v1/status. Use /api/v1/user/list.
