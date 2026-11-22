"""Create a cached public copy; never write into the source photo."""
from pathlib import Path
from tempfile import NamedTemporaryFile
from PIL import Image, ImageDraw, ImageFont, ImageOps, ImageStat

LOGO = Path(__file__).parent / "assets" / "vetmech-mark.jpg"
PHOTO_EXTENSIONS = {".png", ".jpeg", ".jpg", ".webp", ".bmp", ".gif"}


def product_photo_query(name, base=""):
    path = "/api/uploads/" + name
    urls = [path, "https://vetmechpharma.in" + path, "https://www.vetmechpharma.in" + path]
    if base:
        urls.append(base.rstrip("/") + path)
    return {"$or": [{key: {"$in": urls}} for key in
                    ("image", "images", "variants.images", "seo.og_image")]}


def public_copy(source):
    cache = source.parent / ".product-watermarks-v1"
    cache.mkdir(exist_ok=True)
    dest = cache / (source.name + "." + str(source.stat().st_mtime_ns) + ".webp")
    if dest.is_file():
        return dest
    with Image.open(source) as raw:
        img = ImageOps.exif_transpose(raw).convert("RGBA")
    w, h = img.size
    unit = min(w, h)
    layer = Image.new("RGBA", img.size)
    draw = ImageDraw.Draw(layer)
    font = ImageFont.load_default(size=max(1, round(unit * .042)))
    small = ImageFont.load_default(size=max(1, round(unit * .025)))
    x, y = round(w * .16), round(h * .69)
    size = max(1, round(unit * .077))
    patch = img.crop((x, y, min(w, x + size), min(h, y + size)))
    shade = 255 if ImageStat.Stat(patch.convert("L")).mean[0] < 115 else 15
    with Image.open(LOGO) as logo:
        mask = ImageOps.invert(logo.convert("L")).point(lambda v: 60 if v > 85 else 0)
        mask = mask.resize((size, size), Image.Resampling.LANCZOS)
    layer.paste((shade, shade, shade, 255), (x, y, x + size, y + size), mask)
    draw.text((x + size, y + size//2), "VETMECH", font=font, anchor="lm",
              fill=(shade, shade, shade, 65))
    draw.text((round(w*.98), round(h*.975)), "vetmechpharma.in", font=small, anchor="rb",
              fill=(255, 255, 255, 210), stroke_width=max(1, round(unit*.0015)),
              stroke_fill=(25, 25, 25, 155))
    with NamedTemporaryFile(dir=cache, delete=False) as tmp:
        temp = Path(tmp.name)
    try:
        Image.alpha_composite(img, layer).save(temp, "WEBP", quality=92)
        temp.replace(dest)
    finally:
        temp.unlink(missing_ok=True)
    return dest
