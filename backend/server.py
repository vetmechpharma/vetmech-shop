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
from routers import auth_routes, catalog, orders, cms, admin_routes, tickets, quotations, pricing

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
                 ".svg": "image/svg+xml"}


@app.get("/api/uploads/{name}")
async def serve_upload(name: str):
    path = UPLOAD_DIR / name
    if not path.exists() or ".." in name:
        raise HTTPException(status_code=404, detail="Not found")
    ext = os.path.splitext(name)[1].lower()
    return Response(content=path.read_bytes(),
                    media_type=CONTENT_TYPES.get(ext, "application/octet-stream"))


@app.get("/api/sitemap.xml")
async def sitemap():
    base = os.environ.get("SITE_URL", "")
    urls = ["/", "/products", "/about", "/quality", "/news", "/gallery", "/careers", "/contact"]
    products = await db.products.find({"active": True}, {"_id": 0, "slug": 1}).to_list(1000)
    urls += [f"/products/{p['slug']}" for p in products if p.get("slug")]
    news = await db.news.find({"active": True}, {"_id": 0, "slug": 1}).to_list(1000)
    urls += [f"/news/{n['slug']}" for n in news if n.get("slug")]
    items = "".join([f"<url><loc>{base}{u}</loc></url>" for u in urls])
    xml = f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{items}</urlset>'
    return Response(content=xml, media_type="application/xml")


@app.get("/api/robots.txt")
async def robots():
    return PlainTextResponse("User-agent: *\nAllow: /\n")


app.include_router(auth_routes.router)
app.include_router(catalog.router)
app.include_router(orders.router)
app.include_router(cms.router)
app.include_router(admin_routes.router)
app.include_router(tickets.router)
app.include_router(quotations.router)
app.include_router(pricing.router)

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
