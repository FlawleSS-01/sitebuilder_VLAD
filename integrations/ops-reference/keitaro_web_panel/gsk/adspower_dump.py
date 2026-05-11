import json
import os
import requests

BASE = os.getenv('ADSPOWER_BASE', 'http://local.adspower.net:50325').rstrip('/')
API_KEY = os.getenv('ADSPOWER_API_KEY', '').strip()


def headers():
    if not API_KEY:
        return {}
    return {"Authorization": f"Bearer {API_KEY}"}


def main():
    url = f"{BASE}/api/v1/user/list"
    r = requests.get(url, params={"page": 1, "page_size": 200}, headers=headers(), timeout=20)
    r.raise_for_status()
    data = r.json()
    if int(data.get('code', -1)) != 0:
        raise SystemExit(data)
    lst = (data.get('data') or {}).get('list') or []
    out = []
    for p in lst:
        if not isinstance(p, dict):
            continue
        out.append({
            "serial_number": p.get('serial_number') or p.get('serialNumber') or p.get('serial'),
            "user_id": p.get('user_id') or p.get('id'),
            "name": p.get('name') or p.get('user_name') or p.get('remark')
        })
    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
