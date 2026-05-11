Кадры из обучающего ролика Site Builder (vlad-generator): по одному PNG каждые ~15 с.
Исходное видео: bandicam 2026-04-02 (путь на ПК у вас может отличаться).

Повторить извлечение (нужен Python + imageio-ffmpeg один раз):
  pip install imageio-ffmpeg
  python scripts\extract_reference_frames.py "полный\путь\к\видео.mp4"

Параметр интервала — внутри скрипта (секунды между кадрами).
