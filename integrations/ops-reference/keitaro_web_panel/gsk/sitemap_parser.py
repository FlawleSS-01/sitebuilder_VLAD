import gzip
import ipaddress
import re
from io import BytesIO
from urllib.parse import urlparse, urlunparse
import xml.etree.ElementTree as ET

import requests

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36"
TIMEOUT = 30

MAX_URLS = 200000
MAX_SITEMAPS = 5000


def clean_line(s: str) -> str:
    s = (s or "").replace("\ufeff", "").strip().strip('"').strip("'").strip()
    if s.lower().startswith("https://https://"):
        s = "https://" + s[len("https://https://"):]
    if s.lower().startswith("http://http://"):
        s = "http://" + s[len("http://http://"):]
    return s


def is_blocked_host(host: str) -> bool:
    if not host:
        return True
    h = host.strip().lower()
    if h in ("localhost",):
        return True
    # если это IP — проверим приватные диапазоны
    try:
        ip = ipaddress.ip_address(h)
        return (
            ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast
            or ip.is_reserved or ip.is_unspecified
        )
    except ValueError:
        # доменное имя — ок
        return False


def to_sitemap_url(line: str) -> str | None:
    s = clean_line(line)
    if not s or s.startswith("#"):
        return None

    if not re.match(r"^https?://", s, re.I):
        s = "https://" + s

    p = urlparse(s)
    if not p.netloc:
        return None

    if is_blocked_host(p.hostname or ""):
        return None

    path = p.path or ""
    if path.lower().endswith((".xml", ".xml.gz")):
        return urlunparse((p.scheme, p.netloc, path, "", "", ""))

    return urlunparse((p.scheme, p.netloc, "/sitemap.xml", "", "", ""))


def maybe_ungzip(data: bytes) -> bytes | None:
    if not data:
        return None
    if len(data) >= 2 and data[:2] == b"\x1f\x8b":
        try:
            return gzip.decompress(data)
        except Exception:
            try:
                return gzip.GzipFile(fileobj=BytesIO(data)).read()
            except Exception:
                return None
    return data


def _tag_ends(tag: str, name: str) -> bool:
    return tag.endswith("}" + name) or tag == name


def parse_sitemap(xml_bytes: bytes) -> tuple[list[str], list[str]]:
    urls, children = [], []
    try:
        root = ET.fromstring(xml_bytes)
    except Exception:
        return urls, children

    if _tag_ends(root.tag, "sitemapindex"):
        for el in root.findall(".//{*}sitemap/{*}loc"):
            if el.text:
                children.append(clean_line(el.text))
        return urls, children

    if _tag_ends(root.tag, "urlset"):
        for el in root.findall(".//{*}url/{*}loc"):
            if el.text:
                urls.append(clean_line(el.text))
        return urls, children

    return urls, children


def uniq_keep_order(items: list[str]) -> list[str]:
    seen = set()
    out = []
    for x in items:
        if x and x not in seen:
            seen.add(x)
            out.append(x)
    return out


def fetch(url: str, session: requests.Session) -> bytes | None:
    try:
        r = session.get(url, timeout=TIMEOUT, allow_redirects=True)
        if r.status_code >= 400:
            return None
        return r.content
    except Exception:
        return None


def parse_from_lines(lines: list[str]) -> dict:
    # lines: домены / урлы / сайтмапы
    seeds = []
    for line in lines:
        sm = to_sitemap_url(line)
        if sm:
            seeds.append(sm)

    if not seeds:
        return {"urls": [], "sitemaps": 0, "errors": ["Нет валидных доменов/сайтмапов (или заблокированный host)."]}

    session = requests.Session()
    session.headers.update({
        "User-Agent": UA,
        "Accept": "application/xml,text/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,ru;q=0.8",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
    })

    queue = list(seeds)
    seen_sitemaps = set()
    all_urls = []
    errors = []

    while queue and len(seen_sitemaps) < MAX_SITEMAPS and len(all_urls) < MAX_URLS:
        sm = clean_line(queue.pop(0))
        if not sm or sm in seen_sitemaps:
            continue
        seen_sitemaps.add(sm)

        data = fetch(sm, session)
        if not data:
            errors.append(f"Не смог скачать: {sm}")
            continue

        data = maybe_ungzip(data)
        if not data:
            errors.append(f"Не смог распаковать gzip: {sm}")
            continue

        urls, children = parse_sitemap(data)

        if urls:
            all_urls.extend(urls)

        if children:
            for c in children:
                c = clean_line(c)
                if c and c not in seen_sitemaps:
                    queue.append(c)

    final = uniq_keep_order(all_urls)
    return {"urls": final, "sitemaps": len(seen_sitemaps), "errors": errors[:20]}