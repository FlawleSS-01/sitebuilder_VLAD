import csv
import io
import os

from flask import (
    Flask,
    render_template,
    request,
    redirect,
    url_for,
    session,
    send_file,
    flash,
)
from dotenv import load_dotenv

from keitaro_core import load_config, normalize_domain, generate_links
from sitemap_parser import parse_from_lines  # <-- добавили парсер

load_dotenv()

APP_SECRET = os.environ.get("APP_SECRET", "CHANGE_ME")
PANEL_PASSWORD = os.environ.get("PANEL_PASSWORD", "")

app = Flask(__name__)
app.secret_key = APP_SECRET

BASE_DIR = os.path.dirname(__file__)
CONFIG_PATH = os.path.join(BASE_DIR, "config.json")


def is_logged_in() -> bool:
    if not PANEL_PASSWORD:
        # если пароль не задан — панель будет открытой (лучше всё же задать)
        return True
    return session.get("ok") is True


def get_keitaro_ui_base() -> str:
    """
    База для ссылки на UI Keitaro:
      {keitaro_ui_base}/#!/campaigns/{id}

    Приоритет:
    1) KEITARO_UI_URL из .env (лучший вариант)
    2) KEITARO_URL или config keitaro_admin_url + "/admin"
    """
    ui = (os.environ.get("KEITARO_UI_URL") or "").strip().rstrip("/")
    if ui:
        return ui

    cfg = load_config(CONFIG_PATH)
    base = (os.environ.get("KEITARO_URL") or cfg.get("keitaro_admin_url") or "").rstrip("/")
    if base.lower().endswith("/admin"):
        return base
    return base.rstrip("/") + "/admin"


@app.route("/login", methods=["GET", "POST"])
def login():
    if not PANEL_PASSWORD:
        session["ok"] = True
        return redirect(url_for("index"))

    if request.method == "POST":
        pwd = request.form.get("password", "")
        if pwd == PANEL_PASSWORD:
            session["ok"] = True
            return redirect(url_for("index"))
        return render_template("login.html", error="Неверный пароль")

    return render_template("login.html", error=None)


@app.route("/logout")
def logout():
    session.pop("ok", None)
    return redirect(url_for("login"))


# ----------- 1) ГЛАВНАЯ: Keitaro Generator -----------

@app.route("/", methods=["GET"])
def index():
    if not is_logged_in():
        return redirect(url_for("login"))

    cfg = load_config(CONFIG_PATH)
    templates = cfg.get("templates", {})
    geos = sorted(list(templates.keys()))
    return render_template("index.html", geos=geos)


@app.route("/generate", methods=["POST"])
def generate():
    if not is_logged_in():
        return redirect(url_for("login"))

    geo = (request.form.get("geo") or "").strip().upper()
    raw = request.form.get("domains") or ""

    domains = []
    for line in raw.splitlines():
        d = normalize_domain(line)
        if d:
            domains.append(d)

    if not geo:
        flash("Выбери GEO.")
        return redirect(url_for("index"))

    if not domains:
        flash("Вставь хотя бы 1 домен.")
        return redirect(url_for("index"))

    keitaro_ui_base = get_keitaro_ui_base()

    try:
        results = generate_links(CONFIG_PATH, geo=geo, domains=domains, rename=True)
    except Exception as e:
        return render_template(
            "results.html",
            results=[],
            geo=geo,
            error=str(e),
            keitaro_ui_base=keitaro_ui_base,
        )

    session["last"] = results
    return render_template(
        "results.html",
        results=results,
        geo=geo,
        error=None,
        keitaro_ui_base=keitaro_ui_base,
    )


@app.route("/download.csv", methods=["GET"])
def download_csv():
    if not is_logged_in():
        return redirect(url_for("login"))

    results = session.get("last") or []

    output = io.StringIO()
    w = csv.DictWriter(output, fieldnames=["domain", "url", "brand", "geo", "campaign_id"])
    w.writeheader()
    for r in results:
        w.writerow(r)

    mem = io.BytesIO(output.getvalue().encode("utf-8"))
    mem.seek(0)
    return send_file(mem, mimetype="text/csv", as_attachment=True, download_name="out.csv")


# ----------- 2) ПАРСЕР: Sitemap Parser -----------

@app.route("/parser", methods=["GET"])
def parser():
    if not is_logged_in():
        return redirect(url_for("login"))
    return render_template("parser.html")


@app.route("/parser/run", methods=["POST"])
def parser_run():
    if not is_logged_in():
        return redirect(url_for("login"))

    raw = request.form.get("targets") or ""
    lines = [x.strip() for x in raw.splitlines() if x.strip()]

    if not lines:
        flash("Вставь хотя бы 1 домен/ссылку/сайтмап.")
        return redirect(url_for("parser"))

    try:
        result = parse_from_lines(lines)
    except Exception as e:
        return render_template("parser_results.html", urls=[], sitemaps=0, errors=[str(e)])

    urls = result.get("urls", [])
    session["last_parser"] = urls

    return render_template(
        "parser_results.html",
        urls=urls,
        sitemaps=result.get("sitemaps", 0),
        errors=result.get("errors", []),
    )


@app.route("/parser/download.txt", methods=["GET"])
def parser_download_txt():
    if not is_logged_in():
        return redirect(url_for("login"))

    urls = session.get("last_parser") or []
    data = ("\n".join(urls) + ("\n" if urls else "")).encode("utf-8")
    return send_file(io.BytesIO(data), mimetype="text/plain", as_attachment=True, download_name="urls.txt")


@app.route("/parser/download.csv", methods=["GET"])
def parser_download_csv():
    if not is_logged_in():
        return redirect(url_for("login"))

    urls = session.get("last_parser") or []

    output = io.StringIO()
    w = csv.writer(output)
    w.writerow(["url"])
    for u in urls:
        w.writerow([u])

    mem = io.BytesIO(output.getvalue().encode("utf-8"))
    mem.seek(0)
    return send_file(mem, mimetype="text/csv", as_attachment=True, download_name="urls.csv")


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)