import io
import pytest
from PIL import Image, ImageChops


@pytest.mark.asyncio
@pytest.mark.parametrize("field", ["main", "gallery", "variant", "share"])
async def test_public_photo_after_assignment(client, database, tmp_path, monkeypatch, field):
    import server
    monkeypatch.setattr(server, "UPLOAD_DIR", tmp_path)
    path = tmp_path / "photo.png"
    image = Image.new("RGB", (640, 540), "white")
    image.save(path)
    clean = path.read_bytes()
    url = "/api/uploads/photo.png"
    assert client.get(url).content == clean
    doc = {"main": {"image": url}, "gallery": {"images": [url]},
           "variant": {"variants": [{"images": [url]}]},
           "share": {"seo": {"og_image": "https://vetmechpharma.in" + url}}}[field]
    await database.products.insert_one(doc)
    res = client.get(url)
    assert res.status_code == 200 and res.headers["content-type"] == "image/webp"
    marked = Image.open(io.BytesIO(res.content)).convert("RGB")
    assert marked.size == image.size
    diff = ImageChops.difference(image, marked)
    assert diff.crop((80, 350, 320, 450)).getbbox()
    assert diff.crop((350, 480, 640, 540)).getbbox()
    assert client.get(url).content == res.content
    assert path.read_bytes() == clean
