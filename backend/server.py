from fastapi import FastAPI, APIRouter, UploadFile, File, Depends, HTTPException
from fastapi.responses import Response, PlainTextResponse
from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from starlette.middleware.cors import CORSMiddleware
import logging
import base64
import uuid
import io
import json
import zipfile
from datetime import datetime, timezone
from PIL import Image

from db import db
from security import get_current_admin, require_module
from seed_data import run_seed
from seed_tickets import run_seed_tickets
from routers import auth_routes, catalog, orders, cms, admin_routes, tickets, quotations, pricing, seo

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("vetmech")

app = FastAPI(title="VETMECH Pharmaceuticals API")

UPLOAD_DIR = ROOT_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)


@app.get("/api/")
async def root():
    return {"message": "VETMECH Pharmaceuticals API", "status": "ok"}


# --- File upload (images auto-converted to compressed WebP) stored on disk ---
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}


@app.post("/api/admin/upload")
async def upload_file(file: UploadFile = File(...), square: bool = False, admin=Depends(get_current_admin)):
    ext = os.path.splitext(file.filename or "")[1].lower()
    allowed = IMAGE_EXTS | {".pdf", ".svg", ".doc", ".docx", ".xls", ".xlsx"}
    if ext not in allowed:
        raise HTTPException(status_code=400, detail="File type not allowed")
    data = await file.read()
    if len(data) > 15 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 15MB)")

    if ext in IMAGE_EXTS:
        # Convert + compress to WebP for faster loading. Original bytes are never stored.
        try:
            img = Image.open(io.BytesIO(data))
            if img.mode in ("P", "LA"):
                img = img.convert("RGBA")
            elif img.mode == "CMYK":
                img = img.convert("RGB")
            if square:
                # Pad to a uniform square canvas so all product images share identical dimensions
                size = min(max(img.width, img.height), 1200)
                canvas = Image.new("RGBA", (size, size), (255, 255, 255, 255))
                scale = min(size / img.width, size / img.height)
                nw, nh = int(img.width * scale), int(img.height * scale)
                resized = img.convert("RGBA").resize((nw, nh))
                canvas.paste(resized, ((size - nw) // 2, (size - nh) // 2), resized)
                img = canvas.convert("RGB")
            else:
                max_w = 1600
                if img.width > max_w:
                    ratio = max_w / img.width
                    img = img.resize((max_w, int(img.height * ratio)))
            name = f"{uuid.uuid4().hex}.webp"
            out = io.BytesIO()
            img.save(out, format="WEBP", quality=80, method=4)
            (UPLOAD_DIR / name).write_bytes(out.getvalue())
            return {"url": f"/api/uploads/{name}"}
        except Exception as e:
            logger.warning(f"Image WebP conversion failed, saving raw: {e}")
            pass  # fall back to raw save
    name = f"{uuid.uuid4().hex}{ext}"
    (UPLOAD_DIR / name).write_bytes(data)
    return {"url": f"/api/uploads/{name}"}


@app.post("/api/careers/upload-resume")
async def upload_resume(file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in {".pdf", ".doc", ".docx"}:
        raise HTTPException(status_code=400, detail="Only PDF or DOC/DOCX files are allowed")
    data = await file.read()
    if len(data) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 2MB)")
    name = f"resume_{uuid.uuid4().hex}{ext}"
    (UPLOAD_DIR / name).write_bytes(data)
    return {"url": f"/api/uploads/{name}", "filename": file.filename}


# --- Backups (Super Admin only) ---
BACKUP_COLLECTIONS = ["admin_users", "customers", "crm_customers", "products", "categories",
                      "brands", "units", "schemes", "orders", "tickets", "ticket_notifications",
                      "news", "gallery", "careers", "applications", "enquiries", "pages",
                      "settings", "counters", "audit_logs", "notification_logs"]


@app.get("/api/admin/backup/database")
async def backup_database(admin=Depends(require_module("*"))):
    dump = {}
    for col in BACKUP_COLLECTIONS:
        docs = await db[col].find({}, {"_id": 0}).to_list(100000)
        dump[col] = docs
    content = json.dumps({"generated_at": datetime.now(timezone.utc).isoformat(), "data": dump},
                         default=str, indent=2).encode("utf-8")
    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    return Response(content=content, media_type="application/json",
                    headers={"Content-Disposition": f"attachment; filename=vetmech-db-{ts}.json"})


@app.get("/api/admin/backup/images")
async def backup_images(admin=Depends(require_module("*"))):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in UPLOAD_DIR.iterdir():
            if f.is_file():
                zf.write(f, f.name)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    return Response(content=buf.getvalue(), media_type="application/zip",
                    headers={"Content-Disposition": f"attachment; filename=vetmech-images-{ts}.zip"})


@app.get("/api/admin/backup/stats")
async def backup_stats(admin=Depends(require_module("*"))):
    counts = {c: await db[c].count_documents({}) for c in BACKUP_COLLECTIONS}
    img_count = sum(1 for f in UPLOAD_DIR.iterdir() if f.is_file())
    img_size = sum(f.stat().st_size for f in UPLOAD_DIR.iterdir() if f.is_file())
    return {"collections": counts, "total_records": sum(counts.values()),
            "image_count": img_count, "image_size_mb": round(img_size / 1024 / 1024, 2)}


CONTENT_TYPES = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
                 ".webp": "image/webp", ".gif": "image/gif", ".pdf": "application/pdf",
                 ".svg": "image/svg+xml", ".doc": "application/msword",
                 ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"}


@app.get("/api/uploads/{name}")
async def serve_upload(name: str):
    path = UPLOAD_DIR / name
    if not path.exists() or ".." in name:
        raise HTTPException(status_code=404, detail="Not found")
    ext = os.path.splitext(name)[1].lower()
    return Response(content=path.read_bytes(),
                    media_type=CONTENT_TYPES.get(ext, "application/octet-stream"))


def _site_base():
    return os.environ.get("SITE_URL", "").rstrip("/")


def _xml_escape(s):
    return (str(s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace('"', "&quot;").replace("'", "&apos;"))


async def _sitemap_urls():
    """(loc_path, lastmod, changefreq, priority) tuples for every indexable public URL."""
    urls = [
        ("/", None, "daily", "1.0"),
        ("/products", None, "daily", "0.9"),
        ("/about", None, "monthly", "0.6"),
        ("/quality", None, "monthly", "0.5"),
        ("/infrastructure", None, "monthly", "0.5"),
        ("/research", None, "monthly", "0.5"),
        ("/news", None, "weekly", "0.6"),
        ("/gallery", None, "monthly", "0.4"),
        ("/careers", None, "monthly", "0.4"),
        ("/contact", None, "monthly", "0.5"),
    ]
    cats = await db.categories.find({"active": True}, {"_id": 0, "slug": 1, "updated_at": 1}).to_list(1000)
    urls += [(f"/categories/{c['slug']}", c.get("updated_at"), "weekly", "0.7") for c in cats if c.get("slug")]
    prods = await db.products.find({"active": True}, {"_id": 0, "slug": 1, "updated_at": 1, "created_at": 1}).to_list(5000)
    urls += [(f"/products/{p['slug']}", p.get("updated_at") or p.get("created_at"), "weekly", "0.8") for p in prods if p.get("slug")]
    news = await db.news.find({"active": True}, {"_id": 0, "slug": 1, "updated_at": 1, "publish_date": 1}).to_list(2000)
    urls += [(f"/news/{n['slug']}", n.get("updated_at") or n.get("publish_date"), "monthly", "0.5") for n in news if n.get("slug")]
    return urls


@app.get("/api/sitemap.xml")
async def sitemap():
    base = _site_base()
    parts = []
    for path, lastmod, cf, pr in await _sitemap_urls():
        lm = f"<lastmod>{_xml_escape(str(lastmod)[:10])}</lastmod>" if lastmod else ""
        parts.append(f"<url><loc>{base}{path}</loc>{lm}<changefreq>{cf}</changefreq><priority>{pr}</priority></url>")
    xml = ('<?xml version="1.0" encoding="UTF-8"?>'
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + "".join(parts) + "</urlset>")
    return Response(content=xml, media_type="application/xml")


@app.get("/api/robots.txt")
async def robots():
    base = _site_base()
    lines = [
        "User-agent: *",
        "Allow: /",
        "Disallow: /admin",
        "Disallow: /account",
        "Disallow: /cart",
        "Disallow: /checkout",
        "Disallow: /order-confirmed",
        "Disallow: /api/admin",
        "Allow: /api/uploads",
        "",
        f"Sitemap: {base}/sitemap.xml",
    ]
    return PlainTextResponse("\n".join(lines) + "\n")


app.include_router(auth_routes.router)
app.include_router(catalog.router)
app.include_router(orders.router)
app.include_router(cms.router)
app.include_router(admin_routes.router)
app.include_router(tickets.router)
app.include_router(quotations.router)
app.include_router(pricing.router)
app.include_router(seo.router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await db.admin_users.create_index("email", unique=True)
    await db.customers.create_index("mobile")
    await db.customers.create_index("normalized_mobile")
    await db.login_attempts.create_index("identifier")
    await db.products.create_index("slug")
    await db.categories.create_index("slug")
    await db.orders.create_index("order_number")
    await run_seed(db)
    await run_seed_tickets(db)
    await migrate_customers(db)
    await pricing.ensure_settings()


async def migrate_customers(db):
    """Grandfather existing customers as active/approved and backfill normalized_mobile."""
    from helpers import normalize_mobile
    async for c in db.customers.find({"$or": [{"status": {"$exists": False}}, {"normalized_mobile": {"$exists": False}}]},
                                     {"_id": 0, "id": 1, "mobile": 1, "status": 1}):
        upd = {}
        if not c.get("status"):
            upd["status"] = "active"
        upd["normalized_mobile"] = normalize_mobile(c.get("mobile", ""))
        await db.customers.update_one({"id": c["id"]}, {"$set": upd})
    logger.info("VETMECH backend ready")


@app.on_event("shutdown")
async def shutdown():
    pass
