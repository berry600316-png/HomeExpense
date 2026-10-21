"""
由 IMG/LOGO.png 產生 PWA／iOS 圖示。執行：PYTHONUTF8=1 python -X utf8 scripts/make-icons.py

原圖是「白底上的圓角方形」。iOS 主畫面會自行套圓角遮罩，所以要先裁掉白邊、把圓角外的白色補成深藍，
做成滿版方形；否則主畫面上圖示外圍會多一圈白框。
"""
import os
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'IMG', 'LOGO.png')
OUT = os.path.join(ROOT, 'public')
NAVY = (16, 36, 74)


def is_white(p):
    return sum(p[:3]) >= 720


def full_bleed() -> Image.Image:
    im = Image.open(SRC).convert('RGB')
    w, h = im.size
    px = im.load()
    mid_y, mid_x = h // 2, w // 2
    left = next(x for x in range(w) if not is_white(px[x, mid_y]))
    right = next(x for x in range(w - 1, -1, -1) if not is_white(px[x, mid_y]))
    top = next(y for y in range(h) if not is_white(px[mid_x, y]))
    bottom = next(y for y in range(h - 1, -1, -1) if not is_white(px[mid_x, y]))
    inset = 18  # 去掉邊緣的立體高光
    crop = im.crop((left + inset, top + inset, right - inset + 1, bottom - inset + 1))
    size = max(crop.size)
    canvas = Image.new('RGB', (size, size), NAVY)
    canvas.paste(crop, ((size - crop.width) // 2, (size - crop.height) // 2))
    # 四個角落殘留的白色（原圖圓角外側）補成深藍
    for corner in [(0, 0), (size - 1, 0), (0, size - 1), (size - 1, size - 1)]:
        ImageDraw.floodfill(canvas, corner, NAVY, thresh=120)
    return canvas


def save(img: Image.Image, name: str, size: int):
    img.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, name), optimize=True)


def main():
    os.makedirs(OUT, exist_ok=True)
    base = full_bleed()
    save(base, 'apple-touch-icon.png', 180)
    save(base, 'pwa-192.png', 192)
    save(base, 'pwa-512.png', 512)
    save(base, 'favicon-64.png', 64)
    # maskable：Android 會裁成圓形等形狀，內容需在中央 80% 安全區內
    #   背景用原圖放大模糊延伸，內圖邊緣羽化，避免出現方形接縫
    m = base.resize((1024, 1024), Image.LANCZOS).filter(ImageFilter.GaussianBlur(48))
    inner = base.resize((800, 800), Image.LANCZOS)
    feather = Image.new('L', (800, 800), 0)
    ImageDraw.Draw(feather).rounded_rectangle([24, 24, 775, 775], radius=180, fill=255)
    feather = feather.filter(ImageFilter.GaussianBlur(22))
    m.paste(inner, (112, 112), feather)
    m.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, 'pwa-maskable-512.png'), optimize=True)
    print('ok', base.size)


if __name__ == '__main__':
    main()
