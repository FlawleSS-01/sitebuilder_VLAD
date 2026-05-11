"""
Извлечь PNG-кадры из видео для разбора ассистентом (читаются как изображения).
Требуется: pip install imageio-ffmpeg
"""
import argparse
import subprocess
import sys
from pathlib import Path


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("video", type=Path, help="Путь к .mp4")
    p.add_argument(
        "-o",
        "--out",
        type=Path,
        default=Path(__file__).resolve().parent.parent / "docs" / "reference-video-frames",
        help="Папка для PNG",
    )
    p.add_argument(
        "-i",
        "--interval",
        type=int,
        default=15,
        help="Секунд между кадрами (fps=1/N)",
    )
    args = p.parse_args()

    if not args.video.is_file():
        print(f"Нет файла: {args.video}", file=sys.stderr)
        sys.exit(1)

    try:
        import imageio_ffmpeg as iio_ffmpeg
    except ImportError:
        print("Установите: pip install imageio-ffmpeg", file=sys.stderr)
        sys.exit(1)

    ff = iio_ffmpeg.get_ffmpeg_exe()
    args.out.mkdir(parents=True, exist_ok=True)
    pattern = args.out / "frame_%04d.png"
    vf = f"fps=1/{args.interval},scale=min(1280\\,iw):-1"
    cmd = [
        ff,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        str(args.video),
        "-vf",
        vf,
        str(pattern),
    ]
    subprocess.run(cmd, check=True)
    n = len(list(args.out.glob("frame_*.png")))
    print(f"Готово: {n} кадров в {args.out}")


if __name__ == "__main__":
    main()
