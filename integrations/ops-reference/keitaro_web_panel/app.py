# -*- coding: utf-8 -*-
"""
Keitaro Web Panel (Generator + Parser + GSC Conveyor)

- Generator: clone campaign templates in Keitaro, rename, output (DOMAIN | LINK | BRAND) + CSV
- Parser: parse sitemap.xml / sitemapindex / .xml.gz from domains/URLs, output URL list + TXT/CSV
- GSC: add URL-prefix properties + submit sitemap (if permitted) and generate fast "Inspect" links
- AdsPower (optional): open "Inspect" links inside the correct AdsPower profile (proxy) via Selenium attach
- Google Sheets (optional): append log rows to a spreadsheet tab

All secrets live in .env and config.json / gsk/*.
"""
from __future__ import annotations

import csv
import gzip
import io
import json
import os
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple
from urllib.parse import quote

import requests
from dotenv import load_dotenv
from flask import (
    Flask,
    flash,
    redirect,
    render_template,
    request,
    send_file,
    session,
    url_for,
    jsonify,
)

# Optional deps (GSC / Sheets / AdsPower Selenium)
try:
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from google.auth.transport.requests import Request as GoogleRequest
    from googleapiclient.discovery import build as gbuild
    from googleapiclient.errors import HttpError
    from google.oauth2 import service_account
except Exception:
    Credentials = None  # type: ignore
    InstalledAppFlow = None  # type: ignore
    GoogleRequest = None  # type: ignore
    gbuild = None  # type: ignore
    HttpError = Exception  # type: ignore
    service_account = None  # type: ignore

try:
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.chrome.service import Service as ChromeService
except Exception:
    webdriver = None  # type: ignore
    Options = None  # type: ignore
    ChromeService = None  # type: ignore


# -----------------------------
# App / env
# -----------------------------
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

APP_SECRET = os.environ.get("APP_SECRET", "CHANGE_ME")
PANEL_PASSWORD = os.environ.get("PANEL_PASSWORD", "")

# Keitaro
CONFIG_PATH = BASE_DIR / "config.json"

# AdsPower
ADSPOWER_BASE = os.environ.get("ADSPOWER_BASE", "http://127.0.0.1:50325").rstrip("/")
ADSPOWER_API_KEY = os.environ.get("ADSPOWER_API_KEY", "").strip()
ADSPOWER_ENABLED = os.environ.get("ADSPOWER_ENABLED", "1").strip() not in ("0", "false", "False", "")
ADSPOWER_USE_SELENIUM = os.environ.get("ADSPOWER_USE_SELENIUM", "1").strip() not in ("0", "false", "False", "")

# Google Sheets logging (optional)
SHEETS_SPREADSHEET_ID = os.environ.get("SHEETS_SPREADSHEET_ID", "").strip()
SHEETS_TAB_NAME = os.environ.get("SHEETS_TAB_NAME", "ALL BRAND").strip()  # user asked to call it ALL BRAND
SHEETS_SA_JSON = os.environ.get("SHEETS_SA_JSON", str(BASE_DIR / "gsk" / "sheets_sa.json")).strip()
SHEETS_ENABLED = bool(SHEETS_SPREADSHEET_ID) and Path(SHEETS_SA_JSON).exists()

# GSC (OAuth tokens per account)
GSK_DIR = BASE_DIR / "gsk"
GSC_CREDENTIALS_JSON = os.environ.get("GSC_CREDENTIALS_JSON", str(GSK_DIR / "credentials.json")).strip()
GSC_ACCOUNTS_DIR = Path(os.environ.get("GSC_ACCOUNTS_DIR", str(GSK_DIR / "accounts")))

# Accounts mapping (emails + AdsPower profile ids)
ACCOUNTS_MAP_PATH = Path(os.environ.get("ACCOUNTS_MAP_PATH", str(GSK_DIR / "accounts_map.json")))

# Per-run state (round-robin index)
GSC_STATE_PATH = Path(os.environ.get("GSC_STATE_PATH", str(GSK_DIR / "state.json")))

# Limits
MAX_DOMAINS_PER_RUN = int(os.environ.get("MAX_DOMAINS_PER_RUN", "20"))
MAX_URLS_PER_DOMAIN_FOR_GSC = int(os.environ.get("MAX_URLS_PER_DOMAIN_FOR_GSC", "20"))
REQUEST_TIMEOUT = int(os.environ.get("REQUEST_TIMEOUT", "35"))

# Flask
app = Flask(__name__, template_folder=str(BASE_DIR / "templates"))
app.secret_key = APP_SECRET


# -----------------------------
# Helpers
# -----------------------------
def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")



def normalize_keitaro_base(url: str) -> str:
    """Return Keitaro base URL without /admin, /admin_api, /admin_api/v1 and trailing slash."""
    u = (url or "").strip().rstrip("/")
    if not u:
        return ""
    for suf in ("/admin_api/v1", "/admin_api", "/admin"):
        if u.endswith(suf):
            u = u[: -len(suf)].rstrip("/")
    return u

def keitaro_ui_base(url: str) -> str:
    """Return URL to Keitaro UI root (usually .../admin)."""
    base = normalize_keitaro_base(url)
    if not base:
        return ""
    return base + "/admin"

def norm_domain(line: str) -> str:
    s = (line or "").strip()
    if not s:
        return ""
    s = re.sub(r"^https?://", "", s, flags=re.I)
    s = re.sub(r"^www\.", "", s, flags=re.I)
    s = s.split("/")[0].strip()
    return s.lower()


def brand_from_domain(domain: str) -> str:
    # brand = leftmost label, remove non-alnum except digits, uppercase
    dom = norm_domain(domain)
    if not dom:
        return ""
    base = dom.split(".")[0]
    base = re.sub(r"[^a-zA-Z0-9]+", "", base)
    return base.upper()


def uniq_keep_order(items: Iterable[str]) -> List[str]:
    seen = set()
    out = []
    for x in items:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out


def chunks(lst: List[Any], n: int) -> Iterable[List[Any]]:
    for i in range(0, len(lst), n):
        yield lst[i : i + n]


def ensure_dir(p: Path) -> None:
    p.mkdir(parents=True, exist_ok=True)


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    with open(path, "r", encoding="utf-8-sig") as f:
        return json.load(f)


def save_json(path: Path, data: Any) -> None:
    ensure_dir(path.parent)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def is_logged_in() -> bool:
    if not PANEL_PASSWORD:
        return True
    return bool(session.get("ok"))


def login_required():
    def deco(fn):
        def wrapper(*args, **kwargs):
            if not is_logged_in():
                return redirect(url_for("login"))
            return fn(*args, **kwargs)
        wrapper.__name__ = fn.__name__
        return wrapper
    return deco


# -----------------------------
# Keitaro API
# -----------------------------
@dataclass
class TemplateCfg:
    template_campaign_id: int
    group_id: Optional[int]
    geo_label: str


@dataclass
class KeitaroConfig:
    keitaro_admin_url: str
    api_key: str
    templates: Dict[str, TemplateCfg]


def load_keitaro_config() -> KeitaroConfig:
    raw = load_json(CONFIG_PATH, {})
    admin_url = normalize_keitaro_base(str(raw.get('keitaro_admin_url') or '').strip())
    api_key = str(raw.get('api_key') or '').strip()
    templates_raw = raw.get('templates') or {}
    if not isinstance(templates_raw, dict):
        templates_raw = {}

    templates: Dict[str, TemplateCfg] = {}
    warnings: list[str] = []

    for geo, v in templates_raw.items():
        if not isinstance(v, dict):
            continue
        code = str(geo).upper().strip()
        t_id = v.get('template_campaign_id')
        if t_id in (None, ''):
            warnings.append(f'{code}: missing template_campaign_id (skipped)')
            continue
        try:
            template_campaign_id = int(t_id)
        except Exception:
            warnings.append(f'{code}: template_campaign_id not int (skipped)')
            continue

        group_id = v.get('group_id', None)
        try:
            group_id_int = int(group_id) if group_id not in (None, '') else None
        except Exception:
            group_id_int = None

        geo_label = str(v.get('geo_label') or code)
        templates[code] = TemplateCfg(template_campaign_id=template_campaign_id, group_id=group_id_int, geo_label=geo_label)

    if warnings:
        print('[config warnings]', '; '.join(warnings))

    if not admin_url or not api_key or not templates:
        raise ValueError('config.json: заполните keitaro_admin_url, api_key и templates')
    return KeitaroConfig(keitaro_admin_url=admin_url, api_key=api_key, templates=templates)

def k_headers(api_key: str) -> Dict[str, str]:
    # Keitaro expects "Api-Key" header (ASCII). Keep it safe.
    return {"Api-Key": api_key, "Content-Type": "application/json"}


def k_req(cfg: KeitaroConfig, method: str, path: str, json_body: Any | None = None) -> Any:
    base = normalize_keitaro_base(cfg.keitaro_admin_url)
    url = base + "/admin_api/v1" + path
    r = requests.request(
        method=method.upper(),
        url=url,
        headers=k_headers(cfg.api_key),
        json=json_body,
        timeout=REQUEST_TIMEOUT,
    )
    if r.status_code >= 400:
        raise RuntimeError(f"Keitaro API {method} {path} -> {r.status_code}: {r.text[:400]}")
    return r.json() if r.text else {}


def keitaro_get_campaign(cfg: KeitaroConfig, campaign_id: int) -> Dict[str, Any]:
    return k_req(cfg, "GET", f"/campaigns/{campaign_id}")


def keitaro_clone_campaign(cfg: KeitaroConfig, template_id: int) -> int:
    data = k_req(cfg, 'POST', f'/campaigns/{template_id}/clone')
    new_id = None
    if isinstance(data, dict):
        new_id = data.get('id') or data.get('campaign_id') or (data.get('data') or {}).get('id')
    elif isinstance(data, list) and data:
        first = data[0]
        if isinstance(first, dict):
            new_id = first.get('id') or first.get('campaign_id')
        else:
            new_id = first
    if not new_id:
        raise RuntimeError(f'clone: no id in response: {data!r}')
    return int(new_id)

def keitaro_update_campaign(cfg: KeitaroConfig, campaign_id: int, name: str, group_id: Optional[int]) -> None:
    payload: Dict[str, Any] = {"name": name}
    if group_id is not None:
        payload["group_id"] = group_id
    k_req(cfg, "PUT", f"/campaigns/{campaign_id}", payload)


def _ensure_http(url_or_domain: str) -> str:
    v = (url_or_domain or "").strip()
    if not v:
        return ""
    if v.startswith("http://") or v.startswith("https://"):
        return v
    return "https://" + v


def keitaro_generate_campaign_link(cfg: KeitaroConfig, campaign_id: int, tracking_domain_hint: str = "") -> str:
    """Get a tracking link for a campaign.

    On many Keitaro installs, API endpoints like /campaigns/{id}/link/generate simply DO NOT exist
    (you see nginx 404). The most reliable method is to build the link from alias:

      tracking_link = <tracking_domain>/<alias>

    where tracking_domain is taken from the TEMPLATE campaign (tracking_domain_hint).
    """

    # 1) Read campaign alias
    camp = None
    try:
        camp = k_req(cfg, "GET", f"/campaigns/{campaign_id}")
    except Exception:
        camp = None

    alias = ""
    if isinstance(camp, dict):
        alias = str(
            camp.get("alias")
            or camp.get("campaign_alias")
            or camp.get("tracking_alias")
            or ""
        ).strip()

    base = _ensure_http(tracking_domain_hint).rstrip("/")
    if alias and base:
        return f"{base}/{alias.lstrip('/')}"

    # 2) Try to infer tracking domain from campaign fields
    if isinstance(camp, dict) and alias:
        td = camp.get("tracking_domain") or camp.get("trackingDomain")
        if isinstance(td, str) and td:
            base2 = _ensure_http(td).rstrip("/")
            return f"{base2}/{alias.lstrip('/')}"

        domain = camp.get("domain")
        if isinstance(domain, dict):
            dn = domain.get("name") or domain.get("domain") or domain.get("url")
            if isinstance(dn, str) and dn:
                base2 = _ensure_http(dn).rstrip("/")
                return f"{base2}/{alias.lstrip('/')}"

        domain_id = camp.get("domain_id") or camp.get("tracking_domain_id")
        if domain_id:
            try:
                dom = k_req(cfg, "GET", f"/domains/{int(domain_id)}")
                if isinstance(dom, dict):
                    dn = dom.get("name") or dom.get("domain") or dom.get("url")
                    if isinstance(dn, str) and dn:
                        base2 = _ensure_http(dn).rstrip("/")
                        return f"{base2}/{alias.lstrip('/')}"
            except Exception:
                pass

    # 3) Last resort: try a few known endpoints (varies by Keitaro version)
    candidates = [
        ("/campaigns/{id}/link", "GET"),
        ("/campaigns/{id}/link", "POST"),
        ("/campaigns/{id}/generate_link", "POST"),
        ("/campaigns/{id}/link/generate", "POST"),
    ]
    last_err = None
    for p, m in candidates:
        try:
            data = k_req(cfg, m, p.format(id=campaign_id))
            if isinstance(data, dict):
                url = data.get("url") or data.get("link") or data.get("value")
                if not url:
                    d = data.get("data")
                    if isinstance(d, dict):
                        url = d.get("url") or d.get("link")
                if url:
                    return str(url)
            if isinstance(data, str) and data.startswith("http"):
                return data
        except Exception as e:
            last_err = e
            continue

    raise RuntimeError(
        f"Не смог получить ссылку кампании {campaign_id}. "
        f"Похоже, в твоём Keitaro нет endpoint'а генерации ссылки (nginx 404). "
        f"Проверь tracking_domain у шаблонной кампании. Ошибка: {last_err}"
    )


# -----------------------------
# Sitemap Parser
# -----------------------------
SITEMAP_NS = "{http://www.sitemaps.org/schemas/sitemap/0.9}"
RE_URL = re.compile(r"<loc>(.*?)</loc>", re.I | re.S)

def fetch_bytes(url: str) -> bytes:
    s = requests.Session()
    s.trust_env = False
    r = s.get(url, timeout=REQUEST_TIMEOUT, headers={"User-Agent": "Mozilla/5.0"})
    r.raise_for_status()
    return r.content

def parse_xml_locs(xml_bytes: bytes) -> List[str]:
    # fast regex-based loc extraction (works for sitemap/sitemapindex)
    try:
        txt = xml_bytes.decode("utf-8", errors="ignore")
    except Exception:
        txt = str(xml_bytes)
    locs = [m.group(1).strip() for m in RE_URL.finditer(txt)]
    return [x for x in locs if x]

def parse_sitemap_any(url: str, seen: set[str]) -> List[str]:
    url = url.strip()
    if not url or url in seen:
        return []
    seen.add(url)

    content = fetch_bytes(url)
    # gzip
    if url.lower().endswith(".gz") or content[:2] == b"\x1f\x8b":
        try:
            content = gzip.decompress(content)
        except Exception:
            pass

    locs = parse_xml_locs(content)

    # heuristic: sitemapindex if many locs end with .xml/.gz and not typical page paths
    child_maps = [x for x in locs if x.lower().endswith((".xml", ".xml.gz", ".gz"))]
    if len(child_maps) >= 1 and len(child_maps) >= len(locs) * 0.5:
        urls: List[str] = []
        for cm in child_maps:
            urls.extend(parse_sitemap_any(cm, seen))
        return urls
    return locs

def expand_to_sitemap_url(line: str) -> str:
    s = line.strip()
    if not s:
        return ""
    if s.lower().endswith((".xml", ".xml.gz", ".gz")):
        return s if s.startswith("http") else "https://" + s.lstrip("/")
    d = norm_domain(s)
    if not d:
        return ""
    return f"https://{d}/sitemap.xml"

def group_urls_by_domain(urls: List[str]) -> Dict[str, List[str]]:
    out: Dict[str, List[str]] = {}
    for u in urls:
        try:
            dom = norm_domain(u)
        except Exception:
            continue
        if not dom:
            continue
        out.setdefault(dom, []).append(u)
    for dom, lst in out.items():
        # keep only unique, stable order, cap
        out[dom] = uniq_keep_order(lst)[:MAX_URLS_PER_DOMAIN_FOR_GSC]
    return out


# -----------------------------
# Google Sheets (optional logging)
# -----------------------------
_sheets_service = None

def sheets_service():
    global _sheets_service
    if not SHEETS_ENABLED:
        return None
    if _sheets_service is not None:
        return _sheets_service
    if service_account is None or gbuild is None:
        return None
    creds = service_account.Credentials.from_service_account_file(
        SHEETS_SA_JSON,
        scopes=["https://www.googleapis.com/auth/spreadsheets"],
    )
    _sheets_service = gbuild("sheets", "v4", credentials=creds, cache_discovery=False)
    return _sheets_service

def sheets_append(rows: List[List[Any]]) -> None:
    svc = sheets_service()
    if svc is None:
        return
    try:
        svc.spreadsheets().values().append(
            spreadsheetId=SHEETS_SPREADSHEET_ID,
            range=f"{SHEETS_TAB_NAME}!A:Z",
            valueInputOption="USER_ENTERED",
            insertDataOption="INSERT_ROWS",
            body={"values": rows},
        ).execute()
    except Exception as e:
        # do not break main flow
        print("[WARN] sheets append:", e)

def log_sheet(action: str, domain: str, **fields: Any) -> None:
    # Keep it simple: append log row
    row = [
        now_iso(),
        action,
        domain,
        fields.get("geo", ""),
        fields.get("brand", ""),
        fields.get("keitaro_campaign_id", ""),
        fields.get("keitaro_url", ""),
        fields.get("gsc_account_id", ""),
        fields.get("gsc_email", ""),
        fields.get("urls_count", ""),
        fields.get("note", ""),
    ]
    sheets_append([row])


# -----------------------------
# GSC (Search Console API)
# -----------------------------
GSC_SCOPES = ["https://www.googleapis.com/auth/webmasters"]

_gsc_service_cache: Dict[str, Any] = {}

def list_account_ids() -> List[str]:
    if not GSC_ACCOUNTS_DIR.exists():
        return []
    return sorted([p.name for p in GSC_ACCOUNTS_DIR.iterdir() if p.is_dir()])

def load_accounts_map() -> Dict[str, Dict[str, str]]:
    # Expected format:
    # { "acc00": {"email":"...", "adspower_user_id":""}, "acc01": {...} }
    raw = load_json(ACCOUNTS_MAP_PATH, {})
    out: Dict[str, Dict[str, str]] = {}
    for k, v in (raw or {}).items():
        if not isinstance(v, dict):
            continue
        email = (v.get("email") or v.get("gmail") or v.get("gmail1") or "").strip()
        adspower_user_id = (v.get("adspower_user_id") or v.get("adspower") or "").strip()
        out[str(k)] = {"email": email, "adspower_user_id": adspower_user_id}
    return out

def gsc_get_token_paths(account_id: str) -> Tuple[Path, Path]:
    acc_dir = GSC_ACCOUNTS_DIR / account_id
    return (Path(GSC_CREDENTIALS_JSON), acc_dir / "token.json")

def gsc_service_for(account_id: str):
    if gbuild is None or Credentials is None:
        raise RuntimeError("google-api-python-client не установлен (pip install -r requirements.txt)")
    if account_id in _gsc_service_cache:
        return _gsc_service_cache[account_id]

    creds_file, token_file = gsc_get_token_paths(account_id)
    if not Path(creds_file).exists():
        raise FileNotFoundError(f"Нет credentials.json для GSC: {creds_file}")

    creds = None
    if token_file.exists():
        creds = Credentials.from_authorized_user_file(str(token_file), GSC_SCOPES)

    if creds and creds.expired and creds.refresh_token and GoogleRequest is not None:
        creds.refresh(GoogleRequest())
        token_file.write_text(creds.to_json(), encoding="utf-8")

    if not creds or not creds.valid:
        raise RuntimeError(
            f"Нет токена для {account_id}. Сгенерь token.json в папке: {token_file.parent}"
        )

    svc = gbuild("searchconsole", "v1", credentials=creds, cache_discovery=False)
    _gsc_service_cache[account_id] = svc
    return svc

def gsc_sites_list(account_id: str) -> List[Dict[str, Any]]:
    svc = gsc_service_for(account_id)
    data = svc.sites().list().execute()
    return data.get("siteEntry", []) if isinstance(data, dict) else []

def gsc_permission_for_site(account_id: str, site_url: str) -> str:
    try:
        sites = gsc_sites_list(account_id)
        for s in sites:
            if s.get("siteUrl") == site_url:
                return s.get("permissionLevel", "")
    except Exception:
        pass
    return ""

def gsc_add_site(account_id: str, site_url: str) -> Tuple[bool, str]:
    svc = gsc_service_for(account_id)
    try:
        svc.sites().add(siteUrl=site_url).execute()
        return True, ""
    except HttpError as e:
        return False, str(e)
    except Exception as e:
        return False, str(e)

def gsc_submit_sitemap(account_id: str, site_url: str, sitemap_url: str) -> Tuple[bool, str]:
    svc = gsc_service_for(account_id)
    try:
        svc.sitemaps().submit(siteUrl=site_url, feedpath=sitemap_url).execute()
        return True, ""
    except HttpError as e:
        return False, str(e)
    except Exception as e:
        return False, str(e)

def gsc_inspect_link(property_url: str, url: str) -> str:
    # Works in whichever Google account is currently logged in in the browser.
    rid = quote(property_url, safe="")
    u = quote(url, safe="")
    return f"https://search.google.com/search-console/inspect?resource_id={rid}&url={u}"

def gsc_pick_accounts_round_robin(domains: List[str], accounts: List[str]) -> Dict[str, str]:
    if not accounts:
        raise RuntimeError("Нет папок аккаунтов GSC в gsk/accounts")
    state = load_json(GSC_STATE_PATH, {"idx": 0})
    idx = int(state.get("idx", 0))
    mapping: Dict[str, str] = {}
    for d in domains:
        mapping[d] = accounts[idx % len(accounts)]
        idx += 1
    save_json(GSC_STATE_PATH, {"idx": idx})
    return mapping


# -----------------------------
# AdsPower integration
# -----------------------------
def adspower_headers() -> Dict[str, str]:
    if not ADSPOWER_API_KEY:
        return {}
    # AdsPower docs: Authorization: Bearer {apiKey} 
    return {"Authorization": f"Bearer {ADSPOWER_API_KEY}"}

def adspower_list_profiles(page: int = 1, page_size: int = 200) -> tuple[bool, list[dict]]:
    s = requests.Session()
    s.trust_env = False
    url = f"{ADSPOWER_BASE}/api/v1/user/list"
    try:
        resp = s.get(url, params={'page': page, 'page_size': page_size}, headers=adspower_headers(), timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
        if int(data.get('code', -1)) != 0:
            return False, []
        lst = (data.get('data') or {}).get('list') or []
        if not isinstance(lst, list):
            return False, []
        return True, [x for x in lst if isinstance(x, dict)]
    except Exception:
        return False, []


def adspower_resolve_user_id(user_id_or_serial: str) -> str:
    v = (user_id_or_serial or '').strip()
    if not v:
        return ''
    if not v.isdigit():
        return v
    ok, profiles = adspower_list_profiles()
    if not ok:
        return v
    for p in profiles:
        uid = str(p.get('user_id') or p.get('id') or '').strip()
        sn = str(p.get('serial_number') or p.get('serialNumber') or p.get('serial') or '').strip()
        if uid == v:
            return uid
        if sn == v and uid:
            return uid
    return v


def adspower_start_profile(user_id_or_serial: str) -> dict:
    real_id = adspower_resolve_user_id(user_id_or_serial)
    if not real_id:
        raise RuntimeError('AdsPower profile id is empty')
    s = requests.Session()
    s.trust_env = False
    url = f"{ADSPOWER_BASE}/api/v1/browser/start"
    resp = s.get(url, params={'user_id': real_id, 'open_tabs': 0, 'ip_tab': 0}, headers=adspower_headers(), timeout=REQUEST_TIMEOUT)
    resp.raise_for_status()
    data = resp.json()
    if int(data.get('code', -1)) != 0:
        raise RuntimeError(data.get('msg') or str(data))
    return data.get('data') or {}


def adspower_start(user_id: str) -> Dict[str, Any]:
    """
    Start AdsPower browser profile and return response JSON.
    Uses /api/v1/browser/start 
    """
    s = requests.Session()
    s.trust_env = False
    url = f"{ADSPOWER_BASE}/api/v1/browser/start"
    resp = s.get(url, params={"user_id": user_id, "open_tabs": 0, "ip_tab": 0}, headers=adspower_headers(), timeout=REQUEST_TIMEOUT)
    resp.raise_for_status()
    data = resp.json()
    if data.get("code") != 0:
        raise RuntimeError(data.get("msg") or str(data))
    return data


def adspower_open_urls(user_id: str, urls: list[str]) -> None:
    """Start AdsPower profile and open multiple URLs (new tabs) in that profile."""
    if webdriver is None or Options is None:
        raise RuntimeError('Selenium не установлен. Добавь selenium==4.* и установи зависимости.')
    urls = [u for u in (urls or []) if u]
    if not urls:
        return

    data = adspower_start_profile(user_id)
    ws = (data.get('ws') or {})
    debugger = ws.get('selenium')
    chromedriver_path = data.get('webdriver') or data.get('webdriver_path')
    if not debugger:
        raise RuntimeError(f'AdsPower start returned no ws.selenium: {data}')

    chrome_options = Options()
    chrome_options.add_experimental_option('debuggerAddress', debugger)
    chrome_options.add_experimental_option('detach', True)
    service = ChromeService(executable_path=chromedriver_path) if chromedriver_path else None
    driver = webdriver.Chrome(service=service, options=chrome_options) if service else webdriver.Chrome(options=chrome_options)
    try:
        driver.get(urls[0])
        for u in urls[1:]:
            driver.execute_script("window.open(arguments[0], '_blank');", u)
    finally:
        try:
            driver.quit()
        except Exception:
            pass

def adspower_open_url(user_id: str, url_to_open: str) -> None:
    """
    Attach Selenium to AdsPower-launched Chrome and open a URL.
    Based on AdsPower Selenium 4 code sample 
    """
    if not ADSPOWER_ENABLED:
        raise RuntimeError("AdsPower отключён (ADSPOWER_ENABLED=0)")
    if not ADSPOWER_USE_SELENIUM:
        # start profile only
        adspower_start_profile(user_id)
        return
    if webdriver is None or Options is None or ChromeService is None:
        raise RuntimeError("Selenium не установлен. Добавь selenium>=4,<5 в requirements.txt и поставь зависимости.")
    data = adspower_start_profile(user_id)
    ws = (data.get("ws") or {})
    debugger = ws.get("selenium")  # host:port
    chromedriver_path = data.get("webdriver")
    if not debugger or not chromedriver_path:
        raise RuntimeError(f"AdsPower start returned no webdriver/ws: {data}")
    chrome_options = Options()
    chrome_options.add_experimental_option("debuggerAddress", debugger)
    # detach: try to keep window open after our session ends
    chrome_options.add_experimental_option("detach", True)

    service = ChromeService(executable_path=chromedriver_path) if chromedriver_path else None
    driver = webdriver.Chrome(service=service, options=chrome_options) if service else webdriver.Chrome(options=chrome_options)
    # open in new tab to not destroy existing session tab
    driver.execute_script("window.open(arguments[0], '_blank');", url_to_open)
    driver.switch_to.window(driver.window_handles[-1])
    driver.get(url_to_open)
    # IMPORTANT: do not stop the profile here; user will use it
    try:
        driver.quit()
    except Exception:
        pass

def adspower_ping() -> Dict[str, Any]:
    """
    AdsPower has no /status (hence your Not Found). Use /api/v1/user/list instead. 
    """
    s = requests.Session()
    s.trust_env = False
    url = f"{ADSPOWER_BASE}/api/v1/user/list"
    resp = s.get(url, params={"page": 1, "page_size": 1}, headers=adspower_headers(), timeout=REQUEST_TIMEOUT)
    resp.raise_for_status()
    return resp.json()


# -----------------------------
# Routes
# -----------------------------
@app.get("/login")
def login():
    if is_logged_in():
        return redirect(url_for("index"))
    return render_template("login.html", error=None)

@app.post("/login")
def login_post():
    pwd = request.form.get("password", "")
    if not PANEL_PASSWORD or pwd == PANEL_PASSWORD:
        session["ok"] = True
        return redirect(url_for("index"))
    return render_template("login.html", error="Неверный пароль")

@app.get("/logout")
def logout():
    session.pop("ok", None)
    return redirect(url_for("login"))

@app.get("/")
@login_required()
def index():
    cfg_error = None
    geos = []
    try:
        cfg = load_keitaro_config()
        geos = sorted(cfg.templates.keys())
    except Exception as e:
        cfg_error = str(e)
    return render_template("index.html", geos=geos, cfg_error=cfg_error)

@app.post("/generate")
@login_required()
def generate():
    try:
        cfg = load_keitaro_config()
    except Exception as e:
        flash(f"Keitaro config error: {e}", "error")
        return redirect(url_for("index"))
    geo = (request.form.get("geo") or "").upper().strip()
    text = request.form.get("domains") or ""
    domains = [norm_domain(x) for x in text.splitlines()]
    domains = [d for d in uniq_keep_order(domains) if d]
    if not domains:
        flash("Вставь хотя бы 1 домен.", "error")
        return redirect(url_for("index"))
    if geo not in cfg.templates:
        flash("Выбери GEO.", "error")
        return redirect(url_for("index"))
    if len(domains) > MAX_DOMAINS_PER_RUN:
        domains = domains[:MAX_DOMAINS_PER_RUN]

    tcfg = cfg.templates[geo]
    # tracking domain from TEMPLATE campaign (most reliable for building tracking links)
    tracking_domain_hint = ""
    try:
        tmp = k_req(cfg, "GET", f"/campaigns/{tcfg.template_campaign_id}")
        if isinstance(tmp, dict):
            td = tmp.get("tracking_domain") or tmp.get("trackingDomain")
            if isinstance(td, str):
                tracking_domain_hint = td
    except Exception:
        tracking_domain_hint = ""
    results: List[Dict[str, Any]] = []
    error = None

    for d in domains:
        brand = brand_from_domain(d)
        try:
            new_id = keitaro_clone_campaign(cfg, tcfg.template_campaign_id)
            new_name = f"{d} {tcfg.geo_label}".strip()
            keitaro_update_campaign(cfg, new_id, new_name, tcfg.group_id)
            link = keitaro_generate_campaign_link(cfg, new_id, tracking_domain_hint=tracking_domain_hint)
            results.append({"domain": d, "url": link, "brand": brand, "campaign_id": new_id, "geo": geo})
            log_sheet("keitaro", d, geo=geo, brand=brand, keitaro_campaign_id=new_id, keitaro_url=link)
        except Exception as e:
            error = str(e)
            results.append({"domain": d, "url": "", "brand": brand, "campaign_id": "", "geo": geo})

    # store CSV in session for /download.csv
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["domain", "url", "brand", "campaign_id", "geo"])
    for r in results:
        w.writerow([r["domain"], r["url"], r["brand"], r["campaign_id"], r["geo"]])
    session["last_csv"] = out.getvalue()
    session["keitaro_ui_base"] = cfg.keitaro_admin_url  # used in results.html

    return render_template("results.html", geo=geo, results=results, error=error, keitaro_ui_base=cfg.keitaro_admin_url)

@app.get("/download.csv")
@login_required()
def download_csv():
    csv_text = session.get("last_csv", "")
    if not csv_text:
        return redirect(url_for("index"))
    buf = io.BytesIO(csv_text.encode("utf-8"))
    buf.seek(0)
    return send_file(buf, mimetype="text/csv", as_attachment=True, download_name="out.csv")


# ---- Parser
@app.get("/parser")
@login_required()
def parser():
    return render_template("parser.html")

@app.post("/parser/run")
@login_required()
def parser_run():
    raw = request.form.get("targets") or ""
    lines = [x.strip() for x in raw.splitlines() if x.strip()]
    if not lines:
        flash("Вставь домены/URL/сайтмапы.", "error")
        return redirect(url_for("parser"))

    targets = uniq_keep_order(lines)[:MAX_DOMAINS_PER_RUN]
    seen_maps: set[str] = set()
    all_urls: List[str] = []
    sitemaps_parsed = 0
    err = None

    for t in targets:
        sm = expand_to_sitemap_url(t)
        if not sm:
            continue
        try:
            urls = parse_sitemap_any(sm, seen_maps)
            if urls:
                sitemaps_parsed += 1
                all_urls.extend(urls)
        except Exception as e:
            err = f"{err}\n{sm}: {e}" if err else f"{sm}: {e}"

    all_urls = uniq_keep_order([u.strip() for u in all_urls if u.strip()])
    # store for GSC
    session["last_parser_urls"] = all_urls
    session["last_parser_grouped"] = group_urls_by_domain(all_urls)
    session["last_parser_at"] = now_iso()

    # Sheets: write only if user says "контент обновлял"
    sheet_mode = (request.form.get("sheet_mode") or "view").strip().lower()
    if sheet_mode == "update":
        # log per domain (not every URL) so sheet stays clean
        for t in targets:
            d = norm_domain(t)
            if d:
                log_sheet("content_update", d, urls_count=len(group_urls_by_domain(all_urls).get(d, [])), note="parser")


    return render_template("parser_results.html", urls=all_urls, sitemaps=sitemaps_parsed, error=err)

@app.get("/parser/download.txt")
@login_required()
def parser_download_txt():
    urls = session.get("last_parser_urls") or []
    txt = "\n".join(urls) + ("\n" if urls else "")
    buf = io.BytesIO(txt.encode("utf-8"))
    buf.seek(0)
    return send_file(buf, mimetype="text/plain", as_attachment=True, download_name="urls.txt")

@app.get("/parser/download.csv")
@login_required()
def parser_download_csv():
    urls = session.get("last_parser_urls") or []
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["url"])
    for u in urls:
        w.writerow([u])
    buf = io.BytesIO(out.getvalue().encode("utf-8"))
    buf.seek(0)
    return send_file(buf, mimetype="text/csv", as_attachment=True, download_name="urls.csv")


# ---- GSC
@app.get("/gsc")
@login_required()
def gsc():
    grouped = session.get("last_parser_grouped") or {}
    # prefill textarea with unique domains
    domains = "\n".join(sorted(grouped.keys())) if grouped else ""
    accounts = list_account_ids()
    amap = load_accounts_map()
    return render_template("gsc.html", domains=domains, accounts=accounts, accounts_map=amap, error=None)

@app.post("/gsc/run")
@login_required()
def gsc_run():
    raw = request.form.get("domains") or ""
    # accept domains OR full urls. We'll normalize to domains and use last_parser_grouped for urls if available.
    lines = [x.strip() for x in raw.splitlines() if x.strip()]
    if not lines:
        flash("Вставь домены/URL.", "error")
        return redirect(url_for("gsc"))

    # domains from lines
    doms = []
    for x in lines:
        if x.startswith("http"):
            doms.append(norm_domain(x))
        else:
            doms.append(norm_domain(x))
    doms = [d for d in uniq_keep_order(doms) if d][:MAX_DOMAINS_PER_RUN]

    accounts = list_account_ids()
    amap = load_accounts_map()

    # URLs to inspect: use parser grouped if present, else only home page for each domain
    grouped_parser: Dict[str, List[str]] = session.get("last_parser_grouped") or {}
    grouped_urls: Dict[str, List[str]] = {}
    for d in doms:
        if d in grouped_parser and grouped_parser[d]:
            grouped_urls[d] = grouped_parser[d][:MAX_URLS_PER_DOMAIN_FOR_GSC]
        else:
            grouped_urls[d] = [f"https://{d}/"]

    domain_to_acc = gsc_pick_accounts_round_robin(doms, accounts)

    items = []
    top_error = None

    for d in doms:
        acc_id = domain_to_acc[d]
        acc_email = (amap.get(acc_id) or {}).get("email", "")
        adspower_user_id = (amap.get(acc_id) or {}).get("adspower_user_id", "")

        property_url = f"https://{d}/"  # URL-prefix property
        perm_before = gsc_permission_for_site(acc_id, property_url)

        added_ok, err_add = gsc_add_site(acc_id, property_url)
        perm_after = gsc_permission_for_site(acc_id, property_url) or perm_before

        sitemap_url = f"{property_url}sitemap.xml"
        sitemap_ok, err_sm = gsc_submit_sitemap(acc_id, property_url, sitemap_url)

        rows = []
        for u in grouped_urls[d]:
            rows.append({"url": u, "inspect": gsc_inspect_link(property_url, u)})

        items.append({
            "domain": d,
            "property_url": property_url,
            "account_id": acc_id,
            "account_email": acc_email,
            "adspower_user_id": adspower_user_id,
            "perm": perm_after,
            "added_ok": bool(added_ok),
            "error_add": err_add,
            "sitemap_ok": bool(sitemap_ok),
            "error_sitemap": err_sm,
            "rows": rows,
        })

        log_sheet("gsc_add", d, gsc_account_id=acc_id, gsc_email=acc_email, urls_count=len(rows), note=f"perm={perm_after}")

    return render_template("gsc_results.html", items=items, error=top_error)


# ---- AdsPower routes
@app.get("/adspower/ping")
@login_required()
def adspower_ping_route():
    try:
        data = adspower_ping()
        return jsonify({"ok": True, "data": data})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

@app.post("/adspower/open")
@login_required()
def adspower_open_route():
    payload = request.get_json(silent=True) or {}
    user_id = str(payload.get("user_id") or "").strip()
    url_to_open = str(payload.get("url") or "").strip()
    if not user_id or not url_to_open:
        return jsonify({"ok": False, "error": "user_id and url required"}), 400
    try:
        adspower_open_url(user_id, url_to_open)
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.post("/adspower/open_many")
@login_required()
def api_adspower_open_many():
    if not request.is_json:
        return jsonify({"ok": False, "error": "json only"}), 400
    data = request.get_json(force=True) or {}
    user_id = str(data.get("user_id") or "").strip()
    urls = data.get("urls") or []
    if isinstance(urls, str):
        urls = [urls]
    urls = [str(u).strip() for u in urls if str(u).strip()]
    if not user_id:
        return jsonify({"ok": False, "error": "missing user_id"}), 400
    if not urls:
        return jsonify({"ok": False, "error": "missing urls"}), 400
    try:
        adspower_open_urls(user_id, urls)
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# -----------------------------
if __name__ == "__main__":
    # Local dev
    app.run(host="127.0.0.1", port=5000, debug=False)
