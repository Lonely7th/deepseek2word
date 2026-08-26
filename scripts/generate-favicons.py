from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "images" / "logo.png"


def square_with_padding(image: Image.Image, size: int, padding_ratio: float = 0.06) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    padding = max(1, round(size * padding_ratio))
    inner = size - padding * 2
    resized = image.copy()
    resized.thumbnail((inner, inner), Image.Resampling.LANCZOS)
    x = (size - resized.width) // 2
    y = (size - resized.height) // 2
    canvas.alpha_composite(resized, (x, y))
    return canvas


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    if source.width != source.height:
        raise ValueError("Favicon source must be square")

    favicon_16 = square_with_padding(source, 16)
    favicon_32 = square_with_padding(source, 32)
    favicon_48 = square_with_padding(source, 48)
    apple_touch = square_with_padding(source, 180, padding_ratio=0.08)

    favicon_16.save(ROOT / "favicon-16x16.png", optimize=True)
    favicon_32.save(ROOT / "favicon-32x32.png", optimize=True)
    apple_touch.save(ROOT / "apple-touch-icon.png", optimize=True)

    favicon_48.save(
        ROOT / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
    )


if __name__ == "__main__":
    main()
