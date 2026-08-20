import io
import os
from pathlib import Path
import urllib.request

UPLOAD_DIR = Path(__file__).parent / "uploads"


def fetch_image(url):
    """Return a BytesIO for a signature image URL (local /api/uploads or http)."""
    if not url:
        return None
    try:
        if url.startswith("/api/uploads/"):
            p = UPLOAD_DIR / url.split("/")[-1]
            return io.BytesIO(p.read_bytes()) if p.exists() else None
        if url.startswith("http"):
            with urllib.request.urlopen(url, timeout=5) as r:
                return io.BytesIO(r.read())
    except Exception:
        return None
    return None
