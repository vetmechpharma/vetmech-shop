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

from db import db
from security import get_current_admin
from seed_data import run_seed
from routers import auth_routes, catalog, orders, cms, admin_routes

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("vetmech")

app = FastAPI(title="VETMECH Pharmaceuticals API")

UPLOAD_DIR = ROOT_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)


@app.get("/api/")
async def root():
    return {"message": "VETMECH Pharmaceuticals API", "status": "ok"}


# --- File upload (images / PDFs) stored on disk, served via /api/uploads ---
@app.post("/api/admin/upload")
async def upload_file(file: UploadFile = File(...), admin=Depends(get_current_admin)):
    ext = os.path.splitext(file.filename or "")[1].lower()
    allowed = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".pdf", ".svg"}
    if ext not in allowed:
        raise HTTPException(status_code=400, detail="File type not allowed")
    data = await file.read()
    if len(data) > 12 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 12MB)")
    name = f"{uuid.uuid4().hex}{ext}"
    (UPLOAD_DIR / name).write_bytes(data)
    backend_url = os.environ.get("REACT_APP_BACKEND_URL", "")
    return {"url": f"/api/uploads/{name}"}


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
    await db.products.create_index("slug")
    await db.categories.create_index("slug")
    await db.orders.create_index("order_number")
    await run_seed(db)
    logger.info("VETMECH backend ready")


@app.on_event("shutdown")
async def shutdown():
    pass
