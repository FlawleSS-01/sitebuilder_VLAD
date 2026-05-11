Keitaro Web Panel (Flask)
=========================

Что это:
- Веб-панель: вставил домены -> выбрал GEO -> получил ссылки + CSV
- GEO/шаблоны берутся из config.json
- API ключ Keitaro берется из .env (рекомендуется)

Быстрый старт локально (Windows):
1) Установи зависимости:
   python -m pip install -r requirements.txt
2) Скопируй .env.example -> .env и заполни:
   - KEITARO_API_KEY
   - PANEL_PASSWORD
   - APP_SECRET
3) Запусти:
   python app.py
4) Открой:
   http://127.0.0.1:5000

Для сервера (сисадмину):
- Лучше запускать через gunicorn + nginx reverse proxy.
- Пример запуска:
   gunicorn -w 2 -b 127.0.0.1:5000 app:app
