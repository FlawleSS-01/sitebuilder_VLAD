\
import json, os, re, time
from urllib.parse import urlparse
import requests

API_PREFIX = "/admin_api/v1"

def normalize_domain(v: str) -> str:
    v = (v or "").strip()
    if not v:
        return ""
    if not re.match(r"^https?://", v, re.I):
        v = "https://" + v
    u = urlparse(v)
    host = (u.hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    return host

def extract_brand(host: str) -> str:
    host = (host or "").strip().lower()
    if not host:
        return ""
    first = host.split(".")[0]
    first = re.sub(r"[^a-z0-9]+", "", first)
    return first.upper()

def load_config(path: str) -> dict:
    with open(path, "r", encoding="utf-8-sig") as f:
        return json.load(f)

def sanitize_admin_url(url: str) -> str:
    url = (url or "").strip().rstrip("/")
    if url.lower().endswith("/admin"):
        url = url[:-6]
    return url.rstrip("/")

def pick_admin_url(cfg: dict) -> str:
    # Можно переопределить env-ом, но по умолчанию берём из config.json
    return sanitize_admin_url(os.environ.get("KEITARO_URL") or cfg.get("keitaro_admin_url") or "")

def pick_api_key(cfg: dict) -> str:
    # В приоритете env (так безопаснее). В config.json ключ можно НЕ хранить.
    key = (os.environ.get("KEITARO_API_KEY") or cfg.get("api_key") or "").strip()
    # чистим невидимые/не-ascii символы, чтобы не падать на headers
    key = "".join(ch for ch in key if ord(ch) < 128)
    return key

def headers(api_key: str) -> dict:
    return {"Api-Key": api_key, "Accept": "application/json"}

def req(admin_url: str, api_key: str, method: str, path: str, *, json_body=None, data=""):
    url = admin_url + API_PREFIX + path
    r = requests.request(method, url, headers=headers(api_key), json=json_body, data=data, timeout=60)
    if r.status_code >= 400:
        raise RuntimeError(f"{method} {url} -> {r.status_code}: {r.text[:800]}")
    return r.json() if r.text.strip() else None

def get_campaign(admin_url: str, api_key: str, campaign_id: int) -> dict:
    return req(admin_url, api_key, "GET", f"/campaigns/{campaign_id}")

def clone_campaign(admin_url: str, api_key: str, template_id: int) -> dict:
    obj = req(admin_url, api_key, "POST", f"/campaigns/{template_id}/clone", data="")
    if isinstance(obj, list) and obj:
        obj = obj[0]
    if not isinstance(obj, dict) or "id" not in obj:
        raise RuntimeError(f"Unexpected clone response: {obj}")
    return obj

def update_campaign(admin_url: str, api_key: str, campaign_id: int, payload: dict) -> None:
    req(admin_url, api_key, "PUT", f"/campaigns/{campaign_id}", json_body=payload)

def extract_tracking_domain(camp: dict) -> str:
    d = camp.get("domain") or camp.get("tracking_domain") or camp.get("domain_name")
    if isinstance(d, dict):
        return (d.get("url") or d.get("name") or "").rstrip("/")
    if isinstance(d, str):
        return d.rstrip("/")
    return ""

def extract_ready_url(camp: dict) -> str:
    for k in ("url", "campaign_url", "tracking_url", "link"):
        if camp.get(k):
            return str(camp[k]).strip()
    return ""

def generate_links(config_path: str, geo: str, domains: list[str], rename: bool = True) -> list[dict]:
    cfg = load_config(config_path)
    admin_url = pick_admin_url(cfg)
    api_key = pick_api_key(cfg)
    if not admin_url:
        raise RuntimeError("Keitaro URL not set (keitaro_admin_url in config.json or KEITARO_URL env).")
    if not api_key:
        raise RuntimeError("Keitaro API key not set (KEITARO_API_KEY env).")

    templates = cfg.get("templates") or {}
    geo = geo.strip().upper()
    if geo not in templates:
        raise RuntimeError(f"GEO '{geo}' not found in config.json templates.")

    template_id = int(templates[geo]["template_campaign_id"])
    group_id = templates[geo].get("group_id")
    geo_label = templates[geo].get("geo_label") or geo

    template_camp = get_campaign(admin_url, api_key, template_id)
    tracking_domain = extract_tracking_domain(template_camp)
    if not tracking_domain:
        raise RuntimeError("Cannot extract tracking domain from template campaign. Check Domain in template.")

    out = []
    for host in domains:
        brand = extract_brand(host)
        cloned = clone_campaign(admin_url, api_key, template_id)
        new_id = int(cloned["id"])

        if rename:
            name = f"{host} {geo_label}".strip()
            payload = {"name": name}
            if group_id is not None:
                payload["group_id"] = int(group_id)
            update_campaign(admin_url, api_key, new_id, payload)

        camp_obj = get_campaign(admin_url, api_key, new_id)
        ready = extract_ready_url(camp_obj)
        if ready:
            url = ready
        else:
            alias = camp_obj.get("alias") or cloned.get("alias")
            if not alias:
                raise RuntimeError(f"No alias for campaign {new_id}")
            url = tracking_domain.rstrip("/") + "/" + alias

        out.append({
            "domain": host,
            "url": url,
            "brand": brand,
            "geo": geo,
            "campaign_id": new_id
        })
        time.sleep(0.12)

    return out
