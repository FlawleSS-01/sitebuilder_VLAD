# gsc_conveyor.py
from urllib.parse import quote, urlparse

def normalize_https_root(domain_or_url: str) -> str:
    s = (domain_or_url or "").strip()
    if not s:
        return ""
    if not s.startswith("http"):
        s = "https://" + s
    p = urlparse(s)
    host = (p.hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    if not host:
        return ""
    return f"https://{host}/"

def inspection_link(property_url: str, page_url: str) -> str:
    # Google Search Console URL Inspection deep link
    # https://search.google.com/search-console/inspect?resource_id=...&url=...
    return (
        "https://search.google.com/search-console/inspect?"
        f"resource_id={quote(property_url, safe='')}"
        f"&url={quote(page_url, safe='')}"
    )

def group_urls_by_host(urls: list[str]) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for u in urls:
        u = (u or "").strip()
        if not u.startswith("http"):
            continue
        p = urlparse(u)
        host = (p.hostname or "").lower()
        if host.startswith("www."):
            host = host[4:]
        if not host:
            continue
        out.setdefault(host, []).append(u)
    return out

def uniq_keep_order(items: list[str]) -> list[str]:
    seen = set()
    out = []
    for x in items:
        if x and x not in seen:
            seen.add(x)
            out.append(x)
    return out