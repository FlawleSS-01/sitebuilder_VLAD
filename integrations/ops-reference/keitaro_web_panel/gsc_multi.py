import json
from pathlib import Path
from typing import Dict, List, Tuple, Any

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

SCOPES = ["https://www.googleapis.com/auth/webmasters"]


def _load_json(path: Path, default):
    try:
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        pass
    return default


def norm_root(url: str) -> str:
    url = (url or "").strip()
    if not url:
        return ""
    # приводим к https://host/
    if "://" not in url:
        url = "https://" + url
    # убрать путь
    try:
        from urllib.parse import urlparse
        p = urlparse(url)
        host = p.hostname
        if not host:
            return ""
        return f"https://{host}/"
    except Exception:
        return ""


def load_accounts(gsk_dir: Path) -> List[Dict[str, Any]]:
    base = gsk_dir / "accounts"
    if not base.exists():
        return []
    out = []
    for d in sorted(base.iterdir()):
        if not d.is_dir():
            continue
        token = d / "token.json"
        if token.exists():
            out.append({"id": d.name, "token_path": str(token)})
    return out


def load_accounts_map(gsk_dir: Path) -> Dict[str, Dict[str, str]]:
    return _load_json(gsk_dir / "accounts_map.json", {})


def load_state(gsk_dir: Path) -> int:
    st = _load_json(gsk_dir / "state.json", {"i": 0})
    try:
        return int(st.get("i", 0))
    except Exception:
        return 0


def save_state(gsk_dir: Path, i: int) -> None:
    (gsk_dir / "state.json").write_text(json.dumps({"i": int(i)}, ensure_ascii=False, indent=2), encoding="utf-8")


def round_robin_assign(roots: List[str], accounts: List[Dict[str, Any]], start_index: int) -> List[Tuple[str, Dict[str, Any]]]:
    assigned = []
    n = len(accounts)
    if n == 0:
        return assigned
    for k, r in enumerate(roots):
        acc = accounts[(start_index + k) % n]
        assigned.append((r, acc))
    return assigned


def _service_from_token(token_path: str):
    creds = Credentials.from_authorized_user_file(token_path, scopes=SCOPES)
    # webmasters v3 нужен для sitemaps.submit
    return build("webmasters", "v3", credentials=creds, cache_discovery=False)


def sites_add_and_submit(gsk_dir: Path, acc: Dict[str, Any], site_root: str) -> Dict[str, Any]:
    """
    Возвращает структуру результата, чтобы UI мог показать:
    - какой account использован
    - ok/ошибки add/sitemap
    """
    acc_id = acc.get("id", "")
    amap = load_accounts_map(gsk_dir)
    email = (amap.get(acc_id) or {}).get("email", "")

    token_path = acc.get("token_path")
    res = {
        "site_root": site_root,
        "account_id": acc_id,
        "account_email": email,
        "added_ok": False,
        "sitemap_ok": False,
        "error_add": "",
        "error_sitemap": "",
    }

    try:
        svc = _service_from_token(token_path)
    except Exception as e:
        res["error_add"] = f"token/service error: {e}"
        return res

    # 1) add property
    try:
        svc.sites().add(siteUrl=site_root).execute()
        res["added_ok"] = True
    except HttpError as e:
        # часто бывает 409 Already exists — это не критично
        msg = str(e)
        res["error_add"] = msg
        if "already" in msg.lower() or "409" in msg:
            res["added_ok"] = True
    except Exception as e:
        res["error_add"] = str(e)

    # 2) submit sitemap (по твоему правилу всегда /sitemap.xml)
    sitemap = site_root.rstrip("/") + "/sitemap.xml"
    try:
        svc.sitemaps().submit(siteUrl=site_root, feedpath=sitemap).execute()
        res["sitemap_ok"] = True
    except Exception as e:
        res["error_sitemap"] = str(e)

    return res